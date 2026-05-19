/**
 * routes/pipeline.js — Custom sales pipeline stages per Unternehmen.
 *
 * Each Unternehmen has its own ordered list of stages. On first access we
 * lazily seed sensible defaults so existing deals don't end up orphaned.
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { validate } = require('../middleware/validate');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

const DEFAULT_STAGES = [
  { name: 'Erstgespräch',     position: 0, is_won: 0, is_lost: 0, is_quote: 0 },
  { name: 'Bedarfsanalyse',   position: 1, is_won: 0, is_lost: 0, is_quote: 0 },
  { name: 'Angebot gesendet', position: 2, is_won: 0, is_lost: 0, is_quote: 1 },
  { name: 'Verhandlung',      position: 3, is_won: 0, is_lost: 0, is_quote: 1 },
  { name: 'Abschluss nah',    position: 4, is_won: 0, is_lost: 0, is_quote: 0 },
  { name: 'Gewonnen',         position: 5, is_won: 1, is_lost: 0, is_quote: 0 },
  { name: 'Verloren',         position: 6, is_won: 0, is_lost: 1, is_quote: 0 },
];

function getSmeId(userId) {
  return getDb().get('SELECT id FROM unternehmen WHERE user_id = ?', [userId])?.id;
}

function ensureStages(db, smeId) {
  const count = db.get('SELECT COUNT(*) AS c FROM pipeline_stages WHERE unternehmen_id = ?', [smeId]).c;
  if (count > 0) return;
  for (const s of DEFAULT_STAGES) {
    db.run(
      'INSERT INTO pipeline_stages (id, unternehmen_id, name, position, is_won, is_lost, is_quote, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [uuid(), smeId, s.name, s.position, s.is_won, s.is_lost, s.is_quote || 0, now()]
    );
  }
}

// GET /api/sme/pipeline-stages
router.get('/', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  ensureStages(db, smeId);
  const rows = db.all('SELECT * FROM pipeline_stages WHERE unternehmen_id = ? ORDER BY position, created_at', [smeId]);
  res.json(rows);
}));

// POST /api/sme/pipeline-stages
router.post('/',
  smeAuth,
  validate({ name: { type: 'string', required: true, min: 1, max: 80 } }),
  asyncHandler(async (req, res) => {
    const db    = getDb();
    const smeId = getSmeId(req.user.id);
    ensureStages(db, smeId);
    const maxPos = db.get('SELECT COALESCE(MAX(position), -1) AS p FROM pipeline_stages WHERE unternehmen_id = ?', [smeId]).p;
    const id = uuid();
    db.run(
      'INSERT INTO pipeline_stages (id, unternehmen_id, name, position, is_won, is_lost, is_quote, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, smeId, req.body.name, maxPos + 1,
       req.body.is_won ? 1 : 0, req.body.is_lost ? 1 : 0, req.body.is_quote ? 1 : 0, now()]
    );
    res.status(201).json({ id });
  })
);

// PUT /api/sme/pipeline-stages/:id  (rename, set won/lost flag)
router.put('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const stage = db.get('SELECT * FROM pipeline_stages WHERE id = ? AND unternehmen_id = ?', [req.params.id, smeId]);
  if (!stage) throw httpError(404, 'Spalte nicht gefunden');
  const oldName = stage.name;
  const newName = req.body.name?.trim();
  if (!newName) throw httpError(400, 'Name erforderlich');

  // Server-side enforcement: at least one Won + one Lost column.
  if (req.body.is_won === false && stage.is_won) {
    const c = db.get('SELECT COUNT(*) AS c FROM pipeline_stages WHERE unternehmen_id = ? AND is_won = 1 AND id != ?', [smeId, req.params.id]).c;
    if (c === 0) throw httpError(400, 'Mindestens eine „Gewonnen"-Spalte muss markiert bleiben.');
  }
  if (req.body.is_lost === false && stage.is_lost) {
    const c = db.get('SELECT COUNT(*) AS c FROM pipeline_stages WHERE unternehmen_id = ? AND is_lost = 1 AND id != ?', [smeId, req.params.id]).c;
    if (c === 0) throw httpError(400, 'Mindestens eine „Verloren"-Spalte muss markiert bleiben.');
  }

  // Enforce: at most one Won + one Lost column per Unternehmen
  if (req.body.is_won) {
    db.run('UPDATE pipeline_stages SET is_won = 0 WHERE unternehmen_id = ? AND id != ?', [smeId, req.params.id]);
  }
  if (req.body.is_lost) {
    db.run('UPDATE pipeline_stages SET is_lost = 0 WHERE unternehmen_id = ? AND id != ?', [smeId, req.params.id]);
  }
  db.run(
    'UPDATE pipeline_stages SET name = ?, is_won = ?, is_lost = ?, is_quote = ? WHERE id = ?',
    [newName, req.body.is_won ? 1 : 0, req.body.is_lost ? 1 : 0, req.body.is_quote ? 1 : 0, req.params.id]
  );

  // Migrate any deals that reference the old name so they stay in this column.
  if (oldName !== newName) {
    db.run('UPDATE deals SET stage = ? WHERE stage = ? AND unternehmen_id = ?', [newName, oldName, smeId]);
  }
  res.json({ ok: true });
}));

// DELETE /api/sme/pipeline-stages/:id
router.delete('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const stage = db.get('SELECT * FROM pipeline_stages WHERE id = ? AND unternehmen_id = ?', [req.params.id, smeId]);
  if (!stage) throw httpError(404, 'Spalte nicht gefunden');

  // If deals reference this stage, move them to the first remaining stage.
  const fallback = db.get(
    'SELECT name FROM pipeline_stages WHERE unternehmen_id = ? AND id != ? ORDER BY position LIMIT 1',
    [smeId, req.params.id]
  );
  if (fallback) {
    db.run('UPDATE deals SET stage = ? WHERE stage = ? AND unternehmen_id = ?', [fallback.name, stage.name, smeId]);
  }
  db.run('DELETE FROM pipeline_stages WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// PUT /api/sme/pipeline-stages/reorder  body: { ids: [stageId, stageId, ...] }
router.put('/reorder/all', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const ids   = Array.isArray(req.body.ids) ? req.body.ids : [];
  ids.forEach((id, i) => {
    db.run('UPDATE pipeline_stages SET position = ? WHERE id = ? AND unternehmen_id = ?', [i, id, smeId]);
  });
  res.json({ ok: true });
}));

module.exports = router;
