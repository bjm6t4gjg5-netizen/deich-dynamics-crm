/**
 * routes/dunning.js — Dunning-level configuration per Unternehmen.
 *
 * Seeds three sensible defaults on first access (Erinnerung, 1. Mahnung,
 * 2. Mahnung). The UI uses these for the Mahnungs-Vorschau and to drive
 * future automated dunning runs.
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

const DEFAULTS = [
  { level: 1, name: 'Zahlungserinnerung', days_after_due: 7,  fee: 0,
    text_template: 'Wir möchten Sie freundlich daran erinnern, dass die unten genannte Rechnung noch offen ist.' },
  { level: 2, name: '1. Mahnung',         days_after_due: 14, fee: 5,
    text_template: 'Trotz unserer freundlichen Erinnerung haben wir Ihre Zahlung noch nicht erhalten. Bitte begleichen Sie den offenen Betrag umgehend.' },
  { level: 3, name: '2. Mahnung',         days_after_due: 30, fee: 10,
    text_template: 'Letzte Mahnung vor Übergabe an unser Inkassobüro. Bitte überweisen Sie den fälligen Betrag binnen 7 Tagen.' },
];

function getSmeId(userId) {
  return getDb().get('SELECT id FROM unternehmen WHERE user_id = ?', [userId])?.id;
}

function ensureDefaults(db, smeId) {
  const count = db.get('SELECT COUNT(*) AS c FROM dunning_levels WHERE unternehmen_id = ?', [smeId]).c;
  if (count > 0) return;
  for (const d of DEFAULTS) {
    db.run(
      'INSERT INTO dunning_levels (id, unternehmen_id, level, name, days_after_due, fee, text_template) VALUES (?,?,?,?,?,?,?)',
      [uuid(), smeId, d.level, d.name, d.days_after_due, d.fee, d.text_template]
    );
  }
}

router.get('/', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  ensureDefaults(db, smeId);
  res.json(db.all('SELECT * FROM dunning_levels WHERE unternehmen_id = ? ORDER BY level', [smeId]));
}));

router.put('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const l     = db.get('SELECT * FROM dunning_levels WHERE id = ? AND unternehmen_id = ?', [req.params.id, smeId]);
  if (!l) throw httpError(404, 'Mahnstufe nicht gefunden');
  const { name, days_after_due, fee, text_template } = req.body;
  db.run(
    'UPDATE dunning_levels SET name=?, days_after_due=?, fee=?, text_template=? WHERE id=?',
    [name ?? l.name, parseInt(days_after_due) ?? l.days_after_due, parseFloat(fee) ?? l.fee, text_template ?? l.text_template, req.params.id]
  );
  res.json({ ok: true });
}));

module.exports = router;
