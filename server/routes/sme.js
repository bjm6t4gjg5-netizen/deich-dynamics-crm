const express  = require('express');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { sendEmail, invoiceEmail, reminderEmail } = require('../middleware/mailer');
const config = require('../config');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);
const ts = () => now();

function getSmeId(userId) {
  return getDb().get('SELECT id FROM unternehmen WHERE user_id = ?', [userId])?.id;
}
function getStbForSme(smeId) {
  return getDb().get('SELECT s.* FROM steuerberater s JOIN unternehmen u ON u.stb_id=s.id WHERE u.id=?', [smeId]);
}

// ── Profile ───────────────────────────────────────────────────────────────────
router.get('/profile', smeAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const p  = db.get(`SELECT u.*, s.firm_name AS stb_firm, s.theme_color AS stb_color,
      s.theme_accent AS stb_accent, s.logo_url AS stb_logo, s.id AS stb_real_id
    FROM unternehmen u LEFT JOIN steuerberater s ON u.stb_id=s.id
    WHERE u.user_id=?`, [req.user.id]);
  res.json(p);
}));

router.put('/profile', smeAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    firm_name, legal_form, address, city, plz, country, phone, email,
    website, ust_id, steuernummer, iban, bic, bank_name,
    theme_color, theme_accent, theme_mode,
    vat_rate, payment_days, invoice_prefix,
  } = req.body;
  db.run(`UPDATE unternehmen SET
    firm_name=?,legal_form=?,address=?,city=?,plz=?,country=?,phone=?,email=?,
    website=?,ust_id=?,steuernummer=?,iban=?,bic=?,bank_name=?,
    theme_color=?,theme_accent=?,theme_mode=?,
    vat_rate=?,payment_days=?,invoice_prefix=?
    WHERE user_id=?`,
    [firm_name,legal_form,address,city,plz,country,phone,email,
     website,ust_id,steuernummer,iban,bic,bank_name,
     theme_color,theme_accent,theme_mode,
     vat_rate,payment_days,invoice_prefix,
     req.user.id]);
  res.json({ ok: true });
}));

// ── Customers ─────────────────────────────────────────────────────────────────
router.get('/customers', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  const db = getDb();
  const customers = db.all('SELECT * FROM customers WHERE unternehmen_id = ? ORDER BY name', [smeId]);
  res.json(customers);
}));

router.get('/customers/:id', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  const db = getDb();
  const c = db.get('SELECT * FROM customers WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!c) return res.status(404).json({ error: 'Nicht gefunden' });

  const invoices  = db.all('SELECT * FROM invoices WHERE customer_id=? ORDER BY created_at DESC', [req.params.id]);
  const referrals = db.all('SELECT id,name,company FROM customers WHERE referred_by=?', [req.params.id]);
  const referredBy = c.referred_by ? db.get('SELECT id,name,company FROM customers WHERE id=?', [c.referred_by]) : null;
  const files     = db.all('SELECT * FROM customer_files WHERE customer_id=? ORDER BY uploaded_at DESC', [req.params.id]);

  res.json({ ...c, invoices, referrals, referredBy, files });
}));

