/**
 * index.js — HTTP entry point.
 *
 * Wires together security middleware, rate limits, routes, static assets, and
 * the global error handler. Configuration is centralised in ./config.js and
 * validated at startup, so this file stays declarative.
 */

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');

const config = require('./config');
const { errorHandler } = require('./middleware/errors');

const app = express();

// ── Trust proxy (Render/Fly/Heroku terminate TLS in front) ──────────────────
app.set('trust proxy', 1);

// ── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // disabled — frontend bundles inline runtime
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin (server-side, curl, etc.) → no origin header → allow
      if (!origin) return cb(null, true);
      if (config.cors.origins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Static uploads (logos, receipts) ─────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Auto-migrations (idempotent — safe on every start) ───────────────────────
try {
  const { getDb } = require('./db/db');
  const db = getDb();
  try { db.exec('ALTER TABLE unternehmen ADD COLUMN claude_key TEXT'); } catch { /* exists */ }
} catch (e) {
  console.warn('[migrate] skipped:', e.message);
}

// ── Rate limits ──────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' },
});

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Anfragen-Limit erreicht. Bitte später erneut versuchen.' },
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',  authLimiter, require('./routes/auth'));
app.use('/api/admin', apiLimiter,  require('./routes/admin'));
app.use('/api/stb',   apiLimiter,  require('./routes/stb'));
app.use('/api/sme',   apiLimiter,  require('./routes/sme'));

app.get('/api/health', (_, res) =>
  res.json({
    status: 'ok',
    version: require('./package.json').version,
    brand: config.brand.name,
    env: config.env,
    ts: new Date().toISOString(),
  })
);

// ── Static frontend (production) ─────────────────────────────────────────────
if (config.isProd) {
  const dist = path.join(__dirname, '../client/dist');
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// ── Final error handler — must be last ───────────────────────────────────────
app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`\n🌊  ${config.brand.name} — http://localhost:${config.port}`);
  console.log(`    API:  http://localhost:${config.port}/api`);
  console.log(`    Mode: ${config.env}`);
  console.log(`    CORS: ${config.cors.origins.join(', ')}\n`);
});
