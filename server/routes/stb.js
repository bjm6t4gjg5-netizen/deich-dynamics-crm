const express  = require('express');
const bcrypt   = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router  = express.Router();
const stbAuth = auth(['steuerberater', 'superadmin']);
const ts = () => now();

function getStbId(userId) {
  return getDb().get('SELECT id FROM steuerberater WHERE user_id = ?', [userId])?.id;
}

// GET /api/stb/profile
router.get('/profile', stbAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const stb = db.get(`
    SELECT s.*, u.email, u.name, u.last_login
    FROM steuerberater s JOIN users u ON s.user_id=u.id
    WHERE s.user_id = ?`, [req.user.id]);
  if (!stb) return res.status(404).json({ error: 'Profil nicht gefunden' });
  // Hide sensitive mail credentials in response
  delete stb.mail_pass;
  delete stb.sendgrid_key;
  delete stb.resend_key;
  res.json(stb);
}));

// PUT /api/stb/profile
router.put('/profile', stbAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    firm_name, address, phone, website,
    theme_color, theme_accent, theme_mode,
    mail_provider, mail_host, mail_port, mail_user, mail_pass, mail_from,
    sendgrid_key, resend_key,
  } = req.body;

  db.run(`UPDATE steuerberater SET
    firm_name=?, address=?, phone=?, website=?,
    theme_color=?, theme_accent=?, theme_mode=?,
    mail_provider=?, mail_host=?, mail_port=?, mail_user=?,
    mail_pass=COALESCE(NULLIF(?,NULL), mail_pass),
    mail_from=?,
    sendgrid_key=COALESCE(NULLIF(?,NULL), sendgrid_key),
    resend_key=COALESCE(NULLIF(?,NULL), resend_key)
    WHERE user_id=?`,
    [firm_name, address, phone, website,
     theme_color, theme_accent, theme_mode,
     mail_provider, mail_host, mail_port || 587, mail_user,
     mail_pass || null, mail_from,
     sendgrid_key || null, resend_key || null,
     req.user.id]);
  res.json({ ok: true });
}));

// GET /api/stb/stats
router.get('/stats', stbAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const stbId = getStbId(req.user.id);
  if (!stbId) return res.status(404).json({ error: 'StB nicht gefunden' });

  const stb = db.get('SELECT commission_rate FROM steuerberater WHERE id = ?', [stbId]);
  const clientCount = db.get('SELECT COUNT(*) as c FROM unternehmen WHERE stb_id = ?', [stbId]).c;
  const paidVol     = db.get(`
    SELECT COALESCE(SUM(i.gross),0) as t
    FROM invoices i JOIN unternehmen u ON i.unternehmen_id=u.id
    WHERE u.stb_id = ? AND i.status = ?`, [stbId, 'Bezahlt']).t;
  const missing     = db.get(`
    SELECT COUNT(*) as c FROM expenses e JOIN unternehmen u ON e.unternehmen_id=u.id
    WHERE u.stb_id = ? AND e.has_receipt = ?`, [stbId, 0]).c;

  res.json({
    clientCount,
    paidVol,
    commission: paidVol * (stb?.commission_rate || 0.25),
    missingReceipts: missing,
  });
}));

// GET /api/stb/clients
router.get('/clients', stbAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const stbId = getStbId(req.user.id);
  if (!stbId) return res.status(404).json({ error: 'StB nicht gefunden' });

  res.json(db.all(`
    SELECT ub.*, u.email, u.name AS user_name, u.is_active, u.last_login,
      (SELECT COUNT(*) FROM invoices i WHERE i.unternehmen_id=ub.id) AS invoice_count,
      (SELECT COALESCE(SUM(gross),0) FROM invoices i WHERE i.unternehmen_id=ub.id AND i.status='Offen') AS open_amount,
      (SELECT COUNT(*) FROM expenses e WHERE e.unternehmen_id=ub.id AND e.has_receipt=0) AS missing_receipts
    FROM unternehmen ub JOIN users u ON ub.user_id=u.id
    WHERE ub.stb_id = ?
    ORDER BY ub.created_at DESC`, [stbId]));
}));