router.post('/customers', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  const db = getDb();
  const {
    name, company, email, phone, mobile, website,
    address, city, plz, country,
    type, group_name, status,
    birthday, tax_id, notes, referred_by,
    lat, lng,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });

  const id = uuid();
  db.run(`INSERT INTO customers
    (id,unternehmen_id,name,company,email,phone,mobile,website,
     address,city,plz,country,type,group_name,status,
     birthday,tax_id,notes,referred_by,lat,lng,last_contact,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,smeId,name,company||null,email||null,phone||null,mobile||null,website||null,
     address||null,city||null,plz||null,country||'Deutschland',
     type||'Interessent',group_name||null,status||'Aktiv',
     birthday||null,tax_id||null,notes||null,referred_by||null,
     lat||null,lng||null,ts(),ts()]);
  res.status(201).json({ id });
}));

router.put('/customers/:id', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  const db = getDb();
  const {
    name, company, email, phone, mobile, website,
    address, city, plz, country,
    type, group_name, status,
    birthday, tax_id, notes, referred_by,
  } = req.body;
  db.run(`UPDATE customers SET
    name=?,company=?,email=?,phone=?,mobile=?,website=?,
    address=?,city=?,plz=?,country=?,type=?,group_name=?,status=?,
    birthday=?,tax_id=?,notes=?,referred_by=?,last_contact=?
    WHERE id=? AND unternehmen_id=?`,
    [name,company||null,email||null,phone||null,mobile||null,website||null,
     address||null,city||null,plz||null,country||'Deutschland',
     type,group_name||null,status,
     birthday||null,tax_id||null,notes||null,referred_by||null,
     ts(),req.params.id,smeId]);
  res.json({ ok: true });
}));

router.delete('/customers/:id', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  getDb().run('DELETE FROM customers WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  res.json({ ok: true });
}));

// ── Invoices ──────────────────────────────────────────────────────────────────
// Default: filter out soft-deleted; query ?include_deleted=1 to include them
router.get('/invoices', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  const sql = req.query.include_deleted === '1'
    ? 'SELECT * FROM invoices WHERE unternehmen_id=? ORDER BY created_at DESC'
    : 'SELECT * FROM invoices WHERE unternehmen_id=? AND deleted_at IS NULL ORDER BY created_at DESC';
  res.json(getDb().all(sql, [smeId]));
}));

router.post('/invoices', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const sme   = db.get('SELECT * FROM unternehmen WHERE id=?', [smeId]);

  const { customer_id, client_name, description, net, vat_rate, due_date, notes, line_items, from_deal_id } = req.body;
  if (!client_name) return res.status(400).json({ error: 'client_name erforderlich' });

  // Prefer computed totals from line_items; fall back to scalar net for legacy
  const items = Array.isArray(line_items) ? line_items : [];
  const netNum = items.length
    ? items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0)
    : (parseFloat(net) || 0);
  const vatRate = parseInt(vat_rate || sme.vat_rate || 19);
  const vatNum  = netNum * vatRate / 100;
  const gross   = netNum + vatNum;

  const counter = sme.invoice_counter || 1;
  const year    = new Date().getFullYear();
  const prefix  = sme.invoice_prefix || 'RE';
  const invNum  = `${prefix}-${year}-${String(counter).padStart(3,'0')}`;

  db.run('UPDATE unternehmen SET invoice_counter = ? WHERE id = ?', [counter + 1, smeId]);

  const id = uuid();
  db.run(`INSERT INTO invoices
    (id,unternehmen_id,customer_id,invoice_number,client_name,description,line_items,net,vat,gross,vat_rate,status,date,due_date,notes,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,smeId,customer_id||null,invNum,client_name,description||'',
     JSON.stringify(line_items||[]),netNum,vatNum,gross,vatRate,
     'Entwurf',ts().slice(0,10),due_date||null,notes||null,ts()]);

  // If this invoice was created from a pipeline deal, link them so the deal
  // shows "Rechnung öffnen" instead of "Rechnung erstellen" next time.
  if (from_deal_id) {
    try { db.run('UPDATE deals SET invoice_id = ? WHERE id = ? AND unternehmen_id = ?', [id, from_deal_id, smeId]); } catch { /* ignore */ }
  }

  res.status(201).json({ id, invoice_number: invNum });
}));

router.put('/invoices/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const { status, paid_at, description, notes, line_items, client_name, vat_rate, due_date } = req.body;
  const inv = db.get('SELECT * FROM invoices WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!inv) return res.status(404).json({ error: 'Nicht gefunden' });

  // Recompute totals from line_items if provided.
  let { net, vat, gross, vat_rate: invVatRate, line_items: invItems } = inv;
  if (Array.isArray(line_items)) {
    const items = line_items;
    net = items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0);
    invVatRate = parseInt(vat_rate || inv.vat_rate || 19);
    vat = net * invVatRate / 100;
    gross = net + vat;
    invItems = JSON.stringify(items);
  }

  db.run(`UPDATE invoices SET status=?, paid_at=?, description=?, notes=?, client_name=?,
    line_items=?, net=?, vat=?, gross=?, vat_rate=?, due_date=? WHERE id=?`,
    [status || inv.status, paid_at || inv.paid_at, description ?? inv.description, notes ?? inv.notes,
     client_name ?? inv.client_name, invItems, net, vat, gross, invVatRate, due_date ?? inv.due_date,
     req.params.id]);

  // If paid, deduct inventory for linked items (skip unlimited items)
  if (status === 'Bezahlt' && inv.status !== 'Bezahlt') {
    const items = JSON.parse(invItems || '[]');
    items.forEach(item => {
      if (item.inventory_id && item.qty) {
        const it = db.get('SELECT * FROM inventory_items WHERE id=? AND unternehmen_id=?', [item.inventory_id, smeId]);
        if (it && !it.is_unlimited) {
          db.run('UPDATE inventory_items SET stock = stock - ? WHERE id=?', [item.qty, item.inventory_id]);
          db.run('INSERT INTO inventory_movements (id,item_id,invoice_id,type,qty,note,moved_at) VALUES (?,?,?,?,?,?,?)',
            [uuid(), item.inventory_id, req.params.id, 'Ausgang', item.qty, `Rechnung ${inv.invoice_number}`, ts()]);
        }
      }
    });
  }
  res.json({ ok: true });
}));

