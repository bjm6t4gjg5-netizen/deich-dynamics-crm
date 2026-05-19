/**
 * routes/customer-groups.js — Custom customer groups (branches/segments) per
 * Unternehmen.
 *
 * Customers reference a group by name (via the existing customers.group_name
 * column) instead of by FK — keeps backwards compatibility with the prior
 * static enum and lets users rename groups freely without cascading FK churn.
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { validate } = require('../middleware/validate');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

// Initial defaults seeded on first access so the dropdown isn't empty.
const DEFAULT_GROUPS = ['Handel', 'Bau', 'IT', 'Beratung', 'Handwerk', 'Gesundheit', 'Sonstiges'];

function getSmeId(userId) {
  return getDb().get('SELECT id FROM unternehmen WHERE user_id = ?', [userId])?.id;
}

function ensureSeed(db, smeId) {
  const count = db.get('SELECT COUNT(*) AS c FROM customer_groups WHERE unternehmen_id = ?', [smeId]).c;
  if (count > 0) return;
  for (const name of DEFAULT_GROUPS) {
    try {
      db.run(
        'INSERT INTO customer_groups (id, unternehmen_id, name, created_at) VALUES (?,?,?,?)',
        [uuid(), smeId, name, now()]
      );
    } catch { /* duplicate via race — ignore */ }
  }
}

router.get('/', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  ensureSeed(db, smeId);
  res.json(db.all('SELECT * FROM customer_groups WHERE unternehmen_id = ? ORDER BY name', [smeId]));
}));

router.post('/',
  smeAuth,
  validate({ name: { type: 'string', required: true, min: 1, max: 80 } }),
  asyncHandler(async (req, res) => {
    const db    = getDb();
    const smeId = getSmeId(req.user.id);
    const id    = uuid();
    try {
      db.run(
        'INSERT INTO customer_groups (id, unternehmen_id, name, color, created_at) VALUES (?,?,?,?,?)',
        [id, smeId, req.body.name.trim(), req.body.color || null, now()]
      );
    } catch (e) {
      // UNIQUE constraint hit → group already exists
      throw httpError(409, `Gruppe „${req.body.name}" existiert bereits`);
    }
    res.status(201).json({ id });
  })
);

router.put('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const g     = db.get('SELECT * FROM customer_groups WHERE id = ? AND unternehmen_id = ?', [req.params.id, smeId]);
  if (!g) throw httpError(404, 'Gruppe nicht gefunden');

  const newName = (req.body.name || '').trim();
  if (!newName) throw httpError(400, 'Name erforderlich');

  db.run('UPDATE customer_groups SET name = ?, color = ? WHERE id = ?', [newName, req.body.color || null, req.params.id]);
  // Cascade rename to customers that pointed at the old name.
  if (g.name !== newName) {
    db.run('UPDATE customers SET group_name = ? WHERE group_name = ? AND unternehmen_id = ?', [newName, g.name, smeId]);
  }
  res.json({ ok: true });
}));

router.delete('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const g     = db.get('SELECT * FROM customer_groups WHERE id = ? AND unternehmen_id = ?', [req.params.id, smeId]);
  if (!g) throw httpError(404, 'Gruppe nicht gefunden');
  // NULL out the group_name on customers — keep their records, just lose the
  // grouping label.
  db.run('UPDATE customers SET group_name = NULL WHERE group_name = ? AND unternehmen_id = ?', [g.name, smeId]);
  db.run('DELETE FROM customer_groups WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
