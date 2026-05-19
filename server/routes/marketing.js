/**
 * routes/marketing.js — Campaigns CRUD + attribution aggregates.
 *
 * A "campaign" is any marketing/sales action you want to track for ROI.
 * Customers and Deals can both link to a campaign (acquired_via / campaign_id
 * respectively). The GET endpoint joins those counts so the UI doesn't have
 * to call multiple endpoints.
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { validate } = require('../middleware/validate');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

function getSmeId(userId) {
  return getDb().get('SELECT id FROM unternehmen WHERE user_id = ?', [userId])?.id;
}

// ── GET /api/sme/campaigns ──────────────────────────────────────────────
router.get('/', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const rows  = db.all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM customers cu WHERE cu.acquired_via = c.id) AS customer_count,
      (SELECT COUNT(*) FROM deals d      WHERE d.campaign_id = c.id) AS deal_count,
      (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.campaign_id = c.id) AS deal_value,
      (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.campaign_id = c.id AND d.stage = 'Gewonnen') AS won_value
    FROM campaigns c
    WHERE c.unternehmen_id = ?
    ORDER BY c.created_at DESC
  `, [smeId]);
  res.json(rows);
}));

// ── POST /api/sme/campaigns ─────────────────────────────────────────────
router.post('/',
  smeAuth,
  validate({ name: { type: 'string', required: true, min: 1, max: 200 } }),
  asyncHandler(async (req, res) => {
    const db    = getDb();
    const smeId = getSmeId(req.user.id);
    const id    = uuid();
    const { name, description, channel, spend, start_date, end_date, status } = req.body;
    db.run(`
      INSERT INTO campaigns (id, unternehmen_id, name, description, channel, spend, start_date, end_date, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [
      id, smeId, name, description || null, channel || null,
      parseFloat(spend) || 0, start_date || null, end_date || null,
      status || 'Aktiv', now(),
    ]);
    res.status(201).json({ id });
  })
);

// ── PUT /api/sme/campaigns/:id ──────────────────────────────────────────
router.put('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const c     = db.get('SELECT id FROM campaigns WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!c) throw httpError(404, 'Kampagne nicht gefunden');

  const { name, description, channel, spend, start_date, end_date, status } = req.body;
  db.run(`
    UPDATE campaigns SET name=?, description=?, channel=?, spend=?, start_date=?, end_date=?, status=?
    WHERE id=?
  `, [name, description || null, channel || null, parseFloat(spend) || 0,
      start_date || null, end_date || null, status || 'Aktiv', req.params.id]);
  res.json({ ok: true });
}));

// ── DELETE /api/sme/campaigns/:id ───────────────────────────────────────
router.delete('/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  // Don't cascade — keep historical attribution on customers/deals; just NULL the FKs.
  db.run('UPDATE customers SET acquired_via = NULL WHERE acquired_via = ?', [req.params.id]);
  db.run('UPDATE deals SET campaign_id = NULL WHERE campaign_id = ?', [req.params.id]);
  db.run('DELETE FROM campaigns WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  res.json({ ok: true });
}));

module.exports = router;