/** Soft-Delete:
 *  - Noch nicht versendet → einfach löschen (Status 'Gelöscht', deleted_at gesetzt).
 *  - Bereits versendet → erfordert `reason` im Request-Body. Wird auch gelöscht,
 *    aber der Grund wird festgehalten (gobd-konform).
 *  In beiden Fällen werden verknüpfte Deals/Abos vom invoice_id losgelöst,
 *  damit aus Angebot/Abo eine neue Rechnung erzeugt werden kann.
 *  Der Datensatz bleibt in der DB (Soft-Delete) und wird in normalen Listen
 *  ausgeblendet. */
router.delete('/invoices/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const inv   = db.get('SELECT * FROM invoices WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!inv) return res.status(404).json({ error: 'Nicht gefunden' });

  // Reason kann aus Query oder Body kommen — Body bevorzugt
  const reason = (req.body?.reason || req.query?.reason || '').toString().slice(0, 240);
  if (inv.sent_at && !reason.trim()) {
    return res.status(400).json({
      error: 'Diese Rechnung wurde bereits versendet — bitte einen Grund für die Löschung angeben.',
      code: 'reason_required',
    });
  }

  // Soft-Delete: nur Flag setzen — Status bleibt erhalten, damit der CHECK
  // constraint nicht aufschlägt und alte Auswertungen weiterhin stimmen.
  db.run(
    'UPDATE invoices SET deleted_at=?, deletion_reason=? WHERE id=?',
    [ts(), reason || null, inv.id]
  );
  // Detach linked deals so re-issuing is possible
  db.run('UPDATE deals SET invoice_id=NULL WHERE invoice_id=?', [inv.id]);
  // Detach recurring template's last_invoice_id and remove from generated_log
  const recs = db.all('SELECT id, generated_log FROM recurring_invoices WHERE last_invoice_id=?', [inv.id]);
  for (const r of recs) {
    let log = [];
    try { log = JSON.parse(r.generated_log || '[]'); } catch { log = []; }
    const filtered = log.filter((l) => l.invoice_id !== inv.id);
    db.run('UPDATE recurring_invoices SET last_invoice_id = NULL, generated_log = ? WHERE id = ?', [JSON.stringify(filtered), r.id]);
  }
  res.json({ ok: true, deleted: true, was_sent: !!inv.sent_at });
}));

/** Storno mit Begründung — setzt Status auf "Storniert" und legt einen
 *  Storno-Vermerk an. Im Gegensatz zu DELETE bleibt der Original-Datensatz
 *  für die Buchhaltung erhalten. Auch wenn ein Deal mit dieser Rechnung
 *  verknüpft ist, wird die Verknüpfung gelöst (deals.invoice_id = NULL),
 *  damit man später wieder neu in Rechnung umwandeln kann. */
router.post('/invoices/:id/cancel', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const inv   = db.get('SELECT * FROM invoices WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!inv) return res.status(404).json({ error: 'Nicht gefunden' });
  if (inv.status === 'Storniert') return res.json({ ok: true, already: true });
  const reason = (req.body?.reason || '').slice(0, 240);
  db.run(
    'UPDATE invoices SET status=?, cancelled_at=?, cancellation_reason=? WHERE id=?',
    ['Storniert', ts(), reason, req.params.id]
  );
  // Detach from any linked deal so the user can re-issue an invoice from the deal later
  db.run('UPDATE deals SET invoice_id=NULL WHERE invoice_id=?', [req.params.id]);
  res.json({ ok: true });
}));

// POST /api/sme/invoices/:id/send
router.post('/invoices/:id/send', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const inv   = db.get('SELECT * FROM invoices WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!inv) return res.status(404).json({ error: 'Nicht gefunden' });

  const sme = db.get('SELECT * FROM unternehmen WHERE id=?', [smeId]);
  const stb = getStbForSme(smeId);
  const to  = req.body.email;
  if (!to) return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });

  await sendEmail({ stb, firm: sme, to,
    subject: `Rechnung ${inv.invoice_number} – ${sme.firm_name}`,
    html: invoiceEmail({ invoice: inv, firm: sme, stb }),
  });

  db.run('UPDATE invoices SET status=?, sent_at=? WHERE id=?', ['Offen', ts(), inv.id]);
  db.run('INSERT INTO email_log (id,unternehmen_id,to_email,subject,type,ref_id,sent_at) VALUES (?,?,?,?,?,?,?)',
    [uuid(), smeId, to, `Rechnung ${inv.invoice_number}`, 'invoice', inv.id, ts()]);

  res.json({ ok: true });
}));

