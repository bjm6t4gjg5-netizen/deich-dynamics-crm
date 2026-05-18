/**
 * services/audit.js — Append-only audit log helper.
 *
 * Records who did what, when, against which entity. Used for security-sensitive
 * actions (login, registration, password change, role/module changes). Writes
 * are best-effort — a failure here must never break the user's request, so the
 * helper swallows errors and logs to stderr.
 *
 * The schema is created in db/init.js (table `audit_log`).
 */

const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');

/**
 * Record an audit-log entry.
 *
 * @param {object} params
 * @param {string} params.action     Short verb identifier, e.g. 'auth.login'
 * @param {object} [params.user]     The acting user — {id, email}
 * @param {string} [params.refType]  Type of entity touched ('user','invoice'…)
 * @param {string} [params.refId]    Entity id
 * @param {object} [params.meta]     Free-form JSON detail (will be stringified)
 * @param {object} [params.req]      Express request — used to capture client IP
 */
function audit({ action, user, refType, refId, meta, req }) {
  try {
    const ip =
      req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      req?.socket?.remoteAddress ||
      null;

    getDb().run(
      `INSERT INTO audit_log (id, user_id, user_email, action, ref_type, ref_id, meta, ip, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        uuid(),
        user?.id || null,
        user?.email || null,
        action,
        refType || null,
        refId || null,
        meta ? JSON.stringify(meta) : null,
        ip,
        now(),
      ]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record entry:', err.message);
  }
}

module.exports = { audit };
