/**
 * routes/activity.js — Customer activity timeline.
 *
 * Aggregates anything that touches a customer into one chronological stream:
 *   - Invoices issued
 *   - Notes (StB internal — only visible to StB)
 *   - Manual activity entries (call notes etc.)
 *   - Files uploaded
 *
 * Reads are unified; writes only target the `activities` table.
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

function getSmeId(userId) {
  return getDb().get('SELECT id FROM unternehmen WHERE user_id = ?', [userId])?.id;
}

router.get('/:customerId', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);

  const stream = [];

  // 1. Manual activities
  for (const a of db.all('SELECT * FROM activities WHERE unternehmen_id = ? AND customer_id = ? ORDER BY created_at DESC', [smeId, req.params.customerId])) {
    stream.push({ kind: a.type, title: a.title, body: a.body, at: a.created_at, ref: a.ref_id });
  }
  // 2. Invoices
  for (const i of db.all('SELECT * FROM invoices WHERE unternehmen_id = ? AND customer_id = ? ORDER BY created_at DESC', [smeId, req.params.customerId])) {
    stream.push({ kind: 'invoice', title: `Rechnung ${i.invoice_number}`, body: `${i.status} · ${i.description || ''}`, at: i.created_at, ref: i.id });
  }
  // 3. Files
  for (const f of db.all('SELECT * FROM customer_files WHERE customer_id = ? ORDER BY uploaded_at DESC', [req.params.customerId])) {
    stream.push({ kind: 'file', title: f.original_name, body: `${(f.size || 0)} Bytes`, at: f.uploaded_at, ref: f.id });
  }

  stream.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json(stream);
}));

router.post('/:customerId', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const { type, title, body } = req.body;
  if (!title || !type) return res.status(400).json({ error: 'type + title erforderlich' });
  const id = uuid();
  db.run(
    'INSERT INTO activities (id, unternehmen_id, customer_id, type, title, body, created_at) VALUES (?,?,?,?,?,?,?)',
    [id, smeId, req.params.customerId, type, title, body || null, now()]
  );
  res.status(201).json({ id });
}));

// GET /api/sme/activity/:customerId/dsgvo  — DSGVO data-subject access PDF
router.get('/:customerId/dsgvo', smeAuth, asyncHandler(async (req, res) => {
  const PDFDocument = require('pdfkit');
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const c     = db.get('SELECT * FROM customers WHERE id = ? AND unternehmen_id = ?', [req.params.customerId, smeId]);
  if (!c) return res.status(404).json({ error: 'Kunde nicht gefunden' });

  const invoices = db.all('SELECT * FROM invoices WHERE customer_id = ?', [c.id]);
  const files    = db.all('SELECT * FROM customer_files WHERE customer_id = ?', [c.id]);
  const acts     = db.all('SELECT * FROM activities WHERE customer_id = ?', [c.id]);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="dsgvo-auskunft-${c.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#1d3f36').text('DSGVO-Datenauskunft');
  doc.fontSize(10).fillColor('#666').text(`Erstellt am ${new Date().toLocaleDateString('de-DE')} · Art. 15 DSGVO`);
  doc.moveDown(2);

  doc.fontSize(13).fillColor('#000').text('Stammdaten').moveDown(0.3);
  doc.fontSize(10);
  for (const [label, value] of [
    ['Name',          c.name],
    ['Unternehmen',   c.company],
    ['E-Mail',        c.email],
    ['Telefon',       c.phone || c.mobile],
    ['Adresse',       [c.address, c.plz, c.city].filter(Boolean).join(', ')],
    ['Geburtstag',    c.birthday],
    ['Steuer-ID',     c.tax_id],
    ['Typ',           c.type],
    ['Status',        c.status],
    ['Notizen',       c.notes],
    ['Angelegt am',   c.created_at],
  ]) {
    if (!value) continue;
    doc.text(`${label}: ${value}`);
  }

  doc.moveDown(1).fontSize(13).text('Rechnungen').moveDown(0.3).fontSize(10);
  if (invoices.length === 0) doc.text('Keine Rechnungen gespeichert.');
  for (const i of invoices) {
    doc.text(`${i.invoice_number} · ${i.status} · € ${Number(i.gross).toFixed(2)} · ${i.date || ''}`);
  }

  doc.moveDown(1).fontSize(13).text('Dateien').moveDown(0.3).fontSize(10);
  if (files.length === 0) doc.text('Keine Dateien hochgeladen.');
  for (const f of files) doc.text(`${f.original_name} · ${f.uploaded_at}`);

  doc.moveDown(1).fontSize(13).text('Aktivitäten').moveDown(0.3).fontSize(10);
  if (acts.length === 0) doc.text('Keine zusätzlichen Aktivitäten erfasst.');
  for (const a of acts) doc.text(`${a.created_at} · ${a.type} · ${a.title}`);

  doc.moveDown(2).fontSize(9).fillColor('#999').text('Diese Auskunft enthält alle personenbezogenen Daten, die wir über die genannte Person gespeichert haben. Für Korrekturen oder Löschanfragen bitte den Datenschutzbeauftragten kontaktieren.');

  doc.end();
}));

module.exports = router;