// POST /api/sme/invoices/:id/remind
router.post('/invoices/:id/remind', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const inv   = db.get('SELECT * FROM invoices WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!inv) return res.status(404).json({ error: 'Nicht gefunden' });

  const sme   = db.get('SELECT * FROM unternehmen WHERE id=?', [smeId]);
  const stb   = getStbForSme(smeId);
  const level = (inv.reminder_count || 0) + 1;
  const to    = req.body.email;
  if (!to) return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });

  await sendEmail({ stb, firm: sme, to,
    subject: `Zahlungserinnerung (${level}.) – ${inv.invoice_number}`,
    html: reminderEmail({ invoice: inv, firm: sme, stb, level }),
  });

  db.run('UPDATE invoices SET reminder_count=?, reminder_sent_at=? WHERE id=?', [level, ts(), inv.id]);
  db.run('INSERT INTO email_log (id,unternehmen_id,to_email,subject,type,ref_id,sent_at) VALUES (?,?,?,?,?,?,?)',
    [uuid(), smeId, to, `Mahnung ${level} – ${inv.invoice_number}`, 'reminder', inv.id, ts()]);

  res.json({ ok: true, level });
}));

// ── Expenses ──────────────────────────────────────────────────────────────────
router.get('/expenses', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  res.json(getDb().all('SELECT * FROM expenses WHERE unternehmen_id=? ORDER BY created_at DESC', [smeId]));
}));

router.post('/expenses', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const { supplier, description, category, net, vat_rate, expense_date, has_receipt } = req.body;
  if (!supplier || net === undefined) return res.status(400).json({ error: 'supplier und net erforderlich' });

  const netNum  = parseFloat(net) || 0;
  const vatRate = parseInt(vat_rate || 19);
  const vatNum  = netNum * vatRate / 100;
  const id = uuid();
  db.run(`INSERT INTO expenses
    (id,unternehmen_id,supplier,description,category,net,vat,gross,vat_rate,expense_date,has_receipt,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,smeId,supplier,description||'',category||'Sonstiges',netNum,vatNum,netNum+vatNum,vatRate,
     expense_date||ts().slice(0,10),has_receipt?1:0,'Offen',ts()]);
  res.status(201).json({ id });
}));

router.put('/expenses/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const exp   = db.get('SELECT * FROM expenses WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!exp) return res.status(404).json({ error: 'Nicht gefunden' });

  const { status, has_receipt, supplier, description, category, net, vat_rate, expense_date } = req.body;
  const netNum  = net !== undefined ? parseFloat(net) || 0 : exp.net;
  const vatRate = vat_rate !== undefined ? parseInt(vat_rate) || 19 : exp.vat_rate;
  const vatNum  = netNum * vatRate / 100;

  db.run(`UPDATE expenses SET
    supplier=?, description=?, category=?, net=?, vat=?, gross=?, vat_rate=?,
    status=?, has_receipt=?, expense_date=?
    WHERE id=? AND unternehmen_id=?`,
    [supplier ?? exp.supplier, description ?? exp.description, category ?? exp.category,
     netNum, vatNum, netNum + vatNum, vatRate,
     status ?? exp.status, has_receipt !== undefined ? (has_receipt ? 1 : 0) : exp.has_receipt,
     expense_date ?? exp.expense_date, req.params.id, smeId]);
  res.json({ ok: true });
}));

router.delete('/expenses/:id', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  getDb().run('DELETE FROM expenses WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  res.json({ ok: true });
}));

// ── Inventory ─────────────────────────────────────────────────────────────────
router.get('/inventory', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const items = db.all('SELECT * FROM inventory_items WHERE unternehmen_id=? ORDER BY name', [smeId]);
  const movs  = db.all(`
    SELECT m.*, it.name AS item_name FROM inventory_movements m
    JOIN inventory_items it ON m.item_id=it.id
    WHERE it.unternehmen_id=? ORDER BY m.moved_at DESC`, [smeId]);
  res.json({ items: items.map(it => ({
    ...it,
    movements: movs.filter(m => m.item_id === it.id),
  })), allMovements: movs });
}));

router.post('/inventory', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const { sku, name, description, category, unit, stock, min_stock, buy_price, sell_price, supplier, is_unlimited } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });

  const unlimited = is_unlimited ? 1 : 0;
  const id = uuid();
  db.run(`INSERT INTO inventory_items
    (id,unternehmen_id,sku,name,description,category,unit,stock,min_stock,buy_price,sell_price,supplier,is_unlimited,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, smeId, sku||'', name, description||'', category||'Sonstiges', unit||'Stück',
     unlimited ? 0 : (parseFloat(stock) || 0),
     unlimited ? 0 : (parseFloat(min_stock) || 0),
     parseFloat(buy_price)||0, parseFloat(sell_price)||0, supplier||'',
     unlimited, ts()]);

  // Record initial stock as Eingang only for limited items
  if (!unlimited && parseFloat(stock) > 0) {
    db.run('INSERT INTO inventory_movements (id,item_id,type,qty,unit_cost,note,moved_at) VALUES (?,?,?,?,?,?,?)',
      [uuid(), id, 'Eingang', parseFloat(stock), parseFloat(buy_price)||0, 'Anfangsbestand', ts()]);
  }
  res.status(201).json({ id });
}));

