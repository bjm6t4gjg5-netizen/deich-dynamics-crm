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
const fs      = require('fs');

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

// ── Serve client + uploads BEFORE cors so module scripts with `crossorigin`
//    attribute (Vite default) hit the static handler directly and don't
//    trip the CORS rejection middleware. Browsers don't actually need CORS
//    for same-origin requests anyway.
const distPath = path.join(__dirname, '../client/dist');
if (config.isProd && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── CORS — for API calls from other origins ─────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin (server-side, curl, fetch w/o cross-origin) → no origin → allow
      if (!origin) return cb(null, true);
      // Trust the configured allow-list
      if (config.cors.origins.includes(origin)) return cb(null, true);
      // Trust any *.fly.dev origin so deploys without CLIENT_URL still work,
      // plus localhost on any port for dev.
      try {
        const u = new URL(origin);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return cb(null, true);
        if (u.hostname.endsWith('.fly.dev')) return cb(null, true);
      } catch { /* fall through */ }
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Auto-migrations (idempotent — safe on every start) ───────────────────────
try {
  const { getDb } = require('./db/db');
  const db = getDb();
  try { db.exec('ALTER TABLE unternehmen ADD COLUMN claude_key TEXT'); } catch { /* exists */ }
  // Marketing module
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        description    TEXT,
        channel        TEXT,
        spend          REAL DEFAULT 0,
        start_date     TEXT,
        end_date       TEXT,
        status         TEXT DEFAULT 'Aktiv',
        created_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_campaigns_sme ON campaigns(unternehmen_id);
    `);
  } catch { /* exists */ }
  try { db.exec('ALTER TABLE customers ADD COLUMN acquired_via TEXT REFERENCES campaigns(id)'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE deals     ADD COLUMN campaign_id  TEXT REFERENCES campaigns(id)'); } catch { /* exists */ }
  // Pipeline stages (custom per Unternehmen)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        position       INTEGER NOT NULL DEFAULT 0,
        is_won         INTEGER NOT NULL DEFAULT 0,
        is_lost        INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pipeline_stages_sme ON pipeline_stages(unternehmen_id);
    `);
  } catch { /* exists */ }
  // Customer groups (custom per Unternehmen)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS customer_groups (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        color          TEXT,
        created_at     TEXT NOT NULL,
        UNIQUE(unternehmen_id, name)
      );
      CREATE INDEX IF NOT EXISTS idx_customer_groups_sme ON customer_groups(unternehmen_id);
    `);
  } catch { /* exists */ }
  // Internal notes from Steuerberater on their clients (Unternehmen).
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS client_notes (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        stb_id         TEXT REFERENCES steuerberater(id) ON DELETE SET NULL,
        author_email   TEXT,
        text           TEXT NOT NULL,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_client_notes_unt ON client_notes(unternehmen_id);
    `);
  } catch { /* exists */ }
  // Mail-account fields on unternehmen — IMAP for receive, SMTP for send.
  // Passwords are AES-encrypted at rest (see services/crypto.js).
  const mailColumns = [
    'mail_imap_host TEXT',
    'mail_imap_port INTEGER DEFAULT 993',
    'mail_imap_user TEXT',
    'mail_imap_pass_enc TEXT',
    'mail_imap_tls INTEGER DEFAULT 1',
    'mail_smtp_host TEXT',
    'mail_smtp_port INTEGER DEFAULT 587',
    'mail_smtp_user TEXT',
    'mail_smtp_pass_enc TEXT',
    'mail_smtp_tls INTEGER DEFAULT 1',
    'mail_address TEXT',
    'mail_display_name TEXT',
  ];
  for (const colDef of mailColumns) {
    try { db.exec(`ALTER TABLE unternehmen ADD COLUMN ${colDef}`); } catch { /* exists */ }
  }
  // Quotes (Angebote) — convertible to invoices once accepted.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        customer_id    TEXT REFERENCES customers(id) ON DELETE SET NULL,
        quote_number   TEXT NOT NULL,
        client_name    TEXT NOT NULL,
        description    TEXT,
        line_items     TEXT DEFAULT '[]',
        net REAL DEFAULT 0, vat REAL DEFAULT 0, gross REAL DEFAULT 0,
        vat_rate       INTEGER DEFAULT 19,
        status         TEXT DEFAULT 'Entwurf',
        valid_until    TEXT,
        converted_invoice_id TEXT REFERENCES invoices(id),
        notes          TEXT,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_quotes_sme ON quotes(unternehmen_id);
    `);
  } catch { /* exists */ }
  // Recurring invoice templates — auto-generated by background sweep.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recurring_invoices (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        customer_id    TEXT REFERENCES customers(id) ON DELETE SET NULL,
        client_name    TEXT NOT NULL,
        description    TEXT,
        line_items     TEXT DEFAULT '[]',
        net REAL DEFAULT 0, vat_rate INTEGER DEFAULT 19,
        frequency      TEXT NOT NULL CHECK(frequency IN ('monthly','quarterly','yearly')),
        start_date     TEXT NOT NULL,
        end_date       TEXT,
        next_due       TEXT NOT NULL,
        last_generated TEXT,
        active         INTEGER DEFAULT 1,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recurring_sme ON recurring_invoices(unternehmen_id);
    `);
  } catch { /* exists */ }
  // Dunning levels — per-Unternehmen configurable.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dunning_levels (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        level          INTEGER NOT NULL,
        name           TEXT NOT NULL,
        days_after_due INTEGER NOT NULL,
        fee            REAL DEFAULT 0,
        text_template  TEXT,
        UNIQUE(unternehmen_id, level)
      );
    `);
  } catch { /* exists */ }
  // Dashboard widget settings per Unternehmen.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_widgets (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        widget_key     TEXT NOT NULL,
        enabled        INTEGER DEFAULT 1,
        position       INTEGER DEFAULT 0,
        UNIQUE(unternehmen_id, widget_key)
      );
    `);
  } catch { /* exists */ }
  // Monthly closings — user-edited financial statements (GuV/Bilanz/Cashflow)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS monthly_closings (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        year           INTEGER NOT NULL,
        month          INTEGER NOT NULL,
        -- GuV
        revenue REAL DEFAULT 0,
        cogs REAL DEFAULT 0,
        opex REAL DEFAULT 0,
        personnel REAL DEFAULT 0,
        marketing REAL DEFAULT 0,
        rent REAL DEFAULT 0,
        other_expenses REAL DEFAULT 0,
        depreciation REAL DEFAULT 0,
        interest_income REAL DEFAULT 0,
        interest_expense REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        -- Bilanz (Aktiva)
        cash REAL DEFAULT 0,
        receivables REAL DEFAULT 0,
        inventory_value REAL DEFAULT 0,
        fixed_assets REAL DEFAULT 0,
        -- Bilanz (Passiva)
        payables REAL DEFAULT 0,
        short_term_debt REAL DEFAULT 0,
        long_term_debt REAL DEFAULT 0,
        equity REAL DEFAULT 0,
        -- Cashflow
        cashflow_operating REAL DEFAULT 0,
        cashflow_investing REAL DEFAULT 0,
        cashflow_financing REAL DEFAULT 0,
        notes TEXT,
        locked INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(unternehmen_id, year, month)
      );
      CREATE INDEX IF NOT EXISTS idx_closings_sme ON monthly_closings(unternehmen_id, year, month);
    `);
  } catch { /* exists */ }
  // Monthly closings: custom user-defined line items (JSON) so users can add own positions per section
  try { db.exec('ALTER TABLE monthly_closings ADD COLUMN custom_lines TEXT DEFAULT \'[]\''); } catch { /* exists */ }
  // Deal ↔ Invoice link (created when a deal is converted to invoice or auto-prefilled)
  try { db.exec('ALTER TABLE deals ADD COLUMN invoice_id TEXT'); } catch { /* exists */ }
  // Recurring invoice: link to the last generated invoice so the UI can show "Rechnung öffnen" instead of regenerating
  try { db.exec('ALTER TABLE recurring_invoices ADD COLUMN last_invoice_id TEXT'); } catch { /* exists */ }
  // Recurring invoice: log all generated invoices [{date, invoice_id, generated_at}]
  try { db.exec('ALTER TABLE recurring_invoices ADD COLUMN generated_log TEXT DEFAULT \'[]\''); } catch { /* exists */ }
  // Invoice cancellation metadata
  try { db.exec('ALTER TABLE invoices ADD COLUMN cancelled_at TEXT'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE invoices ADD COLUMN cancellation_reason TEXT'); } catch { /* exists */ }
  // Soft delete: keep record but mark deleted so quote/abo can issue a new one
  try { db.exec('ALTER TABLE invoices ADD COLUMN deleted_at TEXT'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE invoices ADD COLUMN deletion_reason TEXT'); } catch { /* exists */ }
  // Track if invoice was ever sent — gates hard-delete vs. cancel flow
  try { db.exec('ALTER TABLE invoices ADD COLUMN sent_at TEXT'); } catch { /* exists */ }
  // Usage analytics: page views / feature clicks for the SuperAdmin dashboard
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        role        TEXT NOT NULL,
        event_type  TEXT NOT NULL,
        event_name  TEXT NOT NULL,
        metadata    TEXT,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_usage_name ON usage_events(event_name, created_at);
    `);
  } catch { /* exists */ }
  // Support tickets — opened by SME or StB, processed by SuperAdmin
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        role        TEXT NOT NULL,
        category    TEXT NOT NULL,
        subject     TEXT NOT NULL,
        body        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        priority    TEXT NOT NULL DEFAULT 'normal',
        admin_note  TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, created_at);
    `);
  } catch { /* exists */ }
  // Inventory: unlimited flag (licences, digital goods) + per-item default VAT
  try { db.exec('ALTER TABLE inventory_items ADD COLUMN is_unlimited INTEGER DEFAULT 0'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE inventory_items ADD COLUMN default_vat_rate INTEGER DEFAULT 19'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE inventory_items ADD COLUMN image_url TEXT'); } catch { /* exists */ }
  // Pipeline-stage flag for "this column is a quote column"
  try { db.exec('ALTER TABLE pipeline_stages ADD COLUMN is_quote INTEGER DEFAULT 0'); } catch { /* exists */ }
  // Deals: stage history for "how long in phase" analytics + line items for outflow planning
  try { db.exec('ALTER TABLE deals ADD COLUMN stage_history TEXT DEFAULT \'[]\''); } catch { /* exists */ }
  try { db.exec('ALTER TABLE deals ADD COLUMN stage_entered_at TEXT'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE deals ADD COLUMN line_items TEXT DEFAULT \'[]\''); } catch { /* exists */ }
  // Expense → optional inventory tie-in so an incoming expense bumps stock
  try { db.exec('ALTER TABLE expenses ADD COLUMN inventory_id TEXT REFERENCES inventory_items(id)'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE expenses ADD COLUMN inventory_qty REAL'); } catch { /* exists */ }
  // Generic activity log — feeds the Customer Timeline tab.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id             TEXT PRIMARY KEY,
        unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
        customer_id    TEXT REFERENCES customers(id) ON DELETE CASCADE,
        type           TEXT NOT NULL,
        title          TEXT NOT NULL,
        body           TEXT,
        ref_type       TEXT,
        ref_id         TEXT,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activities_customer ON activities(customer_id);
    `);
  } catch { /* exists */ }
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
  // Seed/reset endpoints write many rows in one request — don't count them
  // against the per-IP minute window. Tracking endpoint is also exempt so
  // page-view analytics never crowd out real user actions.
  skip: (req) => {
    const url = req.originalUrl || req.url || '';
    return url.includes('/closings/seed-demo')
        || url.includes('/reset-demo-data')
        || url.endsWith('/usage/track');
  },
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          authLimiter, require('./routes/auth'));
app.use('/api/admin/audit',   apiLimiter,  require('./routes/audit'));
app.use('/api',               apiLimiter,  require('./routes/analytics'));
app.use('/api/admin',         apiLimiter,  require('./routes/admin'));
app.use('/api/stb',           apiLimiter,  require('./routes/stb'));
// More specific routes BEFORE the generic /api/sme catch-all
app.use('/api/sme/campaigns',        apiLimiter, require('./routes/marketing'));
app.use('/api/sme/pipeline-stages',  apiLimiter, require('./routes/pipeline'));
app.use('/api/sme/customer-groups',  apiLimiter, require('./routes/customer-groups'));
app.use('/api/sme/mail',             apiLimiter, require('./routes/mail'));
app.use('/api/sme/quotes',           apiLimiter, require('./routes/quotes'));
app.use('/api/sme/recurring',        apiLimiter, require('./routes/recurring'));
app.use('/api/sme/dunning',          apiLimiter, require('./routes/dunning'));
app.use('/api/sme/activity',         apiLimiter, require('./routes/activity'));
app.use('/api/sme/pdf',              apiLimiter, require('./routes/pdf'));
app.use('/api/sme/closings',         apiLimiter, require('./routes/closings'));
app.use('/api/sme/backup',           apiLimiter, require('./routes/backup'));
app.use('/api/sme',                  apiLimiter, require('./routes/sme'));

