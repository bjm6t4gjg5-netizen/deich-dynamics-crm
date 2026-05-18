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

const NEW_PATH    = path.join(__dirname, '../deich.db');
const LEGACY_PATH = path.join(__dirname, '../kontor.db');

function resolveDbPath() {
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
    const raw = new Database(resolveDbPath());
    _db = wrap(raw);
  }
  return _db;
}

module.exports = { getDb, now };