// GET /api/stb/clients/:id
router.get('/clients/:id', stbAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const stbId = getStbId(req.user.id);
  if (!stbId) return res.status(404).json({ error: 'StB nicht gefunden' });

  const client = db.get(`
    SELECT ub.*, u.email, u.name AS user_name FROM unternehmen ub
    JOIN users u ON ub.user_id=u.id
    WHERE ub.id = ? AND ub.stb_id = ?`, [req.params.id, stbId]);
  if (!client) return res.status(403).json({ error: 'Kein Zugriff' });

  const invoices = db.all('SELECT * FROM invoices WHERE unternehmen_id = ? ORDER BY created_at DESC LIMIT 20', [req.params.id]);
  const expenses = db.all('SELECT * FROM expenses WHERE unternehmen_id = ? ORDER BY created_at DESC LIMIT 20', [req.params.id]);

  res.json({ client, invoices, expenses });
}));

// POST /api/stb/clients  — create new Unternehmen under this StB
router.post('/clients', stbAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const stbId = getStbId(req.user.id);
  if (!stbId) return res.status(404).json({ error: 'StB nicht gefunden' });

  const { email, name, password, firm_name, legal_form, city, plz, ust_id, iban } = req.body;
  if (!email || !name || !password || !firm_name)
    return res.status(400).json({ error: 'email, name, password, firm_name erforderlich' });

  const exists = db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'E-Mail bereits vergeben' });

  const hash   = await bcrypt.hash(password, 12);
  const userId = uuid(), smeId = uuid();
  db.run('INSERT INTO users (id,email,password_hash,role,name,created_at) VALUES (?,?,?,?,?,?)',
    [userId, email.toLowerCase(), hash, 'unternehmen', name, ts()]);
  db.run(`INSERT INTO unternehmen (id,user_id,stb_id,firm_name,legal_form,city,plz,ust_id,iban,invoice_prefix,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [smeId, userId, stbId, firm_name, legal_form || 'GmbH', city || '', plz || '', ust_id || '', iban || '', 'RE', ts()]);

  res.status(201).json({ id: smeId, message: 'Mandant angelegt' });
}));

// PUT /api/stb/clients/:id/modules
router.put('/clients/:id/modules', stbAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const stbId = getStbId(req.user.id);
  const client = db.get('SELECT id FROM unternehmen WHERE id = ? AND stb_id = ?', [req.params.id, stbId]);
  if (!client) return res.status(403).json({ error: 'Kein Zugriff' });
  db.run('UPDATE unternehmen SET modules = ? WHERE id = ?', [JSON.stringify(req.body), req.params.id]);
  res.json({ ok: true });
}));

// GET /api/stb/commissions
router.get('/commissions', stbAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const stbId = getStbId(req.user.id);
  if (!stbId) return res.status(404).json({ error: 'StB nicht gefunden' });

  const stb     = db.get('SELECT commission_rate FROM steuerberater WHERE id = ?', [stbId]);
  const clients = db.all(`
    SELECT ub.id, ub.firm_name, ub.legal_form, u.email,
      (SELECT COALESCE(SUM(gross),0) FROM invoices i WHERE i.unternehmen_id=ub.id AND i.status='Bezahlt') AS paid_vol
    FROM unternehmen ub JOIN users u ON ub.user_id=u.id
    WHERE ub.stb_id = ?`, [stbId]);

  res.json(clients.map(c => ({
    ...c,
    commission: c.paid_vol * (stb?.commission_rate || 0.25),
  })));
}));

module.exports = router;

// ── StB Logo upload ───────────────────────────────────────────────────────────
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const stbStorage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `stb-logo-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`),
});
const stbUpload = multer({ storage: stbStorage, limits: { fileSize: 2*1024*1024 } });
router.post('/logo', stbAuth, stbUpload.single('logo'), asyncHandler(async (req, res) => {
  const db = getDb();
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const url = `/uploads/${req.file.filename}`;
  db.run('UPDATE steuerberater SET logo_url = ? WHERE user_id = ?', [url, req.user.id]);
  res.json({ url });
}));
