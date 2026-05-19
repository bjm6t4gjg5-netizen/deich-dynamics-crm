/**
 * config.js — Centralised, validated runtime configuration.
 *
 * Loads .env via dotenv, validates required vars, and exposes a frozen object
 * so the rest of the codebase never reads process.env directly. This makes the
 * boundary between "what the app expects" and "what the environment provides"
 * explicit and crash-on-startup loud.
 */

require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function parseOrigins(raw) {
  if (!raw) return ['http://localhost:5173'];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Config: ${name} is not an integer (got: "${v}")`);
  }
  return n;
}

// ── Validate critical secrets in production ────────────────────────────────
const DEV_JWT_PLACEHOLDER = 'replace-with-32-plus-random-chars-for-local-development-only';
const jwtSecret = process.env.JWT_SECRET;

if (isProd) {
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret === DEV_JWT_PLACEHOLDER) {
    // eslint-disable-next-line no-console
    console.error(
      '\n❌ FATAL: JWT_SECRET must be set to a strong random value (>=32 chars) in production.\n' +
      '   Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
    );
    process.exit(1);
  }
}

const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: int('PORT', 3001),

  jwt: {
    secret: jwtSecret || 'deich-dynamics-dev-secret-do-not-use-in-production',
    expiresIn: '7d',
  },

  cors: {
    origins: parseOrigins(process.env.CLIENT_URL),
  },

  rateLimit: {
    authMax: int('RATE_LIMIT_AUTH_MAX', 20),    // per 15 min
    apiMax:  int('RATE_LIMIT_API_MAX', 300),    // per 15 min
    windowMs: 15 * 60 * 1000,
  },

  mail: {
    fromDefault:     process.env.MAIL_FROM_DEFAULT     || 'noreply@deich-dynamics.com',
    fromNameDefault: process.env.MAIL_FROM_NAME_DEFAULT || 'Mein Dynamics',
    // AES-256 key for encrypting per-tenant IMAP/SMTP passwords at rest.
    // Rotate via Settings → Sicherheit. Lose this and stored passwords become
    // unrecoverable.
    encKey: process.env.MAIL_ENC_KEY || null,
  },

  seed: {
    adminEmail:    process.env.SEED_ADMIN_EMAIL    || 'admin@deich-dynamics.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin2025!',
  },

  brand: {
    name:    'Deich Dynamics CRM',
    company: 'Deich Dynamics Solutions',
    domain:  'deich-dynamics.com',
    primary: '#1d3f36',
    accent:  '#a8c5b4',
  },
});

module.exports = config;