router.put('/inventory/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const item  = db.get('SELECT * FROM inventory_items WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });

  const { name, description, category, unit, min_stock, buy_price, sell_price, supplier, is_unlimited } = req.body;
  const unlimited = is_unlimited !== undefined ? (is_unlimited ? 1 : 0) : item.is_unlimited;
  db.run(`UPDATE inventory_items SET name=?, description=?, category=?, unit=?, min_stock=?, buy_price=?, sell_price=?, supplier=?, is_unlimited=? WHERE id=?`,
    [name ?? item.name, description ?? item.description, category ?? item.category, unit ?? item.unit,
     unlimited ? 0 : (parseFloat(min_stock) ?? item.min_stock),
     parseFloat(buy_price) ?? item.buy_price, parseFloat(sell_price) ?? item.sell_price,
     supplier ?? item.supplier, unlimited, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/inventory/:id', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  getDb().run('DELETE FROM inventory_items WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  res.json({ ok: true });
}));

router.post('/inventory/:id/move', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const item  = db.get('SELECT * FROM inventory_items WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!item) return res.status(404).json({ error: 'Artikel nicht gefunden' });

  const { type, qty, unit_cost, note } = req.body;
  const q = parseFloat(qty) || 0;
  if (q <= 0) return res.status(400).json({ error: 'Menge muss > 0 sein' });

  const newStock = type === 'Eingang' ? item.stock + q : Math.max(0, item.stock - q);
  db.run('UPDATE inventory_items SET stock = ? WHERE id = ?', [newStock, item.id]);
  const movId = uuid();
  db.run('INSERT INTO inventory_movements (id,item_id,type,qty,unit_cost,note,moved_at) VALUES (?,?,?,?,?,?,?)',
    [movId, item.id, type, q, parseFloat(unit_cost)||item.buy_price, note||'', ts()]);

  res.json({ ok: true, newStock, movId });
}));

// ── Deals ─────────────────────────────────────────────────────────────────────
router.get('/deals', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  res.json(getDb().all('SELECT * FROM deals WHERE unternehmen_id=? ORDER BY created_at DESC', [smeId]));
}));

