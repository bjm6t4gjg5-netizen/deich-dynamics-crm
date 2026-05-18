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
router.get('/invoices', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  res.json(getDb().all('SELECT * FROM invoices WHERE unternehmen_id=? ORDER BY created_at DESC', [smeId]));
}));

router.post('/invoices', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const sme   = db.get('SELECT * FROM unternehmen WHERE id=?', [smeId]);

  const { customer_id, client_name, description, net, vat_rate, due_date, notes, line_items } = req.body;
  if (!client_name || net === undefined) return res.status(400).json({ error: 'client_name und net erforderlich' });

  const netNum  = parseFloat(net) || 0;
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

  res.status(201).json({ id, invoice_number: invNum });
}));

router.put('/invoices/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const { status, paid_at, description, notes } = req.body;
  const inv = db.get('SELECT * FROM invoices WHERE id=? AND unternehmen_id=?', [req.params.id, smeId]);
  if (!inv) return res.status(404).json({ error: 'Nicht gefunden' });

  db.run('UPDATE invoices SET status=?, paid_at=?, description=?, notes=? WHERE id=?',
    [status || inv.status, paid_at || inv.paid_at, description || inv.description, notes || inv.notes, req.params.id]);

  // If paid, deduct inventory for linked items
  if (status === 'Bezahlt' && inv.status !== 'Bezahlt') {
    const items = JSON.parse(inv.line_items || '[]');
    items.forEach(item => {
      if (item.inventory_id && item.qty) {
        const it = db.get('SELECT * FROM inventory_items WHERE id=? AND unternehmen_id=?', [item.inventory_id, smeId]);
        if (it) {
          db.run('UPDATE inventory_items SET stock = stock - ? WHERE id=?', [item.qty, item.inventory_id]);
          db.run('INSERT INTO inventory_movements (id,item_id,invoice_id,type,qty,note,moved_at) VALUES (?,?,?,?,?,?,?)',
            [uuid(), item.inventory_id, req.params.id, 'Ausgang', item.qty, `Rechnung ${inv.invoice_number}`, ts()]);
        }
      }
    });
  }
  res.json({ ok: true });
}));

router.delete('/invoices/:id', smeAuth, asyncHandler(async (req, res) => {
  const smeId = getSmeId(req.user.id);
  getDb().run('UPDATE invoices SET status=? WHERE id=? AND unternehmen_id=?', ['Storniert', req.params.id, smeId]);
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
  const { status, has_receipt } = req.body;
  db.run('UPDATE expenses SET status=?, has_receipt=? WHERE id=? AND unternehmen_id=?',
    [status, has_receipt ? 1 : 0, req.params.id, smeId]);
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
  const { sku, name, description, category, unit, stock, min_stock, buy_price, sell_price, supplier } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const id = uuid();
  db.run(`INSERT INTO inventory_items
    (id,unternehmen_id,sku,name,description,category,unit,stock,min_stock,buy_price,sell_price,supplier,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,smeId,sku||'',name,description||'',category||'Sonstiges',unit||'Stück',
     parseFloat(stock)||0,parseFloat(min_stock)||0,
     parseFloat(buy_price)||0,parseFloat(sell_price)||0,supplier||'',ts()]);

  // Record initial stock as Eingang if stock > 0
  if (parseFloat(stock) > 0) {
    db.run('INSERT INTO inventory_movements (id,item_id,type,qty,unit_cost,note,moved_at) VALUES (?,?,?,?,?,?,?)',
      [uuid(),id,'Eingang',parseFloat(stock),parseFloat(buy_price)||0,'Anfangsbestand',ts()]);
  }
  res.status(201).json({ id });
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
  const { name, customer_id, company, value, probability, stage, contact_person, expected_close, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const id = uuid();
  db.run(`INSERT INTO deals (id,unternehmen_id,customer_id,name,company,value,probability,stage,contact_person,expected_close,notes,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,smeId,customer_id||null,name,company||'',parseFloat(value)||0,
     parseInt(probability)||20,stage||'Erstgespräch',contact_person||'',expected_close||null,notes||'',ts()]);
  res.status(201).json({ id });
}));

router.put('/deals/:id', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const { stage, probability, value, notes } = req.body;
  db.run('UPDATE deals SET stage=?, probability=?, value=?, notes=? WHERE id=? AND unternehmen_id=?',
    [stage, probability, value, notes, req.params.id, smeId]);
  res.json({ ok: true });
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
  const lowStock = db.all('SELECT * FROM inventory_items WHERE unternehmen_id=? AND stock <= min_stock', [smeId]);

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
