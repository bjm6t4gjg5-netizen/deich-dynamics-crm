const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();
const adminOnly = auth(['superadmin']);
const ts = () => now();

// GET /api/admin/stats
router.get('/stats', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  res.json({
    stbCount:    db.get('SELECT COUNT(*) as c FROM steuerberater').c,
    smeCount:    db.get('SELECT COUNT(*) as c FROM unternehmen').c,
    userCount:   db.get('SELECT COUNT(*) as c FROM users').c,
    invoiceVol:  db.get('SELECT COALESCE(SUM(gross),0) as t FROM invoices').t,
    paidVol:     db.get('SELECT COALESCE(SUM(gross),0) as t FROM invoices WHERE status = ?', ['Bezahlt']).t,
  });
}));

// ── Steuerberater ─────────────────────────────────────────────────────────────

router.get('/steuerberater', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  res.json(db.all(`
    SELECT s.*, u.email, u.name AS user_name, u.is_active, u.last_login,
      (SELECT COUNT(*) FROM unternehmen ub WHERE ub.stb_id = s.id) AS client_count,
      (SELECT COALESCE(SUM(i.gross),0) FROM invoices i JOIN unternehmen ub ON i.unternehmen_id=ub.id WHERE ub.stb_id=s.id AND i.status='Bezahlt') AS paid_vol
    FROM steuerberater s JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC`));
}));

router.post('/steuerberater', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  const { email, name, password, firm_name, address, phone, commission_rate } = req.body;
  if (!email || !name || !password || !firm_name)
    return res.status(400).json({ error: 'email, name, password, firm_name erforderlich' });

  const exists = db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'E-Mail bereits vergeben' });

  const hash   = await bcrypt.hash(password, 12);
  const userId = uuid(), stbId = uuid();
  db.run('INSERT INTO users (id,email,password_hash,role,name,created_at) VALUES (?,?,?,?,?,?)',
    [userId, email.toLowerCase(), hash, 'steuerberater', name, ts()]);
  db.run('INSERT INTO steuerberater (id,user_id,firm_name,address,phone,commission_rate,created_at) VALUES (?,?,?,?,?,?,?)',
    [stbId, userId, firm_name, address || '', phone || '', commission_rate || 0.25, ts()]);

  res.status(201).json({ id: stbId });
}));

// PUT /api/admin/steuerberater/:id — update features/appearance
router.put('/steuerberater/:id', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  const { firm_name, commission_rate, features, theme_color, theme_accent, theme_mode, is_active } = req.body;
  const stb = db.get('SELECT user_id FROM steuerberater WHERE id = ?', [req.params.id]);
  if (!stb) return res.status(404).json({ error: 'Nicht gefunden' });

  db.run(`UPDATE steuerberater SET firm_name=?, commission_rate=?, features=?, theme_color=?, theme_accent=?, theme_mode=? WHERE id=?`,
    [firm_name, commission_rate, features ? JSON.stringify(features) : null, theme_color, theme_accent, theme_mode, req.params.id]);

  if (is_active !== undefined)
    db.run('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, stb.user_id]);

  res.json({ ok: true });
}));

router.delete('/steuerberater/:id', adminOnly, asyncHandler(async (req, res) => {
  const db  = getDb();
  const stb = db.get('SELECT user_id FROM steuerberater WHERE id = ?', [req.params.id]);
  if (!stb) return res.status(404).json({ error: 'Nicht gefunden' });
  db.run('DELETE FROM users WHERE id = ?', [stb.user_id]); // cascade deletes stb row
  res.json({ ok: true });
}));

// ── Unternehmen ───────────────────────────────────────────────────────────────

router.get('/unternehmen', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  res.json(db.all(`
    SELECT ub.*, u.email, u.name AS user_name, u.is_active, u.last_login,
      s.firm_name AS stb_firm,
      (SELECT COUNT(*) FROM invoices i WHERE i.unternehmen_id=ub.id) AS invoice_count,
      (SELECT COALESCE(SUM(gross),0) FROM invoices i WHERE i.unternehmen_id=ub.id) AS total_vol
    FROM unternehmen ub JOIN users u ON ub.user_id=u.id
    LEFT JOIN steuerberater s ON ub.stb_id=s.id
    ORDER BY ub.created_at DESC`));
}));

router.post('/unternehmen', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  const { email, name, password, firm_name, legal_form, stb_id } = req.body;
  if (!email || !name || !password || !firm_name)
    return res.status(400).json({ error: 'Pflichtfelder fehlen' });

  const exists = db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'E-Mail bereits vergeben' });

  const hash   = await bcrypt.hash(password, 12);
  const userId = uuid(), smeId = uuid();
  db.run('INSERT INTO users (id,email,password_hash,role,name,created_at) VALUES (?,?,?,?,?,?)',
    [userId, email.toLowerCase(), hash, 'unternehmen', name, ts()]);
  db.run('INSERT INTO unternehmen (id,user_id,stb_id,firm_name,legal_form,invoice_prefix,created_at) VALUES (?,?,?,?,?,?,?)',
    [smeId, userId, stb_id || null, firm_name, legal_form || 'GmbH', 'RE', ts()]);

  res.status(201).json({ id: smeId });
}));

router.put('/unternehmen/:id', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  const { modules, theme_color, theme_accent, theme_mode, stb_id, is_active } = req.body;
  const sme = db.get('SELECT user_id FROM unternehmen WHERE id = ?', [req.params.id]);
  if (!sme) return res.status(404).json({ error: 'Nicht gefunden' });

  if (modules !== undefined)
    db.run('UPDATE unternehmen SET modules = ? WHERE id = ?', [JSON.stringify(modules), req.params.id]);
  if (stb_id !== undefined)
    db.run('UPDATE unternehmen SET stb_id = ? WHERE id = ?', [stb_id || null, req.params.id]);
  if (theme_color)
    db.run('UPDATE unternehmen SET theme_color=?,theme_accent=?,theme_mode=? WHERE id=?',
      [theme_color, theme_accent, theme_mode, req.params.id]);
  if (is_active !== undefined)
    db.run('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, sme.user_id]);

  res.json({ ok: true });
}));

// GET /api/admin/commissions
router.get('/commissions', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  res.json(db.all(`
    SELECT s.id, s.firm_name, s.commission_rate, u.email,
      (SELECT COUNT(*) FROM unternehmen ub WHERE ub.stb_id=s.id) AS client_count,
      (SELECT COALESCE(SUM(i.gross),0) FROM invoices i JOIN unternehmen ub ON i.unternehmen_id=ub.id WHERE ub.stb_id=s.id AND i.status='Bezahlt') AS paid_vol
    FROM steuerberater s JOIN users u ON s.user_id=u.id`).map(r => ({
      ...r, commission_eur: r.paid_vol * r.commission_rate
    })));
}));

module.exports = router;

// PUT /api/admin/unternehmen/:id/claude-key — set AI key for client
router.put('/unternehmen/:id/claude-key', adminOnly, asyncHandler(async (req, res) => {
  const db = getDb();
  const { claude_key } = req.body;
  db.run('UPDATE unternehmen SET claude_key = ? WHERE id = ?', [claude_key || null, req.params.id]);
  res.json({ ok: true });
}));
