/**
 * routes/backup.js — Full data export + restore using a custom `.meind` format.
 *
 * .meind is a ZIP container with:
 *   - manifest.json  → version, exported_at, unternehmen_id, integrity hash
 *   - data.json      → all per-tenant rows (customers, invoices, etc.)
 *   - uploads/       → all referenced files (logos, receipts, item images)
 *
 * The file is light-obfuscated by gz-compressing the JSON parts and XOR-
 * scrambling them with a derived key. NOT a real encryption scheme — it just
 * makes accidental opening harder. For real security we'd add a user-set
 * passphrase later.
 */

const express = require('express');
const crypto = require('crypto');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

function getSmeId(userId) {
  return getDb().get('SELECT id FROM unternehmen WHERE user_id = ?', [userId])?.id;
}

// Per-tenant key — different from MAIL_ENC_KEY so a leak there doesn't open backups.
function obfuscate(buf, key) {
  const k = crypto.scryptSync(`meind:${key}`, 'mein-dynamics-backup', 32);
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ k[i % k.length];
  return out;
}

// Tables we mirror in a backup. Order matters because of FK references on
// restore, but for export we just dump them all.
const TABLES = [
  'unternehmen', 'customers', 'customer_groups', 'customer_files',
  'invoices', 'expenses',
  'inventory_items', 'inventory_movements',
  'deals', 'pipeline_stages', 'campaigns',
  'quotes', 'recurring_invoices', 'dunning_levels',
  'activities', 'client_notes', 'email_log',
  'monthly_closings',
];

router.get('/export', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  if (!smeId) throw httpError(404, 'Kein Unternehmen');

  const data = {};
  for (const t of TABLES) {
    try {
      data[t] = db.all(`SELECT * FROM ${t} WHERE unternehmen_id = ? OR id = ?`, [smeId, smeId]);
    } catch { data[t] = []; }
  }

  // Build the manifest + integrity hash
  const manifest = {
    format: 'meind/1.0',
    exported_at: new Date().toISOString(),
    unternehmen_id: smeId,
    table_counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  manifest.integrity_sha256 = hash;

  const dataBuf = Buffer.from(JSON.stringify(data));
  const obfBuf  = obfuscate(dataBuf, smeId);

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('data.bin', obfBuf);

  // Pull referenced upload files
  const uploadDir = path.join(__dirname, '..', 'uploads');
  const collectFiles = (urlPaths) => {
    for (const u of urlPaths) {
      if (!u) continue;
      const rel = u.replace(/^\/uploads\//, '');
      const abs = path.join(uploadDir, rel);
      try {
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          zip.file(`uploads/${rel}`, fs.readFileSync(abs));
        }
      } catch { /* skip */ }
    }
  };
  collectFiles((data.inventory_items || []).map((i) => i.image_url));
  collectFiles((data.expenses || []).map((e) => e.receipt_url));
  collectFiles((data.unternehmen || []).map((u) => u.logo_url));
  collectFiles((data.customer_files || []).map((f) => f.filename ? `/uploads/${f.filename}` : null));

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = `mein-dynamics-backup-${new Date().toISOString().slice(0, 10)}.meind`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}));

// Restore endpoint — accepts a .meind file (multipart), validates the manifest,
// and re-inserts the rows. Only adds rows that don't already exist by id.
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

/** Preview — read manifest + table_counts without actually applying anything.
 *  Lets the frontend wizard show "X Kunden, Y Rechnungen…" and a confirmation. */
router.post('/restore/preview', smeAuth, upload.single('file'), asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  if (!req.file) throw httpError(400, 'Keine Datei hochgeladen');
  const zip = await JSZip.loadAsync(req.file.buffer);
  const manifestStr = await zip.file('manifest.json')?.async('string');
  if (!manifestStr) throw httpError(400, 'Kein manifest.json — keine gültige .meind-Datei');
  const manifest = JSON.parse(manifestStr);
  if (!manifest.format?.startsWith('meind/')) throw httpError(400, 'Unbekanntes Format');

  // Count current rows so we can show "you have X today, backup has Y"
  const db = getDb();
  const currentCounts = {};
  for (const t of TABLES) {
    try {
      currentCounts[t] = db.get(`SELECT COUNT(*) AS c FROM ${t} WHERE unternehmen_id = ? OR id = ?`, [smeId, smeId])?.c || 0;
    } catch { currentCounts[t] = 0; }
  }

  // File list with sizes
  const fileEntries = [];
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith('uploads/') && !zip.files[name].dir) {
      const data = await zip.file(name).async('nodebuffer');
      fileEntries.push({ name: name.replace('uploads/', ''), size: data.length });
    }
  }

  res.json({
    manifest,
    current_counts: currentCounts,
    upload_files: fileEntries.slice(0, 50), // limit response size
    total_upload_files: fileEntries.length,
    different_tenant: manifest.unternehmen_id !== smeId,
  });
}));

router.post('/restore', smeAuth, upload.single('file'), asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  if (!req.file) throw httpError(400, 'Keine Datei hochgeladen');

  const zip = await JSZip.loadAsync(req.file.buffer);
  const manifestStr = await zip.file('manifest.json')?.async('string');
  if (!manifestStr) throw httpError(400, 'Kein manifest.json — keine gültige .meind-Datei');
  const manifest = JSON.parse(manifestStr);
  if (!manifest.format?.startsWith('meind/')) throw httpError(400, 'Unbekanntes Format');

  const dataBin = await zip.file('data.bin')?.async('nodebuffer');
  if (!dataBin) throw httpError(400, 'Daten fehlen');
  const dataBuf = obfuscate(dataBin, manifest.unternehmen_id);
  let data;
  try { data = JSON.parse(dataBuf.toString()); }
  catch { throw httpError(400, 'Daten konnten nicht entschlüsselt werden — Backup zu einem anderen Unternehmen?'); }

  // Optional: verify integrity hash
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  if (manifest.integrity_sha256 && manifest.integrity_sha256 !== hash) {
    throw httpError(400, 'Integritätsprüfung fehlgeschlagen — Datei beschädigt');
  }

  let inserted = 0, skipped = 0;
  for (const t of TABLES) {
    for (const row of (data[t] || [])) {
      // Force unternehmen_id to current user's tenant — never restore into a foreign account.
      if (row.unternehmen_id && row.unternehmen_id !== smeId) row.unternehmen_id = smeId;
      try {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(',');
        db.run(`INSERT OR IGNORE INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`, cols.map((c) => row[c]));
        inserted++;
      } catch { skipped++; }
    }
  }

  // Restore upload files
  const uploadDir = path.join(__dirname, '..', 'uploads');
  for (const filename of Object.keys(zip.files)) {
    if (!filename.startsWith('uploads/')) continue;
    const f = zip.file(filename);
    if (!f || f.dir) continue;
    const rel = filename.replace(/^uploads\//, '');
    const abs = path.join(uploadDir, rel);
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, await f.async('nodebuffer'));
    } catch { /* skip */ }
  }

  res.json({ ok: true, inserted, skipped, manifest });
}));

module.exports = router;
