/**
 * routes/auth.js — Login, registration, password change, StB connection.
 *
 * All endpoints under /api/auth share the strict `authLimiter` rate-limit
 * defined in index.js so brute-force attempts on /login get throttled.
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth, sign } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { validate } = require('../middleware/validate');
const { audit } = require('../services/audit');

const router = express.Router();

// ── Helper: hydrate role-specific profile for a user ────────────────────────
function loadProfile(db, user) {
  if (user.role === 'steuerberater') {
    return db.get('SELECT * FROM steuerberater WHERE user_id = ?', [user.id]);
  }
  if (user.role === 'unternehmen') {
    return db.get(
      `SELECT u.*,
              s.firm_name   AS stb_firm,
              s.theme_color AS stb_color,
              s.theme_accent AS stb_accent,
              s.logo_url    AS stb_logo
       FROM unternehmen u
       LEFT JOIN steuerberater s ON u.stb_id = s.id
       WHERE u.user_id = ?`,
      [user.id]
    );
  }
  return null;
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post(
  '/login',
  validate({
    email:    { type: 'email',  required: true },
    password: { type: 'string', required: true, min: 1, max: 200 },
  }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const db = getDb();
    const user = db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);

    if (!user) {
      audit({ action: 'auth.login.fail', meta: { email, reason: 'unknown_user' }, req });
      throw httpError(401, 'Ungültige Anmeldedaten');
    }
    if (!user.is_active) {
      audit({ action: 'auth.login.fail', user, meta: { reason: 'disabled' }, req });
      throw httpError(403, 'Konto deaktiviert');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      audit({ action: 'auth.login.fail', user, meta: { reason: 'bad_password' }, req });
      throw httpError(401, 'Ungültige Anmeldedaten');
    }

    db.run('UPDATE users SET last_login = ? WHERE id = ?', [now(), user.id]);
    audit({ action: 'auth.login', user, req });

    const profile = loadProfile(db, user);
    const token = sign({ id: user.id, email: user.email, role: user.role, name: user.name });
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
      profile,
    });
  })
);

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get(
  '/me',
  auth(),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = db.get(
      'SELECT id,email,role,name,is_active,created_at,last_login FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) throw httpError(404, 'Nicht gefunden');
    const profile = loadProfile(db, user);
    res.json({ user, profile });
  })
);

// ── PUT /api/auth/password ──────────────────────────────────────────────────
router.put(
  '/password',
  auth(),
  validate({
    current:     { type: 'string', required: true },
    newPassword: { type: 'string', required: true, min: 8, max: 200 },
  }),
  asyncHandler(async (req, res) => {
    const { current, newPassword } = req.body;
    const db = getDb();
    const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const ok = await bcrypt.compare(current, user.password_hash);
    if (!ok) throw httpError(400, 'Aktuelles Passwort falsch');

    const hash = await bcrypt.hash(newPassword, 12);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    audit({ action: 'auth.password.change', user: req.user, req });
    res.json({ ok: true });
  })
);

// ── POST /api/auth/register — Standalone Unternehmen self-registration ──────
router.post(
  '/register',
  validate({
    email:     { type: 'email',  required: true },
    password:  { type: 'string', required: true, min: 8, max: 200 },
    name:      { type: 'string', required: true, min: 2, max: 100 },
    firm_name: { type: 'string', required: true, min: 2, max: 200 },
  }),
  asyncHandler(async (req, res) => {
    const { email, password, name, firm_name, stb_code } = req.body;
    const db = getDb();

    const exists = db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists) throw httpError(409, 'E-Mail bereits registriert');

    // Optional Steuerberater code resolution
    let stbId = null;
    if (stb_code) {
      const stb = db.get('SELECT id FROM steuerberater WHERE id = ?', [stb_code]);
      if (stb) stbId = stb.id;
    }

    const userId = uuid();
    const smeId  = uuid();
    const ts     = () => now();
    const hash   = await bcrypt.hash(password, 12);

    db.run(
      'INSERT INTO users (id,email,password_hash,role,name,created_at) VALUES (?,?,?,?,?,?)',
      [userId, email.toLowerCase(), hash, 'unternehmen', name, ts()]
    );
    db.run(
      'INSERT INTO unternehmen (id,user_id,stb_id,firm_name,invoice_prefix,created_at) VALUES (?,?,?,?,?,?)',
      [smeId, userId, stbId, firm_name, 'RE', ts()]
    );

    const token = sign({ id: userId, email: email.toLowerCase(), role: 'unternehmen', name });
    const profile = db.get('SELECT * FROM unternehmen WHERE id = ?', [smeId]);
    audit({
      action: 'auth.register',
      user: { id: userId, email: email.toLowerCase() },
      refType: 'unternehmen',
      refId: smeId,
      meta: { firm_name, stb_id: stbId },
      req,
    });
    res.status(201).json({
      token,
      user: { id: userId, email, role: 'unternehmen', name },
      profile,
    });
  })
);

// ── POST /api/auth/connect-stb ──────────────────────────────────────────────
router.post(
  '/connect-stb',
  auth(['unternehmen']),
  validate({ stb_id: { type: 'string', required: true } }),
  asyncHandler(async (req, res) => {
    const { stb_id } = req.body;
    const db  = getDb();
    const stb = db.get('SELECT id, firm_name FROM steuerberater WHERE id = ?', [stb_id]);
    if (!stb) throw httpError(404, 'Steuerberater nicht gefunden');

    db.run('UPDATE unternehmen SET stb_id = ? WHERE user_id = ?', [stb_id, req.user.id]);
    res.json({ ok: true, stb_firm: stb.firm_name });
  })
);

module.exports = router;