app.get('/api/health', (_, res) =>
  res.json({
    status: 'ok',
    version: require('./package.json').version,
    brand: config.brand.name,
    env: config.env,
    ts: new Date().toISOString(),
  })
);

// Sweep recurring-invoice templates once at boot and then every 6h.
// Cheap and idempotent — safe to run repeatedly.
function recurringSweep() {
  try {
    const { sweepDue } = require('./routes/recurring');
    const { getDb } = require('./db/db');
    const db = getDb();
    const smes = db.all('SELECT id FROM unternehmen', []);
    let total = 0;
    for (const { id } of smes) total += sweepDue(db, id);
    if (total > 0) console.log(`[recurring] generated ${total} invoice(s) from templates`);
  } catch (e) { console.error('[recurring] sweep failed:', e.message); }
}
setTimeout(recurringSweep, 5000);
setInterval(recurringSweep, 6 * 60 * 60 * 1000);

// ── Static frontend (production) ─────────────────────────────────────────────
if (config.isProd) {
  const dist = path.join(__dirname, '../client/dist');
  const indexFile = path.join(dist, 'index.html');
  const indexExists = fs.existsSync(indexFile);

  // Loud startup diagnostic — when the build/deploy goes wrong, this is the
  // single most useful line in the logs. Lists the contents of dist so we can
  // immediately tell whether Vite produced the bundle and whether the COPY
  // step in the Dockerfile actually delivered it to the runtime container.
  if (indexExists) {
    let assets = [];
    try { assets = fs.readdirSync(path.join(dist, 'assets')); } catch { /* ignore */ }
    // eslint-disable-next-line no-console
    console.log(`[static] dist=${dist}  index=ok  assets=${assets.length}`);
  } else {
    // eslint-disable-next-line no-console
    console.error(
      `[static] ⚠️  ${indexFile} MISSING — frontend will 500.\n` +
      `         Check the Docker build: did 'npm run build' run, did the COPY\n` +
      `         step copy /app/client/dist into the runtime container?`
    );
  }

  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (!indexExists) {
      return res
        .status(503)
        .type('text/plain')
        .send(
          'Frontend assets are not present in the container.\n' +
          'Check the deploy build logs for client/dist creation errors.'
        );
    }
    res.sendFile(indexFile);
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
