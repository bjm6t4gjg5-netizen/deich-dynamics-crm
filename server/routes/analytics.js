/**
 * routes/analytics.js — Usage-Tracking + Statistics for the SuperAdmin.
 *
 * Frontend sends fire-and-forget POST /api/usage/track on page-views and
 * feature clicks. SuperAdmin Dashboard reads /api/admin/usage/* for aggregates.
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();
const anyAuth   = auth(['unternehmen', 'steuerberater', 'superadmin']);
const adminAuth = auth(['superadmin']);

/** POST /api/usage/track — fire-and-forget event ingestion */
router.post('/usage/track', anyAuth, asyncHandler(async (req, res) => {
  const { event_type, event_name, metadata } = req.body || {};
  if (!event_name) return res.json({ ok: true });
  const db = getDb();
  try {
    db.run(
      'INSERT INTO usage_events (id, user_id, role, event_type, event_name, metadata, created_at) VALUES (?,?,?,?,?,?,?)',
      [uuid(), req.user.id, req.user.role, String(event_type || 'click').slice(0, 32), String(event_name).slice(0, 80), metadata ? JSON.stringify(metadata).slice(0, 500) : null, now()]
    );
  } catch { /* swallow tracking errors so user-facing actions never fail */ }
  res.json({ ok: true });
}));

/** GET /api/admin/usage/summary — aggregate stats over the last N days */
router.get('/admin/usage/summary', adminAuth, asyncHandler(async (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const db = getDb();

  const totalUsers   = db.get('SELECT COUNT(*) AS c FROM users').c;
  const activeUsers  = db.get('SELECT COUNT(DISTINCT user_id) AS c FROM usage_events WHERE created_at >= ?', [cutoff]).c;
  const totalEvents  = db.get('SELECT COUNT(*) AS c FROM usage_events WHERE created_at >= ?', [cutoff]).c;

  // Top features (event_name) across all roles
  const topFeatures = db.all(
    `SELECT event_name, COUNT(*) AS count
     FROM usage_events
     WHERE created_at >= ?
     GROUP BY event_name
     ORDER BY count DESC
     LIMIT 15`,
    [cutoff]
  );

  // Daily active users — last N days, one row per day
  const dailyActive = db.all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(DISTINCT user_id) AS users, COUNT(*) AS events
     FROM usage_events
     WHERE created_at >= ?
     GROUP BY day
     ORDER BY day`,
    [cutoff]
  );

  // Activity by role
  const byRole = db.all(
    `SELECT role, COUNT(DISTINCT user_id) AS users, COUNT(*) AS events
     FROM usage_events
     WHERE created_at >= ?
     GROUP BY role`,
    [cutoff]
  );

  // Most active users (anonymised by user_id only; admin can correlate)
  const topUsers = db.all(
    `SELECT u.email, u.role, COUNT(e.id) AS events, MAX(e.created_at) AS last_seen
     FROM usage_events e
     JOIN users u ON u.id = e.user_id
     WHERE e.created_at >= ?
     GROUP BY e.user_id
     ORDER BY events DESC
     LIMIT 20`,
    [cutoff]
  );

  res.json({
    range_days: days,
    total_users: totalUsers,
    active_users: activeUsers,
    total_events: totalEvents,
    top_features: topFeatures,
    daily_active: dailyActive,
    by_role: byRole,
    top_users: topUsers,
  });
}));

// ── Support Tickets ─────────────────────────────────────────────────────────

/** GET /api/tickets — list current user's tickets (or admin: all open) */
router.get('/tickets', anyAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = req.user.role === 'superadmin'
    ? db.all('SELECT t.*, u.email AS user_email FROM tickets t JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC')
    : db.all('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json(rows);
}));

router.post('/tickets', anyAuth, asyncHandler(async (req, res) => {
  const { category, subject, body, priority } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Betreff und Beschreibung erforderlich' });
  const id = uuid();
  const ts = now();
  getDb().run(
    'INSERT INTO tickets (id, user_id, role, category, subject, body, status, priority, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, req.user.id, req.user.role, String(category || 'support').slice(0, 32), String(subject).slice(0, 120), String(body).slice(0, 4000), 'open', priority === 'high' || priority === 'low' ? priority : 'normal', ts, ts]
  );
  res.status(201).json({ id });
}));

router.put('/tickets/:id', anyAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const t = db.get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Ticket nicht gefunden' });
  const isOwner = t.user_id === req.user.id;
  const isAdmin = req.user.role === 'superadmin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Keine Berechtigung' });
  const { status, admin_note, priority } = req.body;
  db.run(
    'UPDATE tickets SET status = COALESCE(?, status), admin_note = ?, priority = COALESCE(?, priority), updated_at = ? WHERE id = ?',
    [
      isAdmin ? status : null,
      isAdmin ? (admin_note ?? t.admin_note) : t.admin_note,
      isAdmin ? priority : null,
      now(),
      req.params.id,
    ]
  );
  res.json({ ok: true });
}));

module.exports = router;
