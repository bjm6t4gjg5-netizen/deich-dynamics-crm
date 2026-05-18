/**
 * errors.js — Error helpers.
 *
 * `asyncHandler(fn)` wraps async route handlers so thrown errors land in the
 * Express error handler instead of becoming unhandled promise rejections.
 *
 * `httpError(status, message)` lets routes throw structured errors without
 * importing a separate error class.
 *
 * `errorHandler` is the final Express handler — it logs full detail server-side
 * but only leaks `error.message` to clients (and a generic message in prod for
 * 5xx errors, to avoid information disclosure).
 */

const config = require('../config');

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  // Always log full detail
  // eslint-disable-next-line no-console
  console.error(
    `[${new Date().toISOString()}] ${req.method} ${req.path} → ${status}`,
    err.message,
    config.isProd ? '' : err.stack,
  );

  const safeMessage =
    status < 500
      ? err.message || 'Anfrage fehlerhaft'
      : config.isProd
        ? 'Interner Serverfehler'
        : err.message || 'Interner Serverfehler';

  res.status(status).json({ error: safeMessage });
}

module.exports = { asyncHandler, httpError, errorHandler };
