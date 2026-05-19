/**
 * db.js — SQLite wrapper for node-sqlite3-wasm.
 *
 * node-sqlite3-wasm treats every string passed to db.get/all/run as a prepared
 * statement, which means SQL fragments like `status="Bezahlt"` get parsed as
 * column identifiers. The rule for the entire codebase is: ALWAYS use `?`
 * placeholders, never string-concatenate values into SQL.
 *
 * This wrapper guarantees:
 *  - params is always an array (never `undefined`),
 *  - `undefined` values become `null` (SQLite-safe),
 *  - `now()` returns an ISO-ish timestamp string ("YYYY-MM-DD HH:MM:SS").
 *
 * DB path resolution:
 *  - Default: ../deich.db (sibling of /server)
 *  - Legacy fallback: if `kontor.db` exists and `deich.db` does not, we keep
 *    using kontor.db. This preserves any pre-rebrand demo data without forcing
 *    a re-seed. New deploys will create `deich.db`.
 */

const { Database } = require('node-sqlite3-wasm');
const fs   = require('fs');
const path = require('path');

// In production with a persistent volume (Fly.io), set DB_PATH=/data/deich.db.
// Locally the default sibling path keeps dev convenience.
const ENV_PATH    = process.env.DB_PATH;
const NEW_PATH    = ENV_PATH || path.join(__dirname, '../deich.db');
const LEGACY_PATH = path.join(__dirname, '../kontor.db');

function resolveDbPath() {
  if (ENV_PATH) {
    try { fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true }); } catch { /* ignore */ }
    return ENV_PATH;
  }
  if (fs.existsSync(NEW_PATH)) return NEW_PATH;
  if (fs.existsSync(LEGACY_PATH)) return LEGACY_PATH;
  return NEW_PATH;
}

let _db = null;

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function sanitise(params) {
  if (!params) return [];
  const arr = Array.isArray(params) ? params : [params];
  return arr.map((v) => (v === undefined ? null : v));
}

function wrap(raw) {
  return {
    prepare(sql) {
      return {
        run(...args) { return raw.run(sql, sanitise(args.flat())); },
        get(...args) { return raw.get(sql, sanitise(args.flat())); },
        all(...args) { return raw.all(sql, sanitise(args.flat())); },
      };
    },
    exec(sql)        { return raw.exec(sql); },
    run(sql, params) { return raw.run(sql, sanitise(params)); },
    get(sql, params) { return raw.get(sql, sanitise(params)); },
    all(sql, params) { return raw.all(sql, sanitise(params)); },
  };
}

function getDb() {
  if (!_db) {
    _db = wrap(openWithPragmas(resolveDbPath()));
  }
  return _db;
}

/**
 * Opens a SQLite connection with sane concurrency defaults.
 *
 *  - busy_timeout FIRST (before anything else can fail with SQLITE_BUSY).
 *  - journal_mode = WAL  → one writer, many concurrent readers.
 *  - synchronous = NORMAL → durable enough for an app like this, much faster.
 *
 * Shared with init.js so the very first writer (the seed script) opens the
 * DB in WAL mode too — otherwise we get a mixed-mode file and Node hangs on
 * "database is locked" on the next start.
 */
function openWithPragmas(dbPath) {
  const raw = new Database(dbPath);
  raw.exec('PRAGMA busy_timeout = 30000');
  try { raw.exec('PRAGMA journal_mode = WAL'); } catch { /* readonly fs */ }
  try { raw.exec('PRAGMA synchronous = NORMAL'); } catch { /* ignore */ }
  return raw;
}

module.exports.openWithPragmas = openWithPragmas;

module.exports = { getDb, now, openWithPragmas };
