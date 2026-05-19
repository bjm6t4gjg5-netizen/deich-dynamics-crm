/**
 * init.js — Schema creation + demo seed data.
 *
 * Security: passwords are hashed with bcrypt (cost factor 12).
 * Never store plain-text passwords.
 *
 * Run: node db/init.js
 */

const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const path = require('path');
const fs   = require('fs');

const config = require('../config');
const { openWithPragmas } = require('./db');

const ENV_PATH   = process.env.DB_PATH;
const DB_PATH    = ENV_PATH || path.join(__dirname, '../deich.db');
const LEGACY_PATH = path.join(__dirname, '../kontor.db');

if (ENV_PATH) {
  try { fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true }); } catch { /* ignore */ }
}

// If a legacy db exists and no new one, keep using legacy so existing
// dev environments don't lose state. Otherwise create deich.db.
const ACTIVE_PATH = ENV_PATH
  ? ENV_PATH
  : (fs.existsSync(LEGACY_PATH) && !fs.existsSync(DB_PATH) ? LEGACY_PATH : DB_PATH);

// Open with the SAME pragmas the server uses — otherwise we end up with a
// mixed-mode file (init.js writes in rollback-journal mode, server expects
// WAL) which causes "database is locked" the next time the app starts.
const db = openWithPragmas(ACTIVE_PATH);

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('superadmin','steuerberater','unternehmen')),
    name          TEXT NOT NULL,
    is_active     INTEGER DEFAULT 1,
    created_at    TEXT NOT NULL,
    last_login    TEXT
  );

  CREATE TABLE IF NOT EXISTS steuerberater (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_name       TEXT NOT NULL,
    address         TEXT,
    phone           TEXT,
    website         TEXT,
    logo_url        TEXT,
    theme_color     TEXT DEFAULT '#1d3f36',
    theme_accent    TEXT DEFAULT '#a8c5b4',
    theme_mode      TEXT DEFAULT 'light',
    commission_rate REAL DEFAULT 0.25,
    mail_provider   TEXT DEFAULT 'smtp',
    mail_host       TEXT,
    mail_port       INTEGER DEFAULT 587,
    mail_user       TEXT,
    mail_pass       TEXT,
    mail_from       TEXT,
    sendgrid_key    TEXT,
    resend_key      TEXT,
    features        TEXT DEFAULT '{"ai":true,"datev":true,"invoices":true,"commission":true}',
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS unternehmen (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stb_id          TEXT REFERENCES steuerberater(id) ON DELETE SET NULL,
    firm_name       TEXT NOT NULL,
    legal_form      TEXT DEFAULT 'GmbH',
    address         TEXT,
    city            TEXT,
    plz             TEXT,
    country         TEXT DEFAULT 'Deutschland',
    phone           TEXT,
    email           TEXT,
    website         TEXT,
    ust_id          TEXT,
    steuernummer    TEXT,
    iban            TEXT,
    bic             TEXT,
    bank_name       TEXT,
    logo_url        TEXT,
    theme_color     TEXT DEFAULT '#1d3f36',
    theme_accent    TEXT DEFAULT '#a8c5b4',
    theme_mode      TEXT DEFAULT 'light',
    modules         TEXT DEFAULT '{"contacts":true,"pipeline":true,"invoices":true,"expenses":true,"inventory":true,"ai":true}',
    vat_rate        INTEGER DEFAULT 19,
    payment_days    INTEGER DEFAULT 30,
    invoice_prefix  TEXT DEFAULT 'RE',
    invoice_counter INTEGER DEFAULT 1,
    claude_key      TEXT,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id              TEXT PRIMARY KEY,
    unternehmen_id  TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    company         TEXT,
    email           TEXT,
    phone           TEXT,
    mobile          TEXT,
    website         TEXT,
    address         TEXT,
    city            TEXT,
    plz             TEXT,
    country         TEXT DEFAULT 'Deutschland',
    type            TEXT DEFAULT 'Kunde' CHECK(type IN ('Kunde','Interessent','Partner','Lieferant','Inaktiv')),
    group_name      TEXT,
    status          TEXT DEFAULT 'Aktiv',
    birthday        TEXT,
    tax_id          TEXT,
    notes           TEXT,
    referred_by     TEXT REFERENCES customers(id) ON DELETE SET NULL,
    lat             REAL,
    lng             REAL,
    last_contact    TEXT,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customer_files (
    id            TEXT PRIMARY KEY,
    customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size          INTEGER,
    mime_type     TEXT,
    uploaded_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id               TEXT PRIMARY KEY,
    unternehmen_id   TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
    customer_id      TEXT REFERENCES customers(id) ON DELETE SET NULL,
    invoice_number   TEXT NOT NULL,
    client_name      TEXT NOT NULL,
    description      TEXT,
    line_items       TEXT DEFAULT '[]',
    net              REAL NOT NULL DEFAULT 0,
    vat              REAL NOT NULL DEFAULT 0,
    gross            REAL NOT NULL DEFAULT 0,
    vat_rate         INTEGER DEFAULT 19,
    status           TEXT DEFAULT 'Entwurf' CHECK(status IN ('Entwurf','Offen','Bezahlt','Überfällig','Storniert')),
    date             TEXT,
    due_date         TEXT,
    sent_at          TEXT,
    paid_at          TEXT,
    reminder_count   INTEGER DEFAULT 0,
    reminder_sent_at TEXT,
    notes            TEXT,
    created_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id             TEXT PRIMARY KEY,
    unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
    supplier       TEXT NOT NULL,
    description    TEXT,
    category       TEXT DEFAULT 'Sonstiges',
    net            REAL NOT NULL DEFAULT 0,
    vat            REAL NOT NULL DEFAULT 0,
    gross          REAL NOT NULL DEFAULT 0,
    vat_rate       INTEGER DEFAULT 19,
    status         TEXT DEFAULT 'Offen',
    expense_date   TEXT,
    receipt_url    TEXT,
    has_receipt    INTEGER DEFAULT 0,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_items (
    id             TEXT PRIMARY KEY,
    unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
    sku            TEXT,
    name           TEXT NOT NULL,
    description    TEXT,
    category       TEXT,
    unit           TEXT DEFAULT 'Stück',
    stock          REAL DEFAULT 0,
    min_stock      REAL DEFAULT 0,
    buy_price      REAL DEFAULT 0,
    sell_price     REAL DEFAULT 0,
    supplier       TEXT,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
    type       TEXT NOT NULL CHECK(type IN ('Eingang','Ausgang','Korrektur')),
    qty        REAL NOT NULL,
    unit_cost  REAL DEFAULT 0,
    note       TEXT,
    moved_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deals (
    id             TEXT PRIMARY KEY,
    unternehmen_id TEXT NOT NULL REFERENCES unternehmen(id) ON DELETE CASCADE,
    customer_id    TEXT REFERENCES customers(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,
    company        TEXT,
    value          REAL DEFAULT 0,
    probability    INTEGER DEFAULT 20,
    stage          TEXT DEFAULT 'Erstgespräch',
    contact_person TEXT,
    expected_close TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_log (
    id             TEXT PRIMARY KEY,
    unternehmen_id TEXT REFERENCES unternehmen(id),
    to_email       TEXT NOT NULL,
    subject        TEXT NOT NULL,
    type           TEXT,
    ref_id         TEXT,
    status         TEXT DEFAULT 'sent',
    error          TEXT,
    sent_at        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    user_email TEXT,
    action     TEXT NOT NULL,
    ref_type   TEXT,
    ref_id     TEXT,
    meta       TEXT,
    ip         TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_customers_sme    ON customers(unternehmen_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_sme     ON invoices(unternehmen_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_status  ON invoices(status);
  CREATE INDEX IF NOT EXISTS idx_expenses_sme     ON expenses(unternehmen_id);
  CREATE INDEX IF NOT EXISTS idx_deals_sme        ON deals(unternehmen_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_sme    ON inventory_items(unternehmen_id);
  CREATE INDEX IF NOT EXISTS idx_unternehmen_stb  ON unternehmen(stb_id);
  CREATE INDEX IF NOT EXISTS idx_audit_user       ON audit_log(user_id);
`);

// ── Helpers ──────────────────────────────────────────────────────────────────
function ts() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function hash(pw) { return bcrypt.hashSync(pw, 12); }

const existing = db.get('SELECT id FROM users WHERE role = ?', ['superadmin']);
if (existing) {
  // eslint-disable-next-line no-console
  console.log('✅ Database already initialised — skipping seed');
  db.close();
  process.exit(0);
}

// eslint-disable-next-line no-console
console.log(`🔧 Initialising database at ${ACTIVE_PATH} …`);

// ── Super-Admin ──────────────────────────────────────────────────────────────
const adminId = uuid();
db.run(
  'INSERT INTO users (id,email,password_hash,role,name,created_at) VALUES (?,?,?,?,?,?)',
  [adminId, config.seed.adminEmail, hash(config.seed.adminPassword), 'superadmin', 'Platform Admin', ts()]
);

// ── Demo Steuerberater ───────────────────────────────────────────────────────
const stbUserId = uuid();
db.run(
  'INSERT INTO users (id,email,password_hash,role,name,created_at) VALUES (?,?,?,?,?,?)',
  [stbUserId, 'demo-stb@deich-dynamics.com', hash('Demo2025!'), 'steuerberater', 'Sandra Müller', ts()]
);

const stbId = uuid();
db.run(
  `INSERT INTO steuerberater (id,user_id,firm_name,address,phone,theme_color,theme_accent,created_at)
   VALUES (?,?,?,?,?,?,?,?)`,
  [stbId, stbUserId, 'Müller Steuerberatung GmbH', 'Rathausplatz 5, 80331 München',
   '+49 89 123 456 78', '#1d3f36', '#a8c5b4', ts()]
);

// ── Demo Unternehmen (with StB) ──────────────────────────────────────────────
const smeUserId = uuid();
db.run(
  'INSERT INTO users (id,email,password_hash,role,name,created_at) VALUES (?,?,?,?,?,?)',
  [smeUserId, 'demo-firma@deich-dynamics.com', hash('Demo2025!'), 'unternehmen', 'Maria Bauer', ts()]
);

const smeId = uuid();
db.run(
  `INSERT INTO unternehmen (id,user_id,stb_id,firm_name,legal_form,city,plz,phone,email,ust_id,iban,invoice_prefix,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [smeId, smeUserId, stbId, 'Bauer Elektrotechnik GmbH', 'GmbH',
   'München', '80331', '+49 89 987 654 32', 'info@bauer-elektro.de',
   'DE 123 456 789', 'DE89 3704 0044 0532 0130 00', 'RE', ts()]
);

// ── Demo Solo-Unternehmen (no StB) ───────────────────────────────────────────
const sme2UserId = uuid();
db.run(
  'INSERT INTO users (id,email,password_hash,role,name,created_at) VALUES (?,?,?,?,?,?)',
  [sme2UserId, 'demo-solo@deich-dynamics.com', hash('Demo2025!'), 'unternehmen', 'Thomas Weber', ts()]
);

const sme2Id = uuid();
db.run(
  `INSERT INTO unternehmen (id,user_id,stb_id,firm_name,legal_form,city,plz,phone,email,ust_id,invoice_prefix,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  [sme2Id, sme2UserId, null, 'Weber Bau GmbH', 'GmbH',
   'Frankfurt', '60311', '+49 69 111 222 33', 'info@weberbau.de',
   'DE 987 654 321', 'WB', ts()]
);

// ── Demo customers ───────────────────────────────────────────────────────────
const c1 = uuid(), c2 = uuid(), c3 = uuid();
db.run(
  `INSERT INTO customers (id,unternehmen_id,name,company,email,phone,type,group_name,status,city,plz,lat,lng,notes,last_contact,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [c1, smeId, 'Klaus Hoffmann', 'Hoffmann & Söhne KG', 'k.hoffmann@hoffmann-kg.de',
   '+49 30 987 654 32', 'Kunde', 'Handel', 'Aktiv', 'Berlin', '10115',
   52.520, 13.405, 'Jahresvertrag läuft bis Dezember 2025', '2025-05-02', ts()]
);
db.run(
  `INSERT INTO customers (id,unternehmen_id,name,company,email,phone,type,group_name,status,city,plz,lat,lng,referred_by,notes,last_contact,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [c2, smeId, 'Anna Schmidt', 'Schmidt Consulting', 'a.schmidt@schmidt.de',
   '+49 711 998 877 66', 'Interessent', 'Beratung', 'Warm', 'Stuttgart', '70173',
   48.775, 9.183, c1, 'Über Hoffmann empfohlen', '2025-05-11', ts()]
);
db.run(
  `INSERT INTO customers (id,unternehmen_id,name,company,email,phone,type,group_name,status,city,plz,lat,lng,notes,last_contact,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [c3, smeId, 'Peter König', 'König Sanitär GmbH', 'p.koenig@koenig-sanitaer.de',
   '+49 221 334 455 66', 'Kunde', 'Handwerk', 'Aktiv', 'Köln', '50667',
   50.938, 6.960, 'Referenzkunde – immer pünktlich', '2025-05-03', ts()]
);

// ── Demo invoices ────────────────────────────────────────────────────────────
const i1 = uuid(), i2 = uuid(), i3 = uuid();
db.run(
  `INSERT INTO invoices (id,unternehmen_id,customer_id,invoice_number,client_name,description,net,vat,gross,vat_rate,status,date,due_date,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [i1, smeId, c1, 'RE-2025-001', 'Hoffmann & Söhne KG', 'CRM-Abonnement Mai 2025',
   2400, 456, 2856, 19, 'Bezahlt', '2025-05-01', '2025-05-31', ts()]
);
db.run(
  `INSERT INTO invoices (id,unternehmen_id,customer_id,invoice_number,client_name,description,net,vat,gross,vat_rate,status,date,due_date,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [i2, smeId, c3, 'RE-2025-002', 'König Sanitär GmbH', 'Wartungspaket Q2',
   1200, 228, 1428, 19, 'Offen', '2025-05-10', '2025-06-09', ts()]
);
db.run(
  `INSERT INTO invoices (id,unternehmen_id,customer_id,invoice_number,client_name,description,net,vat,gross,vat_rate,status,date,due_date,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [i3, smeId, c2, 'RE-2025-003', 'Schmidt Consulting', 'Strategieberatung',
   800, 152, 952, 19, 'Überfällig', '2025-04-01', '2025-05-01', ts()]
);

// ── Demo expenses ────────────────────────────────────────────────────────────
db.run(
  `INSERT INTO expenses (id,unternehmen_id,supplier,description,category,net,vat,gross,vat_rate,status,expense_date,has_receipt,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [uuid(), smeId, 'Amazon Business', 'Druckerpatronen & Papier', 'Büromaterial',
   210.08, 39.92, 250, 19, 'Gebucht', '2025-05-03', 1, ts()]
);
db.run(
  `INSERT INTO expenses (id,unternehmen_id,supplier,description,category,net,vat,gross,vat_rate,status,expense_date,has_receipt,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [uuid(), smeId, 'Deutsche Telekom', 'Monatliche Telefonrechnung', 'Telekommunikation',
   63.03, 11.97, 75, 19, 'Gebucht', '2025-05-01', 1, ts()]
);
db.run(
  `INSERT INTO expenses (id,unternehmen_id,supplier,description,category,net,vat,gross,vat_rate,status,expense_date,has_receipt,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [uuid(), smeId, 'Shell Tankstelle', 'Fahrtkosten Kundenbesuch', 'Fahrtkosten',
   84.03, 15.97, 100, 19, 'Offen', '2025-05-08', 0, ts()]
);

// ── Demo inventory ───────────────────────────────────────────────────────────
const item1 = uuid(), item2 = uuid();
db.run(
  `INSERT INTO inventory_items (id,unternehmen_id,sku,name,category,unit,stock,min_stock,buy_price,sell_price,supplier,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  [item1, smeId, 'SW-001', 'CRM Lizenz Professional', 'Software', 'Lizenz',
   48, 10, 12, 49, 'Intern', ts()]
);
db.run(
  `INSERT INTO inventory_items (id,unternehmen_id,sku,name,category,unit,stock,min_stock,buy_price,sell_price,supplier,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  [item2, smeId, 'OFF-001', 'Druckerpapier A4', 'Büromaterial', 'Packung',
   8, 5, 4.99, 0, 'Amazon Business', ts()]
);
db.run(
  'INSERT INTO inventory_movements (id,item_id,type,qty,unit_cost,note,moved_at) VALUES (?,?,?,?,?,?,?)',
  [uuid(), item1, 'Eingang', 20, 12, 'Lizenz-Batch April', ts()]
);
db.run(
  'INSERT INTO inventory_movements (id,item_id,type,qty,unit_cost,note,moved_at) VALUES (?,?,?,?,?,?,?)',
  [uuid(), item2, 'Eingang', 10, 4.99, 'Bestellung Mai', ts()]
);

// ── Demo deals ───────────────────────────────────────────────────────────────
db.run(
  `INSERT INTO deals (id,unternehmen_id,customer_id,name,company,value,probability,stage,contact_person,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`,
  [uuid(), smeId, c2, 'CRM-Paket Jahresabo', 'Schmidt Consulting',
   1800, 40, 'Angebot gesendet', 'A. Schmidt', ts()]
);
db.run(
  `INSERT INTO deals (id,unternehmen_id,customer_id,name,company,value,probability,stage,contact_person,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`,
  [uuid(), smeId, c3, 'Wartungsvertrag 2026', 'König Sanitär',
   4800, 70, 'Verhandlung', 'P. König', ts()]
);

db.close();

// eslint-disable-next-line no-console
console.log(`
✅  Datenbank initialisiert!

╔══════════════════════════════════════════════════════════════════╗
║  DEMO-ZUGÄNGE — Deich Dynamics CRM                              ║
╠══════════════════════════════════════════════════════════════════╣
║  🛡️  Super-Admin    ${config.seed.adminEmail.padEnd(38)} ${config.seed.adminPassword.padEnd(0)}
║  📊  Steuerberater  demo-stb@deich-dynamics.com       Demo2025!  ║
║  🏢  Unternehmen    demo-firma@deich-dynamics.com     Demo2025!  ║
║  🏢  Solo-Firma     demo-solo@deich-dynamics.com      Demo2025!  ║
╚══════════════════════════════════════════════════════════════════╝

🔐 Passwörter sind mit bcrypt (cost=12) gehasht gespeichert.
`);
