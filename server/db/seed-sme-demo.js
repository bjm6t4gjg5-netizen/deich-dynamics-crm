/**
 * server/db/seed-sme-demo.js
 *
 * Idempotent — kann mehrfach aufgerufen werden (z.B. via POST /sme/reset-demo-data).
 * Erzeugt einen sauberen Satz Testdaten pro Unternehmen:
 *   - 6 Kunden (Mix aus Privat & Firmen)
 *   - 10 Rechnungen über die letzten 5 Monate (Mix aus Status)
 *   - 7 Belege (Büromaterial, Software, Miete etc.)
 *   - 4 Inventar-Artikel (mit Bestand + 1 unlimited)
 *   - 5 Pipeline-Deals in verschiedenen Stages
 *   - 1 wiederkehrendes Abo
 *   - 4 Monatsabschlüsse mit realistischen Werten
 *
 * Erwartet eine bereits offene DB-Verbindung und die SME-ID.
 * Pipeline-Stages, Mahnstufen und Mail-Settings werden NICHT angefasst.
 */

const { v4: uuid } = require('uuid');

function ts() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Returns the set of columns that exist on a given table. Used to make INSERTs
 *  defensive — if a migration column (e.g. is_unlimited) is missing on an old
 *  schema, we silently skip it. */
function columnSet(db, table) {
  try {
    return new Set((db.all(`PRAGMA table_info(${table})`) || []).map((r) => r.name));
  } catch { return new Set(); }
}

/** Build an INSERT that only uses columns that actually exist in the table.
 *  Returns the rowid via the generated id. */
function safeInsert(db, table, cols, row) {
  const existing = columnSet(db, table);
  const useCols = cols.filter((c) => existing.has(c));
  const placeholders = useCols.map(() => '?').join(',');
  db.run(
    `INSERT INTO ${table} (${useCols.join(',')}) VALUES (${placeholders})`,
    useCols.map((c) => row[c] === undefined ? null : row[c])
  );
}