router.post('/deals', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const { name, customer_id, company, value, probability, stage, contact_person, expected_close, notes, line_items, campaign_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });

  const items = Array.isArray(line_items) ? line_items : [];
  // Auto-compute deal value from items if items exist
  const computedValue = items.length
    ? items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0)
    : (parseFloat(value) || 0);

  const id = uuid();
  db.run(`INSERT INTO deals (id,unternehmen_id,customer_id,name,company,value,probability,stage,contact_person,expected_close,notes,line_items,campaign_id,stage_entered_at,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, smeId, customer_id || null, name, company || '', computedValue,
     parseInt(probability) || 20, stage || 'Erstgespräch', contact_person || '', expected_close || null,
     notes || '', JSON.stringify(items), campaign_id || null, ts(), ts()]);
  res.status(201).json({ id });
}));

router.put('/deals/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const existing = db.get('SELECT * FROM deals WHERE id = ? AND unternehmen_id = ?', [req.params.id, smeId]);
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

  const { stage, probability, value, notes, campaign_id, contact_person, expected_close, line_items } = req.body;

  // Track stage transitions in history so we can show "wie lange in Phase X"
  let history = [];
  try { history = JSON.parse(existing.stage_history || '[]'); } catch { history = []; }
  let stageEnteredAt = existing.stage_entered_at;
  if (stage && stage !== existing.stage) {
    history.push({ stage: existing.stage, leftAt: ts() });
    history.push({ stage, enteredAt: ts() });
    stageEnteredAt = ts();
  }

  const itemsJson = Array.isArray(line_items) ? JSON.stringify(line_items) : existing.line_items;
  db.run(`UPDATE deals SET
      stage=COALESCE(?,stage),
      probability=COALESCE(?,probability),
      value=COALESCE(?,value),
      notes=COALESCE(?,notes),
      campaign_id=COALESCE(?,campaign_id),
      contact_person=COALESCE(?,contact_person),
      expected_close=COALESCE(?,expected_close),
      line_items=?,
      stage_history=?,
      stage_entered_at=?
    WHERE id=? AND unternehmen_id=?`,
    [stage ?? null, probability ?? null, value ?? null, notes ?? null,
     campaign_id ?? null, contact_person ?? null, expected_close ?? null,
     itemsJson,
     JSON.stringify(history), stageEnteredAt,
     req.params.id, smeId]);
  res.json({ ok: true });
}));

/** Reset / Demo-Reseed —
 *  Löscht ALLE Geschäftsdaten dieses Unternehmens (Kunden, Rechnungen,
 *  Belege, Inventar, Deals, Angebote, Abos, Closings, Aktivitäten) und
 *  spielt frische Demo-Daten ein. Der Unternehmens-Account selbst,
 *  Pipeline-Stages, Mahnstufen und Mail-Einstellungen bleiben erhalten.
 *  Body: `{ confirm: 'RESET' }` als Sicherheit. */
router.post('/reset-demo-data', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  if (!smeId) return res.status(404).json({ error: 'Kein Unternehmen' });
  if (req.body?.confirm !== 'RESET') {
    return res.status(400).json({ error: 'Confirm-Token fehlt — Body muss { confirm: "RESET" } enthalten.' });
  }

  // Wipe Geschäftsdaten (nicht: unternehmen, pipeline_stages, dunning_levels, customer_groups, campaigns)
  // Order matters because of FK references (movements → items, etc.)
  const wipeTables = [
    'inventory_movements', 'inventory_items',
    'activities', 'client_notes', 'email_log',
    'deals',
    'invoices',
    'expenses',
    'quotes',
    'recurring_invoices',
    'monthly_closings',
    'customer_files',
    'customers',
  ];
  const wipedPer = {};
  for (const t of wipeTables) {
    try {
      const before = db.get(`SELECT COUNT(*) AS c FROM ${t} WHERE unternehmen_id = ?`, [smeId])?.c || 0;
      db.run(`DELETE FROM ${t} WHERE unternehmen_id = ?`, [smeId]);
      wipedPer[t] = before;
    } catch (e) { wipedPer[t] = `error: ${e.message}`; }
  }

  // Seed fresh demo data — surface any error to the client so it isn't silent
  let seeded;
  try {
    const seed = require('../db/seed-sme-demo');
    seeded = seed(db, smeId);
  } catch (e) {
    console.error('[reset-demo-data] Seed failed:', e);
    return res.status(500).json({ ok: false, error: 'Seed-Fehler: ' + e.message, wiped: wipedPer, stack: e.stack });
  }

  res.json({ ok: true, wiped: wipedPer, seeded });
}));

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.get('/dashboard', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);

  const revenue  = db.get('SELECT COALESCE(SUM(gross),0) as t FROM invoices WHERE unternehmen_id=? AND status=?', [smeId,'Bezahlt']).t;
  const open     = db.get('SELECT COALESCE(SUM(gross),0) as t, COUNT(*) as c FROM invoices WHERE unternehmen_id=? AND status=?', [smeId,'Offen']);
  const overdue  = db.get('SELECT COALESCE(SUM(gross),0) as t, COUNT(*) as c FROM invoices WHERE unternehmen_id=? AND status=?', [smeId,'Überfällig']);
  const customers= db.get('SELECT COUNT(*) as c FROM customers WHERE unternehmen_id=?', [smeId]);
  const pipeline = db.get('SELECT COALESCE(SUM(value),0) as t FROM deals WHERE unternehmen_id=? AND stage != ?', [smeId,'Gewonnen']);
  const expenses = db.get('SELECT COALESCE(SUM(gross),0) as t FROM expenses WHERE unternehmen_id=?', [smeId]);
  const lowStock = db.all('SELECT * FROM inventory_items WHERE unternehmen_id=? AND stock <= min_stock AND COALESCE(is_unlimited,0) = 0', [smeId]);

  const recentInvoices = db.all('SELECT * FROM invoices WHERE unternehmen_id=? ORDER BY created_at DESC LIMIT 5', [smeId]);
  const recentCustomers= db.all('SELECT * FROM customers WHERE unternehmen_id=? ORDER BY created_at DESC LIMIT 5', [smeId]);

  res.json({ revenue, openAmount: open.t, openCount: open.c, overdueAmount: overdue.t, overdueCount: overdue.c,
    customerCount: customers.c, pipelineValue: pipeline.t, expenses: expenses.t,
    lowStockCount: lowStock.length, lowStockItems: lowStock,
    recentInvoices, recentCustomers });
}));

// ── Email log ─────────────────────────────────────────────────────────────────
router.get('/emails', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  res.json(getDb().all('SELECT * FROM email_log WHERE unternehmen_id=? ORDER BY sent_at DESC LIMIT 50', [smeId]));
}));

// POST /api/sme/handover — push monthly state to Steuerberater
router.post('/handover', smeAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const smeId = getSmeId(req.user.id);
  const sme = db.get('SELECT * FROM unternehmen WHERE id = ?', [smeId]);
  if (!sme) return res.status(404).json({ error: 'Unternehmen nicht gefunden' });
  if (!sme.stb_id) return res.status(400).json({ error: 'Kein Steuerberater verbunden' });

  const month = new Date().toISOString().slice(0, 7);
  db.run(
    'INSERT INTO client_notes (id, unternehmen_id, stb_id, author_email, text, created_at) VALUES (?,?,?,?,?,?)',
    [uuid(), smeId, sme.stb_id, req.user.email,
     `📤 Mandant hat alle Daten für ${month} zur Übergabe markiert. Bitte Monatsabschluss prüfen.`, ts()]
  );
  res.json({ ok: true, month });
}));

module.exports = router;

// ── Month-end export (ZIP for StB) ────────────────────────────────────────────
const JSZip = require('jszip');
router.get('/export/month', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const sme   = db.get('SELECT * FROM unternehmen WHERE id=?', [smeId]);
  const { month } = req.query;

  const invoices  = db.all('SELECT * FROM invoices WHERE unternehmen_id=?', [smeId]);
  const expenses  = db.all('SELECT * FROM expenses WHERE unternehmen_id=?', [smeId]);
  const customers = db.all('SELECT * FROM customers WHERE unternehmen_id=?', [smeId]);

  const toCsv = (rows, cols) => [cols.join(';'), ...rows.map(r=>cols.map(c=>`"${(r[c]??'').toString().replace(/"/g,'""')}"`).join(';'))].join('\n');
  const invCsv = toCsv(invoices, ['invoice_number','client_name','description','net','vat','gross','status','date','due_date']);
  const expCsv = toCsv(expenses, ['supplier','description','category','net','vat','gross','status','expense_date','has_receipt']);

  const brandColor = config.brand.primary;
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Export ${month||'Gesamt'} - ${sme.firm_name}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:900px;margin:40px auto;color:#222}h1{color:${brandColor}}h2{color:${brandColor};border-bottom:2px solid ${brandColor};padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-bottom:24px}th{background:${brandColor};color:#fff;padding:8px 12px;text-align:left;font-size:12px}td{padding:7px 12px;border-bottom:1px solid #eee;font-size:12px}.total{font-weight:bold;background:#f0f4f8}.ok{color:green}.warn{color:orange}.foot{margin-top:40px;padding-top:16px;border-top:1px solid #eee;color:#888;font-size:11px;text-align:center}</style></head>
<body><h1>${sme.firm_name} — Export ${month||'Gesamt'}</h1>
<p>Erstellt am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')}</p>
<h2>Rechnungen</h2>
<table><tr><th>Nummer</th><th>Kunde</th><th>Beschreibung</th><th>Netto</th><th>MwSt.</th><th>Brutto</th><th>Status</th><th>Datum</th><th>Fällig</th></tr>
${invoices.map(i=>`<tr><td>${i.invoice_number}</td><td>${i.client_name}</td><td>${i.description||''}</td><td>€ ${Number(i.net).toFixed(2)}</td><td>€ ${Number(i.vat).toFixed(2)}</td><td>€ ${Number(i.gross).toFixed(2)}</td><td class="${i.status==='Bezahlt'?'ok':i.status==='Überfällig'?'warn':''}">${i.status}</td><td>${i.date||''}</td><td>${i.due_date||''}</td></tr>`).join('')}
<tr class="total"><td colspan="3">Gesamt (${invoices.length})</td><td>€ ${invoices.reduce((s,i)=>s+i.net,0).toFixed(2)}</td><td>€ ${invoices.reduce((s,i)=>s+i.vat,0).toFixed(2)}</td><td>€ ${invoices.reduce((s,i)=>s+i.gross,0).toFixed(2)}</td><td colspan="3"></td></tr>
</table>
<h2>Belege / Ausgaben</h2>
<table><tr><th>Lieferant</th><th>Beschreibung</th><th>Kategorie</th><th>Netto</th><th>MwSt.</th><th>Brutto</th><th>Status</th><th>Datum</th><th>Beleg</th></tr>
${expenses.map(e=>`<tr><td>${e.supplier}</td><td>${e.description||''}</td><td>${e.category||''}</td><td>€ ${Number(e.net).toFixed(2)}</td><td>€ ${Number(e.vat).toFixed(2)}</td><td>€ ${Number(e.gross).toFixed(2)}</td><td>${e.status||''}</td><td>${e.expense_date||''}</td><td class="${e.has_receipt?'ok':'warn'}">${e.has_receipt?'✓ Vorhanden':'⚠ Fehlt'}</td></tr>`).join('')}
<tr class="total"><td colspan="3">Gesamt (${expenses.length})</td><td>€ ${expenses.reduce((s,e)=>s+e.net,0).toFixed(2)}</td><td>€ ${expenses.reduce((s,e)=>s+e.vat,0).toFixed(2)}</td><td>€ ${expenses.reduce((s,e)=>s+e.gross,0).toFixed(2)}</td><td colspan="3"></td></tr>
</table>
<div class="foot">Erstellt mit ${config.brand.name} · ${config.brand.company}</div>
</body></html>`;

  const zip = new JSZip();
  zip.file('zusammenfassung.html', html);
  zip.file('rechnungen.csv', invCsv);
  zip.file('belege.csv', expCsv);
  zip.file('rechnungen.json', JSON.stringify(invoices, null, 2));
  zip.file('belege.json', JSON.stringify(expenses, null, 2));
  zip.file('kunden.json', JSON.stringify(customers, null, 2));
  zip.file('unternehmen.json', JSON.stringify({ ...sme, exportDate: new Date().toISOString(), month }, null, 2));

  const buf = await zip.generateAsync({ type:'nodebuffer', compression:'DEFLATE' });
  const filename = `deich-export-${(sme.firm_name||'export').replace(/[^a-z0-9]/gi,'-').toLowerCase()}-${month||'gesamt'}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}));

