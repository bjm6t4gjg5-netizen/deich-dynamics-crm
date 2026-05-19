/**
 * routes/recurring.js — Wiederkehrende Rechnungen.
 *
 * A template stores frequency + next_due. On every server start (and on
 * demand) we sweep and emit a real invoice for every template whose
 * next_due ≤ today, then bump next_due forward.
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

function getSme(userId) {
  return getDb().get('SELECT * FROM unternehmen WHERE user_id = ?', [userId]);
}

function addInterval(dateStr, freq) {
  const d = new Date(dateStr);
  if (freq === 'monthly')   d.setMonth(d.getMonth() + 1);
  if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
  if (freq === 'yearly')    d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function sweepDue(db, smeId) {
  const today = new Date().toISOString().slice(0, 10);
  const templates = db.all(
    'SELECT * FROM recurring_invoices WHERE unternehmen_id = ? AND active = 1 AND next_due <= ?',
    [smeId, today]
  );
  let generated = 0;
  for (const t of templates) {
    if (t.end_date && t.end_date < today) continue;
    const sme = db.get('SELECT * FROM unternehmen WHERE id = ?', [t.unternehmen_id]);
    const counter = sme.invoice_counter || 1;
    const year = new Date().getFullYear();
    const invNum = `${sme.invoice_prefix || 'RE'}-${year}-${String(counter).padStart(3, '0')}`;
    db.run('UPDATE unternehmen SET invoice_counter = ? WHERE id = ?', [counter + 1, t.unternehmen_id]);

    const items = JSON.parse(t.line_items || '[]');
    const net = items.length
      ? items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0)
      : (t.net || 0);
    const vat = net * (t.vat_rate || 19) / 100;

    let log = [];
    try { log = JSON.parse(t.generated_log || '[]'); } catch { log = []; }
    // Don't re-generate if this period was already covered
    if (log.find((l) => l.date === today)) continue;
    const newInvId = uuid();
    db.run(`
      INSERT INTO invoices (id, unternehmen_id, customer_id, invoice_number, client_name, description, line_items, net, vat, gross, vat_rate, status, date, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newInvId, t.unternehmen_id, t.customer_id, invNum, t.client_name, t.description || '',
       JSON.stringify(items), net, vat, net + vat, t.vat_rate || 19, 'Entwurf', today, now()]
    );
    log.push({ date: today, invoice_id: newInvId, invoice_number: invNum, generated_at: now() });
    db.run(
      'UPDATE recurring_invoices SET next_due = ?, last_generated = ?, last_invoice_id = ?, generated_log = ? WHERE id = ?',
      [addInterval(t.next_due, t.frequency), today, newInvId, JSON.stringify(log), t.id]
    );
    generated++;
  }
  return generated;
}

router.get('/', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  res.json(db.all('SELECT * FROM recurring_invoices WHERE unternehmen_id = ? ORDER BY created_at DESC', [sme.id]));
}));

router.post('/', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  const { customer_id, client_name, description, line_items, vat_rate, frequency, start_date, end_date } = req.body;
  if (!client_name || !frequency || !start_date) throw httpError(400, 'client_name, frequency, start_date erforderlich');
  if (!['monthly', 'quarterly', 'yearly'].includes(frequency)) throw httpError(400, 'Ungültige Frequency');

  const items = Array.isArray(line_items) ? line_items : [];
  const net = items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0);
  const id = uuid();
  db.run(`
    INSERT INTO recurring_invoices (id, unternehmen_id, customer_id, client_name, description, line_items, net, vat_rate, frequency, start_date, end_date, next_due, active, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, sme.id, customer_id || null, client_name, description || '', JSON.stringify(items),
     net, parseInt(vat_rate) || 19, frequency, start_date, end_date || null, start_date, 1, now()]
  );
  res.status(201).json({ id });
}));

router.put('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  const t   = db.get('SELECT * FROM recurring_invoices WHERE id = ? AND unternehmen_id = ?', [req.params.id, sme.id]);
  if (!t) throw httpError(404, 'Template nicht gefunden');

  const { active, end_date, client_name, description, frequency, next_due, line_items, vat_rate } = req.body;
  const itemsJson = line_items !== undefined ? JSON.stringify(line_items) : t.line_items;
  db.run(
    `UPDATE recurring_invoices SET
       active=?, end_date=?, client_name=?, description=?, frequency=?, next_due=?,
       line_items=?, vat_rate=?
     WHERE id=?`,
    [active === undefined ? t.active : (active ? 1 : 0), end_date ?? t.end_date,
     client_name ?? t.client_name, description ?? t.description,
     frequency ?? t.frequency, next_due ?? t.next_due,
     itemsJson, vat_rate ?? t.vat_rate, req.params.id]
  );
  res.json({ ok: true });
}));

router.delete('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  db.run('DELETE FROM recurring_invoices WHERE id = ? AND unternehmen_id = ?', [req.params.id, sme.id]);
  res.json({ ok: true });
}));

// Generate a single invoice for an abo's current next_due date
// Refuses to double-generate for the same date: if generated_log already has
// an entry for `date` AND that invoice still exists, returns that invoice
// so the UI can switch its button to "Rechnung öffnen".
router.post('/:id/generate', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  const t   = db.get('SELECT * FROM recurring_invoices WHERE id = ? AND unternehmen_id = ?', [req.params.id, sme.id]);
  if (!t) throw httpError(404, 'Template nicht gefunden');

  let log = [];
  try { log = JSON.parse(t.generated_log || '[]'); } catch { log = []; }
  const date = req.body.date || t.next_due || new Date().toISOString().slice(0, 10);

  // Already generated for this date?
  const prior = log.find((l) => l.date === date);
  if (prior) {
    const existingInv = db.get('SELECT id, invoice_number FROM invoices WHERE id = ? AND unternehmen_id = ?', [prior.invoice_id, sme.id]);
    if (existingInv) {
      return res.json({
        ok: true,
        already_existed: true,
        invoice_id: existingInv.id,
        invoice_number: existingInv.invoice_number,
      });
    }
    // The earlier invoice is gone (deleted) — fall through and generate a new one.
  }

  const counter = sme.invoice_counter || 1;
  const year = new Date().getFullYear();
  const invNum = `${sme.invoice_prefix || 'RE'}-${year}-${String(counter).padStart(3, '0')}`;
  db.run('UPDATE unternehmen SET invoice_counter = ? WHERE id = ?', [counter + 1, sme.id]);

  const items = JSON.parse(t.line_items || '[]');
  const net = items.length
    ? items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0)
    : (t.net || 0);
  const vat = net * (t.vat_rate || 19) / 100;
  const id = uuid();

  db.run(`
    INSERT INTO invoices (id, unternehmen_id, customer_id, invoice_number, client_name, description, line_items, net, vat, gross, vat_rate, status, date, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, sme.id, t.customer_id, invNum, t.client_name, t.description || '',
     JSON.stringify(items), net, vat, net + vat, t.vat_rate || 19, 'Entwurf', date, now()]
  );

  log = log.filter((l) => l.date !== date);
  log.push({ date, invoice_id: id, invoice_number: invNum, generated_at: now() });

  db.run('UPDATE recurring_invoices SET next_due = ?, last_generated = ?, last_invoice_id = ?, generated_log = ? WHERE id = ?',
    [addInterval(t.next_due, t.frequency), date, id, JSON.stringify(log), t.id]);

  res.json({ ok: true, invoice_id: id, invoice_number: invNum });
}));

router.post('/sweep', smeAuth, asyncHandler(async (req, res) => {
  const sme = getSme(req.user.id);
  const generated = sweepDue(getDb(), sme.id);
  res.json({ ok: true, generated });
}));

module.exports = router;
module.exports.sweepDue = sweepDue;
