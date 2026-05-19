/**
 * routes/quotes.js — Angebote.
 *
 * Single source of truth: Pipeline-Deals in einer Stage mit `is_quote = 1`.
 * Es gibt keine standalone Quotes-Tabelle mehr (Legacy entfernt, siehe Task #68).
 * Frühere standalone Quotes werden bei jedem Request migriert / verworfen.
 *
 * Routes:
 *   GET  /              → Liste der Pipeline-Angebote
 *   GET  /:dealId       → Einzeldeal als Quote
 *   POST /:dealId/convert → Erzeugt eine Rechnung aus dem Deal (mit Verknüpfung)
 *   DELETE /:dealId     → Verschiebt den Deal aus der Quote-Stage (= "Angebot löschen")
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

/** Internal: deal → quote-shape. */
function dealToQuote(d) {
  let items = [];
  try { items = JSON.parse(d.line_items || '[]'); } catch { items = []; }
  const net = items.length > 0
    ? items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0)
    : (d.value || 0);
  const vatRate = 19;
  const vat = net * vatRate / 100;
  return {
    id: d.id,
    pipeline_deal_id: d.id,
    customer_id: d.customer_id,
    quote_number: `AN-${(d.created_at || '').slice(0, 4) || new Date().getFullYear()}-${(d.id || '').slice(-4).toUpperCase()}`,
    client_name: d.company || d.name,
    description: d.name,
    line_items: d.line_items || '[]',
    net, vat, gross: net + vat,
    vat_rate: vatRate,
    status: d.stage_name || d.stage,
    valid_until: d.expected_close,
    converted_invoice_id: d.invoice_id || null,
    invoice_id: d.invoice_id || null,
    notes: d.notes,
    campaign_id: d.campaign_id,
    contact_person: d.contact_person,
    created_at: d.created_at,
    from_pipeline: true,
  };
}

router.get('/', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  const rows = db.all(`
    SELECT d.*, s.name AS stage_name, s.is_quote
    FROM deals d
    JOIN pipeline_stages s ON s.unternehmen_id = d.unternehmen_id AND s.name = d.stage
    WHERE d.unternehmen_id = ? AND s.is_quote = 1
    ORDER BY d.created_at DESC
  `, [sme.id]);
  res.json(rows.map(dealToQuote));
}));

router.get('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  const d = db.get(`
    SELECT d.*, s.name AS stage_name
    FROM deals d
    JOIN pipeline_stages s ON s.unternehmen_id = d.unternehmen_id AND s.name = d.stage
    WHERE d.id = ? AND d.unternehmen_id = ?
  `, [req.params.id, sme.id]);
  if (!d) throw httpError(404, 'Angebot nicht gefunden');
  res.json(dealToQuote(d));
}));

/** Erzeugt eine Rechnung aus dem Pipeline-Deal und verknüpft beide bidirektional. */
router.post('/:id/convert', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  const d = db.get('SELECT * FROM deals WHERE id = ? AND unternehmen_id = ?', [req.params.id, sme.id]);
  if (!d) throw httpError(404, 'Angebot nicht gefunden');
  if (d.invoice_id) throw httpError(400, 'Bereits in Rechnung umgewandelt');

  let items = [];
  try { items = JSON.parse(d.line_items || '[]'); } catch { items = []; }
  const net = items.length > 0
    ? items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0)
    : (d.value || 0);
  const vatRate = parseInt(sme.vat_rate || 19);
  const vat = net * vatRate / 100;

  const counter = sme.invoice_counter || 1;
  const year = new Date().getFullYear();
  const invNum = `${sme.invoice_prefix || 'RE'}-${year}-${String(counter).padStart(3, '0')}`;
  db.run('UPDATE unternehmen SET invoice_counter = ? WHERE id = ?', [counter + 1, sme.id]);

  const invoiceId = uuid();
  db.run(`
    INSERT INTO invoices (id, unternehmen_id, customer_id, invoice_number, client_name, description, line_items, net, vat, gross, vat_rate, status, date, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [invoiceId, sme.id, d.customer_id, invNum, d.company || d.name, d.name || '',
     JSON.stringify(items), net, vat, net + vat, vatRate, 'Entwurf', now().slice(0, 10), now()]
  );

  db.run('UPDATE deals SET invoice_id = ? WHERE id = ?', [invoiceId, d.id]);

  res.json({ ok: true, invoice_id: invoiceId, invoice_number: invNum });
}));

/** "Angebot löschen" = Deal komplett entfernen. Hat der Deal schon eine
 *  Rechnung, blocken wir hier und zwingen den User in den Pipeline-Move-Flow. */
router.delete('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  const d = db.get('SELECT * FROM deals WHERE id = ? AND unternehmen_id = ?', [req.params.id, sme.id]);
  if (!d) throw httpError(404, 'Angebot nicht gefunden');
  if (d.invoice_id) throw httpError(400, 'Angebot hat bereits eine Rechnung — bitte zuerst die Rechnung stornieren.');
  db.run('DELETE FROM deals WHERE id = ?', [d.id]);
  res.json({ ok: true });
}));

module.exports = router;