// ── Logo upload ───────────────────────────────────────────────────────────────

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `logo-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (['image/png','image/jpeg','image/svg+xml','image/webp'].includes(file.mimetype)) cb(null, true);
  else cb(new Error('Nur PNG, JPG, SVG, WebP erlaubt'));
}});

router.post('/logo', smeAuth, upload.single('logo'), asyncHandler(async (req, res) => {
  const db = getDb();
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const url = `/uploads/${req.file.filename}`;
  db.run('UPDATE unternehmen SET logo_url = ? WHERE user_id = ?', [url, req.user.id]);
  res.json({ url });
}));

// GET /api/sme/claude-key — returns the configured AI key (admin-set)
router.get('/claude-key', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const row   = db.get('SELECT claude_key FROM unternehmen WHERE id=?', [smeId]);
  res.json({ claude_key: row?.claude_key || null });
}));

// ── Receipt upload ─────────────────────────────────────────────────────────────
const multerReceipt = require('multer');
const pathR  = require('path');
const fsR    = require('fs');
const uploadDirR = pathR.join(__dirname, '../uploads/receipts');
if (!fsR.existsSync(uploadDirR)) fsR.mkdirSync(uploadDirR, { recursive: true });

const receiptStorage = multerReceipt.diskStorage({
  destination: uploadDirR,
  filename: (req, file, cb) => cb(null, `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}${pathR.extname(file.originalname)}`),
});
const receiptUpload = multerReceipt({ storage: receiptStorage, limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Nur JPG, PNG, WebP, PDF erlaubt'));
  }
});

router.post('/expenses/:id/receipt', smeAuth, receiptUpload.single('receipt'), asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const url = `/uploads/receipts/${req.file.filename}`;
  db.run('UPDATE expenses SET receipt_url=?, has_receipt=? WHERE id=? AND unternehmen_id=?', [url, 1, req.params.id, smeId]);
  res.json({ url });
}));

// ── Inventory image upload (separate dir + multer instance) ────────────────
const imgDir = pathR.join(__dirname, '../uploads/items');
if (!fsR.existsSync(imgDir)) fsR.mkdirSync(imgDir, { recursive: true });
const imgStorage = multerReceipt.diskStorage({
  destination: imgDir,
  filename: (req, file, cb) => cb(null, `item-${Date.now()}-${Math.random().toString(36).slice(2)}${pathR.extname(file.originalname || '.png')}`),
});
const imgUpload = multerReceipt({
  storage: imgStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg','image/png','image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Nur JPG, PNG, WebP erlaubt'));
  },
});

router.post('/inventory/:id/image', smeAuth, imgUpload.single('image'), asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const url = `/uploads/items/${req.file.filename}`;
  db.run('UPDATE inventory_items SET image_url=? WHERE id=? AND unternehmen_id=?', [url, req.params.id, smeId]);
  res.json({ url });
}));
