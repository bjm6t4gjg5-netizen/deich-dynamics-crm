/**
 * routes/audit.js — Audit-log viewer (Super-Admin only).
 *
 * Surfaces the audit_log table with simple filter + pagination.
 */

const express = require('express');
const { getDb } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.get('/', auth(['superadmin']), asyncHandler(async (req, res) => {
  const db = getDb();
  const limit  = Math.min(parseInt(req.query.limit) || 200, 1000);
  const search = (req.query.search || '').trim();
  let rows;
  if (search) {
    const q = `%${search}%`;
    rows = db.all(
      `SELECT * FROM audit_log WHERE action LIKE ? OR user_email LIKE ? OR ref_id LIKE ? ORDER BY created_at DESC LIMIT ?`,
      [q, q, q, limit]
    );
  } else {
    rows = db.all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [limit]);
  }
  res.json(rows);
}));

module.exports = router;