module.exports = function seedSmeDemo(db, smeId) {
  const stats = { customers: 0, invoices: 0, expenses: 0, deals: 0, items: 0, recurring: 0, closings: 0, errors: [] };

  const errCapture = (label, fn) => {
    try { fn(); } catch (e) { stats.errors.push(`${label}: ${e.message}`); }
  };

  // ── Customers ──────────────────────────────────────────────────────────
  const customers = [
    { name: 'Anna Schmidt',     company: 'Schmidt Design GmbH',   email: 'anna@schmidt-design.de', phone: '+49 40 1234567',  type: 'Kunde',       status: 'Aktiv', city: 'Hamburg',           plz: '20095' },
    { name: 'Max Müller',       company: 'Müller & Partner KG',   email: 'max@mueller-partner.de', phone: '+49 30 9876543',  type: 'Kunde',       status: 'Aktiv', city: 'Berlin',            plz: '10115' },
    { name: 'Lena Bauer',       company: '',                       email: 'lena.bauer@example.de',  phone: '+49 89 5551234',  type: 'Interessent', status: 'Lead',  city: 'München',           plz: '80331' },
    { name: 'Thomas Wagner',    company: 'Wagner Bau AG',          email: 't.wagner@wagner-bau.de', phone: '+49 221 222333',  type: 'Kunde',       status: 'Aktiv', city: 'Köln',              plz: '50667' },
    { name: 'Sophia Klein',     company: 'KleinTech Solutions',    email: 'sophia@kleintech.io',    phone: '+49 711 444555',  type: 'Partner',     status: 'Warm',  city: 'Stuttgart',         plz: '70173' },
    { name: 'Jonas Hoffmann',   company: '',                       email: 'jonas@hoffmann.net',     phone: '+49 351 666777',  type: 'Interessent', status: 'Warm',  city: 'Dresden',           plz: '01067' },
  ];
  const customerIds = [];
  for (const c of customers) {
    const id = uuid();
    customerIds.push(id);
    errCapture(`customers/${c.name}`, () => {
      safeInsert(db, 'customers',
        ['id', 'unternehmen_id', 'name', 'company', 'email', 'phone', 'type', 'status', 'city', 'plz', 'country', 'last_contact', 'created_at'],
        { id, unternehmen_id: smeId, name: c.name, company: c.company || null, email: c.email, phone: c.phone, type: c.type, status: c.status, city: c.city, plz: c.plz, country: 'Deutschland', last_contact: daysAgo(Math.floor(Math.random() * 30)), created_at: ts() }
      );
      stats.customers++;
    });
  }

  // ── Invoices ───────────────────────────────────────────────────────────
  // Mix: bezahlte (alt), offene (mittel), überfällige (älteste), Entwürfe (neuste)
  const invoices = [
    { day: 150, status: 'Bezahlt',    net: 4200, vat: 19, desc: 'Logo-Redesign + Brand Guidelines',  cust: 0 },
    { day: 135, status: 'Bezahlt',    net: 8900, vat: 19, desc: 'Webseite Phase 1',                 cust: 1 },
    { day: 110, status: 'Bezahlt',    net: 3200, vat: 19, desc: 'SEO-Optimierung Q2',                cust: 3 },
    { day: 85,  status: 'Bezahlt',    net: 5400, vat: 19, desc: 'Schulung & Workshop',               cust: 1 },
    { day: 70,  status: 'Bezahlt',    net: 2900, vat: 19, desc: 'Wartung & Support 06/2024',         cust: 0 },
    { day: 55,  status: 'Überfällig', net: 6800, vat: 19, desc: 'Software-Anpassung',                cust: 4 },
    { day: 30,  status: 'Offen',      net: 4500, vat: 19, desc: 'Beratung Strategie',                cust: 1 },
    { day: 15,  status: 'Offen',      net: 7200, vat: 19, desc: 'Redesign Onlineshop',               cust: 3 },
    { day: 7,   status: 'Offen',      net: 1800, vat: 7,  desc: 'Buchführung Q3',                    cust: 0 },
    { day: 2,   status: 'Entwurf',    net: 3400, vat: 19, desc: 'Neue Marketing-Kampagne (Entwurf)', cust: 4 },
  ];
  // Find pipeline stages we can use (Gewonnen for won deals, etc.)
  const stages = db.all('SELECT * FROM pipeline_stages WHERE unternehmen_id = ? ORDER BY position', [smeId]);
  const wonStage = stages.find((s) => s.is_won);
  const quoteStages = stages.filter((s) => s.is_quote);
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost && !s.is_quote);

  const year = new Date().getFullYear();
  let invCounter = 1;
  // Track invoiceId per source deal so we can link them in the deals INSERT below.
  const dealInvoiceLinks = []; // [{dealName, customerIdx, value, day, status, desc, vat, invoiceId, lineItems}]

  for (const inv of invoices) {
    const id = uuid();
    const num = `RE-${year}-${String(invCounter++).padStart(3, '0')}`;
    const vatAmount = inv.net * inv.vat / 100;
    const gross = inv.net + vatAmount;
    const date = daysAgo(inv.day);
    const dueDate = daysAgo(inv.day - 14);
    const c = customers[inv.cust];
    const lineItems = [{ description: inv.desc, qty: 1, unit_price: inv.net, vat_rate: inv.vat }];
    errCapture(`invoice/${num}`, () => {
      safeInsert(db, 'invoices',
        ['id', 'unternehmen_id', 'customer_id', 'invoice_number', 'client_name', 'description', 'line_items', 'net', 'vat', 'gross', 'vat_rate', 'status', 'date', 'due_date', 'paid_at', 'sent_at', 'created_at'],
        {
          id, unternehmen_id: smeId, customer_id: customerIds[inv.cust], invoice_number: num,
          client_name: c.company || c.name, description: inv.desc,
          line_items: JSON.stringify(lineItems),
          net: inv.net, vat: vatAmount, gross, vat_rate: inv.vat, status: inv.status,
          date, due_date: dueDate,
          paid_at: inv.status === 'Bezahlt' ? daysAgo(inv.day - 7) : null,
          sent_at: inv.status !== 'Entwurf' ? daysAgo(Math.max(0, inv.day - 1)) : null,
          created_at: ts(),
        }
      );
      stats.invoices++;
      // Skip linking for "Entwurf" (no deal source needed)
      if (inv.status !== 'Entwurf') {
        dealInvoiceLinks.push({ desc: inv.desc, custIdx: inv.cust, value: inv.net, day: inv.day, invoiceId: id, lineItems });
      }
    });
  }

  // Update invoice_counter so neue Rechnungen die nächste Nummer kriegen
  try { db.run('UPDATE unternehmen SET invoice_counter = ? WHERE id = ?', [invCounter, smeId]); } catch { /* ignore */ }

  // For every non-draft invoice, create a "Gewonnen"-deal that produced it.
  // This keeps the workflow consistent: invoices always come from deals.
  if (wonStage) {
    for (const link of dealInvoiceLinks) {
      errCapture(`source-deal/${link.desc}`, () => {
        const dealId = uuid();
        safeInsert(db, 'deals',
          ['id', 'unternehmen_id', 'customer_id', 'name', 'company', 'value', 'probability', 'stage', 'stage_entered_at', 'line_items', 'invoice_id', 'created_at'],
          {
            id: dealId, unternehmen_id: smeId, customer_id: customerIds[link.custIdx],
            name: link.desc, company: customers[link.custIdx].company || customers[link.custIdx].name,
            value: link.value, probability: 100, stage: wonStage.name,
            stage_entered_at: daysAgo(link.day), line_items: JSON.stringify(link.lineItems),
            invoice_id: link.invoiceId, created_at: daysAgo(link.day + 14),
          }
        );
        stats.deals++;
      });
    }
  }

  // ── Expenses ───────────────────────────────────────────────────────────
  const expenses = [
    { day: 145, supplier: 'Bürowelt GmbH',          desc: 'Druckerpapier & Toner', cat: 'Büromaterial',  net: 124.50 },
    { day: 120, supplier: 'Adobe Inc.',             desc: 'Creative Cloud Abo Q2', cat: 'Software',      net: 179.00 },
    { day: 95,  supplier: 'Stadtwerke Hamburg',     desc: 'Strom & Wasser 04/2024', cat: 'Nebenkosten',   net: 280.00 },
    { day: 90,  supplier: 'WeWork',                 desc: 'Miete Coworking 05/24', cat: 'Miete',         net: 450.00 },
    { day: 60,  supplier: 'Google Ads',             desc: 'AdWords Mai',           cat: 'Marketing',     net: 850.00 },
    { day: 30,  supplier: 'Telekom Deutschland',    desc: 'Geschäftskunden-Tarif', cat: 'Telekom.',      net: 89.90 },
    { day: 5,   supplier: 'Amazon Business',        desc: 'Bürostuhl ergonomisch', cat: 'Büromaterial',  net: 320.00 },
  ];
  for (const e of expenses) {
    const id = uuid();
    const vat = e.net * 19 / 100;
    errCapture(`expense/${e.supplier}`, () => {
      safeInsert(db, 'expenses',
        ['id', 'unternehmen_id', 'supplier', 'description', 'category', 'net', 'vat', 'gross', 'vat_rate', 'status', 'expense_date', 'has_receipt', 'created_at'],
        { id, unternehmen_id: smeId, supplier: e.supplier, description: e.desc, category: e.cat, net: e.net, vat, gross: e.net + vat, vat_rate: 19, status: 'Gebucht', expense_date: daysAgo(e.day), has_receipt: 1, created_at: ts() }
      );
      stats.expenses++;
    });
  }

  // ── Inventory ──────────────────────────────────────────────────────────
  const items = [
    { sku: 'PRO-001', name: 'Beratungsstunde',        category: 'Dienstleistung', unit: 'h',     stock: 0,   min: 0,  buy: 0,    sell: 120.00, unlimited: 1 },
    { sku: 'PRO-002', name: 'Software-Lizenz Basic',  category: 'Lizenz',         unit: 'Lizenz', stock: 0,  min: 0,  buy: 0,    sell: 49.00,  unlimited: 1 },
    { sku: 'HW-100',  name: 'USB-Webcam HD',           category: 'Hardware',       unit: 'Stück', stock: 12,  min: 3,  buy: 39.00, sell: 79.00,  unlimited: 0 },
    { sku: 'HW-200',  name: 'Headset Pro',             category: 'Hardware',       unit: 'Stück', stock: 4,   min: 5,  buy: 89.00, sell: 169.00, unlimited: 0 },
  ];
  for (const it of items) {
    errCapture(`item/${it.sku}`, () => {
      safeInsert(db, 'inventory_items',
        ['id', 'unternehmen_id', 'sku', 'name', 'category', 'unit', 'stock', 'min_stock', 'buy_price', 'sell_price', 'is_unlimited', 'default_vat_rate', 'created_at'],
        { id: uuid(), unternehmen_id: smeId, sku: it.sku, name: it.name, category: it.category, unit: it.unit, stock: it.stock, min_stock: it.min, buy_price: it.buy, sell_price: it.sell, is_unlimited: it.unlimited, default_vat_rate: 19, created_at: ts() }
      );
      stats.items++;
    });
  }

  // ── Aktive Pipeline-Deals (offen, nicht in Won/Lost) ──────────────────
  // Mix aus normalen Open-Stages und Angebot-Stages mit Positionen.
  const activeDeals = [
    { name: 'Logo-Refresh für Bauer GmbH',     value: 3200,  prob: 30, stage: openStages[0]?.name || stages[0]?.name, cust: 2 },
    { name: 'CRM-Implementation',              value: 12500, prob: 60, stage: openStages[1]?.name || stages[1]?.name, cust: 5 },
    { name: 'Online-Shop für KleinTech',       value: 18900, prob: 75, stage: quoteStages[0]?.name || openStages[1]?.name, cust: 4, items: [
      { description: 'Online-Shop Design',     qty: 1, unit_price: 8900, vat_rate: 19 },
      { description: 'Shopify-Setup + Themes', qty: 1, unit_price: 4500, vat_rate: 19 },
      { description: 'Produktfotografie',      qty: 1, unit_price: 5500, vat_rate: 19 },
    ] },
    { name: 'Marketing-Audit Hoffmann',        value: 4500,  prob: 50, stage: quoteStages[1]?.name || quoteStages[0]?.name || openStages[0]?.name, cust: 5, items: [
      { description: 'Audit-Workshop (2 Tage)', qty: 2, unit_price: 1500, vat_rate: 19 },
      { description: 'Maßnahmenkatalog',        qty: 1, unit_price: 1500, vat_rate: 19 },
    ] },
  ];
  for (const d of activeDeals) {
    if (!d.stage) continue;
    errCapture(`active-deal/${d.name}`, () => {
      safeInsert(db, 'deals',
        ['id', 'unternehmen_id', 'customer_id', 'name', 'company', 'value', 'probability', 'stage', 'stage_entered_at', 'line_items', 'created_at'],
        {
          id: uuid(), unternehmen_id: smeId, customer_id: customerIds[d.cust],
          name: d.name, company: customers[d.cust].company || customers[d.cust].name,
          value: d.value, probability: d.prob, stage: d.stage,
          stage_entered_at: daysAgo(Math.floor(Math.random() * 21)),
          line_items: JSON.stringify(d.items || []),
          created_at: daysAgo(Math.floor(Math.random() * 30) + 15),
        }
      );
      stats.deals++;
    });
  }

  // ── Recurring (Abo) ────────────────────────────────────────────────────
  const aboItems = [{ description: 'Monatliche Wartung & Support', qty: 1, unit_price: 250, vat_rate: 19 }];
  const startDate = daysAgo(60);
  const nextDue = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  })();
  errCapture('recurring', () => {
    // Find one already-generated invoice we can link as the last-generated one.
    const lastGenerated = dealInvoiceLinks
      .filter((l) => l.custIdx === 0)
      .sort((a, b) => a.day - b.day)[0]; // oldest one for cust 0
    safeInsert(db, 'recurring_invoices',
      ['id', 'unternehmen_id', 'customer_id', 'client_name', 'description', 'line_items', 'net', 'vat_rate', 'frequency', 'start_date', 'next_due', 'last_generated', 'last_invoice_id', 'generated_log', 'active', 'created_at'],
      {
        id: uuid(), unternehmen_id: smeId, customer_id: customerIds[0],
        client_name: customers[0].company, description: 'Wartungsvertrag — monatlich',
        line_items: JSON.stringify(aboItems), net: 250, vat_rate: 19, frequency: 'monthly',
        start_date: startDate, next_due: nextDue,
        last_generated: lastGenerated ? daysAgo(lastGenerated.day) : null,
        last_invoice_id: lastGenerated?.invoiceId || null,
        generated_log: lastGenerated
          ? JSON.stringify([{ date: daysAgo(lastGenerated.day), invoice_id: lastGenerated.invoiceId, invoice_number: 'RE-' + new Date().getFullYear() + '-XXX', generated_at: ts() }])
          : '[]',
        active: 1, created_at: ts(),
      }
    );
    stats.recurring++;
  });

  // ── Monthly Closings (letzte 4 Monate) ─────────────────────────────────
  const today = new Date();
  for (let monthsAgo = 4; monthsAgo >= 1; monthsAgo--) {
    const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    const revenue = 18000 + Math.round(Math.random() * 8000);
    const cogs = Math.round(revenue * 0.30);
    const personnel = Math.round(revenue * 0.25);
    const marketing = Math.round(revenue * 0.07);
    const rent = 1800;
    const opex = Math.round(revenue * 0.05);
    const otherExp = Math.round(revenue * 0.03);
    const depreciation = 400;
    const interestExp = 180;
    const tax = Math.round((revenue - cogs - personnel - marketing - rent - opex - otherExp - depreciation - interestExp) * 0.30);
    errCapture(`closing/${y}-${m}`, () => {
      safeInsert(db, 'monthly_closings',
        ['id', 'unternehmen_id', 'year', 'month', 'revenue', 'cogs', 'opex', 'personnel', 'marketing', 'rent', 'other_expenses', 'depreciation', 'interest_income', 'interest_expense', 'tax', 'cash', 'receivables', 'inventory_value', 'fixed_assets', 'payables', 'short_term_debt', 'long_term_debt', 'equity', 'cashflow_operating', 'cashflow_investing', 'cashflow_financing', 'notes', 'locked', 'created_at'],
        {
          id: uuid(), unternehmen_id: smeId, year: y, month: m, revenue, cogs, opex, personnel, marketing, rent, other_expenses: otherExp, depreciation,
          interest_income: 0, interest_expense: interestExp, tax: Math.max(0, tax),
          cash: 12000 + monthsAgo * 1500, receivables: Math.round(revenue * 0.35), inventory_value: 4000, fixed_assets: 8500,
          payables: Math.round(cogs * 0.4), short_term_debt: 2200, long_term_debt: 6000, equity: 24000 - monthsAgo * 500,
          cashflow_operating: Math.round(revenue * 0.25), cashflow_investing: -200, cashflow_financing: -interestExp,
          notes: 'Demo-Daten', locked: monthsAgo > 1 ? 1 : 0, created_at: ts(),
        }
      );
      stats.closings++;
    });
  }

  return stats;
};
