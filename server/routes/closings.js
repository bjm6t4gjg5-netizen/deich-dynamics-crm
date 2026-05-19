/**
 * routes/closings.js — Monthly closings + financial ratios.
 *
 * The user can either auto-pull figures from invoices/expenses or override
 * them manually. The closings table stores the canonical values used for
 * dashboards, ratios, and historical comparison. Once a closing is "locked"
 * it can no longer be edited (audit-trail discipline for year-end).
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, now } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

function getSmeId(userId) {
  return getDb().get('SELECT id FROM unternehmen WHERE user_id = ?', [userId])?.id;
}

/** Parse the custom_lines JSON column safely. */
function parseCustomLines(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/** Sum custom lines by section, signed by `kind` (+ = income/asset, - = expense/liability). */
function sumCustomBy(lines, section) {
  return lines
    .filter((l) => l && l.section === section)
    .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
}

/** Compute derived ratios so the UI doesn't repeat the math everywhere. */
function withRatios(c) {
  if (!c) return null;
  const customLines = parseCustomLines(c.custom_lines);

  // Custom adjustments per section. "income" adds to revenue, "expense" adds to operating cost,
  // "asset"/"liability" affect balance sheet, "cashflow_*" affect liquidity.
  const customIncome     = sumCustomBy(customLines, 'income');
  const customExpense    = sumCustomBy(customLines, 'expense');
  const customAsset      = sumCustomBy(customLines, 'asset');
  const customLiability  = sumCustomBy(customLines, 'liability');
  const customCfOp       = sumCustomBy(customLines, 'cashflow_operating');
  const customCfInv      = sumCustomBy(customLines, 'cashflow_investing');
  const customCfFin      = sumCustomBy(customLines, 'cashflow_financing');

  const revenue = (c.revenue || 0) + customIncome;
  const grossProfit = revenue - (c.cogs || 0);
  const ebitda = grossProfit - (c.opex || 0) - (c.personnel || 0) - (c.marketing || 0) - (c.rent || 0) - (c.other_expenses || 0) - customExpense;
  const ebit = ebitda - (c.depreciation || 0);
  const ebt = ebit + (c.interest_income || 0) - (c.interest_expense || 0);
  const netIncome = ebt - (c.tax || 0);
  const totalAssets = (c.cash || 0) + (c.receivables || 0) + (c.inventory_value || 0) + (c.fixed_assets || 0) + customAsset;
  const totalLiabilities = (c.payables || 0) + (c.short_term_debt || 0) + (c.long_term_debt || 0) + customLiability;
  const equity = c.equity || (totalAssets - totalLiabilities);
  const workingCapital = (c.cash || 0) + (c.receivables || 0) + (c.inventory_value || 0) - (c.payables || 0) - (c.short_term_debt || 0);
  const grossMargin = revenue > 0 ? grossProfit / revenue : null;
  const ebitdaMargin = revenue > 0 ? ebitda / revenue : null;
  const netMargin = revenue > 0 ? netIncome / revenue : null;
  const leverage = equity > 0 ? totalLiabilities / equity : null;
  const debtToAssets = totalAssets > 0 ? totalLiabilities / totalAssets : null;
  const equityRatio = totalAssets > 0 ? equity / totalAssets : null;
  const interestCoverage = c.interest_expense > 0 ? ebit / c.interest_expense : null;
  const currentRatio = ((c.short_term_debt || 0) + (c.payables || 0)) > 0
    ? ((c.cash || 0) + (c.receivables || 0) + (c.inventory_value || 0)) / ((c.short_term_debt || 0) + (c.payables || 0))
    : null;
  const cashflowOperating = (c.cashflow_operating || 0) + customCfOp;
  const cashflowInvesting = (c.cashflow_investing || 0) + customCfInv;
  const cashflowFinancing = (c.cashflow_financing || 0) + customCfFin;
  const totalCashflow = cashflowOperating + cashflowInvesting + cashflowFinancing;
  return {
    ...c,
    custom_lines: customLines,
    derived: {
      grossProfit, ebitda, ebit, ebt, netIncome,
      totalAssets, totalLiabilities, equity, workingCapital, totalCashflow,
      cashflowOperating, cashflowInvesting, cashflowFinancing,
      grossMargin, ebitdaMargin, netMargin,
      leverage, debtToAssets, equityRatio,
      interestCoverage, currentRatio,
      effectiveRevenue: revenue,
    },
  };
}

router.get('/', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const rows  = db.all('SELECT * FROM monthly_closings WHERE unternehmen_id = ? ORDER BY year DESC, month DESC', [smeId]);
  res.json(rows.map(withRatios));
}));

router.get('/:year/:month', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const row   = db.get('SELECT * FROM monthly_closings WHERE unternehmen_id = ? AND year = ? AND month = ?',
                       [smeId, +req.params.year, +req.params.month]);
  res.json(withRatios(row) || null);
}));

/** Pre-fill values from invoice/expense tables — what the system can derive.
 *  The user can override before saving. */
router.get('/:year/:month/suggest', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const year  = +req.params.year;
  const month = +req.params.month;
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const next  = new Date(year, month, 1);
  const end   = next.toISOString().slice(0, 10);

  const rev = db.get(
    `SELECT COALESCE(SUM(net),0) AS s FROM invoices WHERE unternehmen_id=? AND status='Bezahlt' AND COALESCE(paid_at,date) >= ? AND COALESCE(paid_at,date) < ?`,
    [smeId, start, end]
  ).s;
  const exp = db.all(
    `SELECT category, COALESCE(SUM(net),0) AS s FROM expenses WHERE unternehmen_id=? AND expense_date >= ? AND expense_date < ? GROUP BY category`,
    [smeId, start, end]
  );
  const byCat = (name) => exp.find((e) => (e.category || '').toLowerCase().includes(name.toLowerCase()))?.s || 0;
  const otherCats = exp.reduce((sum, e) => sum + e.s, 0)
    - byCat('Personal') - byCat('Marketing') - byCat('Miete');

  res.json({
    revenue: rev,
    personnel: byCat('Personal'),
    marketing: byCat('Marketing'),
    rent: byCat('Miete'),
    other_expenses: otherCats > 0 ? otherCats : 0,
  });
}));

/** Save (insert or update if year/month exists). */
router.put('/:year/:month', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const year  = +req.params.year;
  const month = +req.params.month;

  const existing = db.get('SELECT * FROM monthly_closings WHERE unternehmen_id=? AND year=? AND month=?', [smeId, year, month]);
  if (existing?.locked) throw httpError(400, 'Abschluss ist gesperrt — bitte entsperren um Änderungen zu speichern.');

  const fields = [
    'revenue','cogs','opex','personnel','marketing','rent','other_expenses','depreciation',
    'interest_income','interest_expense','tax',
    'cash','receivables','inventory_value','fixed_assets',
    'payables','short_term_debt','long_term_debt','equity',
    'cashflow_operating','cashflow_investing','cashflow_financing',
  ];
  const values = fields.map((f) => parseFloat(req.body[f]) || 0);
  // custom_lines is a free-form list of user-defined positions: { id, section, label, amount, note? }
  const customLines = Array.isArray(req.body.custom_lines)
    ? JSON.stringify(req.body.custom_lines.filter((l) => l && l.label).map((l) => ({
        id: l.id || uuid(),
        section: l.section || 'expense',
        label: String(l.label).slice(0, 120),
        amount: parseFloat(l.amount) || 0,
        note: l.note ? String(l.note).slice(0, 240) : undefined,
      })))
    : (typeof req.body.custom_lines === 'string' ? req.body.custom_lines : '[]');

  if (existing) {
    db.run(
      `UPDATE monthly_closings SET ${fields.map((f) => `${f}=?`).join(', ')}, notes=?, custom_lines=?, locked=? WHERE id=?`,
      [...values, req.body.notes ?? existing.notes, customLines, req.body.locked ? 1 : 0, existing.id]
    );
    res.json({ ok: true, id: existing.id });
  } else {
    const id = uuid();
    db.run(
      `INSERT INTO monthly_closings (id, unternehmen_id, year, month, ${fields.join(', ')}, notes, custom_lines, locked, created_at)
       VALUES (?,?,?,?,${fields.map(() => '?').join(',')},?,?,?,?)`,
      [id, smeId, year, month, ...values, req.body.notes || null, customLines, req.body.locked ? 1 : 0, now()]
    );
    res.status(201).json({ ok: true, id });
  }
}));

/** Toggle the lock state ONLY — does not touch any data. Used by the
 *  Entsperren/Sperren buttons in the wizard so unlocking doesn't accidentally
 *  overwrite the user's current form draft with stale server data. */
router.patch('/:year/:month/lock', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const year  = +req.params.year;
  const month = +req.params.month;
  const existing = db.get('SELECT * FROM monthly_closings WHERE unternehmen_id=? AND year=? AND month=?', [smeId, year, month]);
  if (!existing) throw httpError(404, 'Abschluss existiert noch nicht — bitte zuerst speichern.');
  const next = req.body && typeof req.body.locked !== 'undefined' ? (req.body.locked ? 1 : 0) : (existing.locked ? 0 : 1);
  db.run('UPDATE monthly_closings SET locked = ? WHERE id = ?', [next, existing.id]);
  res.json({ ok: true, locked: !!next });
}));

/** Export — 10-K/10-Q-Style: Übersicht + GuV + Bilanz + Cashflow + Kennzahlen,
 *  jeweils als eigenes Sheet. Optional Aggregate-Spalte über die Periode. */
router.get('/:year/:month/export.xlsx', smeAuth, asyncHandler(async (req, res) => {
  const ExcelJS = require('exceljs');
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const sme   = db.get('SELECT * FROM unternehmen WHERE id = ?', [smeId]);
  const year  = +req.params.year;
  const month = +req.params.month;
  const includeRatios = req.query.include === 'ratios' || req.query.include === 'full';
  const whole = req.params.month === '0';

  const rows = whole
    ? db.all('SELECT * FROM monthly_closings WHERE unternehmen_id = ? AND year = ? ORDER BY month', [smeId, year]).map(withRatios)
    : [withRatios(db.get('SELECT * FROM monthly_closings WHERE unternehmen_id=? AND year=? AND month=?', [smeId, year, month]))].filter(Boolean);
  if (rows.length === 0) throw httpError(404, 'Kein Abschluss gefunden');

  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const wb = new ExcelJS.Workbook();
  wb.creator = sme?.firm_name || 'Mein Dynamics';
  wb.created = new Date();

  const periodLabel = whole ? `Jahresabschluss ${year}` : `Monatsabschluss ${months[month - 1]} ${year}`;
  const brandHex = 'FF1D3F36';

  // Sum helper for whole-period totals
  const sum = (k) => rows.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  const sumD = (k) => rows.reduce((s, c) => s + (Number(c.derived?.[k]) || 0), 0);

  // ── Sheet 1: Übersicht (Titel + Kennzahlen-Block) ───────────────────────
  const cover = wb.addWorksheet('Übersicht');
  cover.columns = [{ width: 32 }, { width: 22 }];
  cover.getCell('A1').value = sme?.firm_name || 'Unternehmen';
  cover.getCell('A1').font = { bold: true, size: 18, color: { argb: brandHex } };
  cover.getCell('A2').value = periodLabel;
  cover.getCell('A2').font = { size: 13, color: { argb: 'FF888888' } };
  cover.getCell('A3').value = sme?.address ? `${sme.address}${sme?.city ? ' · ' + sme.city : ''}` : '';
  cover.getCell('A3').font = { size: 10, color: { argb: 'FFAAAAAA' } };

  const writeKpiBlock = (startRow, title, kpis) => {
    cover.getCell(`A${startRow}`).value = title;
    cover.getCell(`A${startRow}`).font = { bold: true, size: 12, color: { argb: brandHex } };
    let r = startRow + 1;
    for (const [label, val, fmt] of kpis) {
      cover.getCell(`A${r}`).value = label;
      cover.getCell(`B${r}`).value = val;
      if (fmt === 'pct') cover.getCell(`B${r}`).numFmt = '0.00%';
      else if (fmt === 'ratio') cover.getCell(`B${r}`).numFmt = '0.00';
      else cover.getCell(`B${r}`).numFmt = '#,##0.00 "€"';
      r++;
    }
    return r + 1;
  };

  const lastClosing = rows[rows.length - 1];
  const ld = lastClosing.derived || {};
  let cursor = 5;
  cursor = writeKpiBlock(cursor, 'Profitabilität', [
    ['Umsatzerlöse',       sumD('effectiveRevenue'), '€'],
    ['Bruttogewinn',       sumD('grossProfit'), '€'],
    ['EBITDA',             sumD('ebitda'), '€'],
    ['EBIT',               sumD('ebit'), '€'],
    ['Jahresüberschuss',   sumD('netIncome'), '€'],
    ['Bruttomarge',        ld.grossMargin ?? 0, 'pct'],
    ['EBITDA-Marge',       ld.ebitdaMargin ?? 0, 'pct'],
    ['Netto-Marge',        ld.netMargin ?? 0, 'pct'],
  ]);
  cursor = writeKpiBlock(cursor, 'Bilanz-Struktur (Stand Periodenende)', [
    ['Bilanzsumme',          ld.totalAssets ?? 0, '€'],
    ['Eigenkapital',         ld.equity ?? 0, '€'],
    ['Verbindlichkeiten',    ld.totalLiabilities ?? 0, '€'],
    ['Working Capital',      ld.workingCapital ?? 0, '€'],
    ['Eigenkapitalquote',    ld.equityRatio ?? 0, 'pct'],
    ['Leverage (FK/EK)',     ld.leverage ?? 0, 'ratio'],
  ]);
  cursor = writeKpiBlock(cursor, 'Cashflow', [
    ['Operativ',     sumD('cashflowOperating'), '€'],
    ['Investiv',     sumD('cashflowInvesting'), '€'],
    ['Finanzierung', sumD('cashflowFinancing'), '€'],
    ['Netto-Liquiditätsveränderung', sumD('cashflowOperating') + sumD('cashflowInvesting') + sumD('cashflowFinancing'), '€'],
  ]);

  // Helper: build a single sheet that lists monthly columns (Jan..Dez or just one)
  const buildSheet = (name, blocks) => {
    const s = wb.addWorksheet(name);
    const cols = [{ key: 'label', width: 38 }, ...rows.map((c) => ({ key: `m${c.month}`, width: 16, header: `${months[c.month - 1]} ${c.year}` })), { key: 'total', width: 18, header: 'Gesamt' }];
    s.columns = cols;
    s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandHex } };
    s.getCell('A1').value = name; // overwrite first header

    let r = 2;
    for (const b of blocks) {
      if (b.section) {
        s.getCell(`A${r}`).value = b.section;
        s.getCell(`A${r}`).font = { bold: true, size: 11, color: { argb: brandHex } };
        s.getRow(r).height = 20;
        r++;
        continue;
      }
      const row = s.getRow(r);
      row.getCell(1).value = b.label;
      if (b.bold) row.getCell(1).font = { bold: true };
      let total = 0;
      rows.forEach((c, idx) => {
        const v = b.value(c);
        row.getCell(2 + idx).value = v;
        row.getCell(2 + idx).numFmt = '#,##0.00 "€"';
        if (b.bold) row.getCell(2 + idx).font = { bold: true };
        total += v || 0;
      });
      row.getCell(cols.length).value = total;
      row.getCell(cols.length).numFmt = '#,##0.00 "€"';
      if (b.bold) row.getCell(cols.length).font = { bold: true };
      r++;
    }
    return s;
  };

  // ── Sheet 2: GuV ────────────────────────────────────────────────────────
  buildSheet('GuV', [
    { section: 'Erträge' },
    { label: 'Umsatzerlöse',                value: (c) => c.derived.effectiveRevenue },
    { label: 'Summe Erträge',               value: (c) => c.derived.effectiveRevenue, bold: true },
    { section: 'Aufwendungen' },
    { label: 'Wareneinsatz / Material',      value: (c) => -c.cogs },
    { label: 'Personalkosten',               value: (c) => -c.personnel },
    { label: 'Marketing & Werbung',          value: (c) => -c.marketing },
    { label: 'Miete & Nebenkosten',          value: (c) => -c.rent },
    { label: 'Sonst. betr. Aufwendungen',    value: (c) => -c.opex },
    { label: 'Übrige Aufwendungen',          value: (c) => -c.other_expenses },
    { label: 'Abschreibungen',               value: (c) => -c.depreciation },
    { label: 'Summe Aufwendungen',           value: (c) => -(c.cogs + c.personnel + c.marketing + c.rent + c.opex + c.other_expenses + c.depreciation), bold: true },
    { section: 'Ergebnis' },
    { label: 'EBITDA',                       value: (c) => c.derived.ebitda, bold: true },
    { label: 'EBIT',                         value: (c) => c.derived.ebit, bold: true },
    { label: 'Zinserträge',                  value: (c) => c.interest_income },
    { label: 'Zinsaufwendungen',             value: (c) => -c.interest_expense },
    { label: 'Steuern',                      value: (c) => -c.tax },
    { label: 'Jahresüberschuss',             value: (c) => c.derived.netIncome, bold: true },
  ]);

  // ── Sheet 3: Bilanz ─────────────────────────────────────────────────────
  buildSheet('Bilanz', [
    { section: 'Aktiva' },
    { label: 'Kasse & Bank',                 value: (c) => c.cash },
    { label: 'Forderungen L+L',              value: (c) => c.receivables },
    { label: 'Vorräte',                      value: (c) => c.inventory_value },
    { label: 'Anlagevermögen',               value: (c) => c.fixed_assets },
    { label: 'Bilanzsumme',                  value: (c) => c.derived.totalAssets, bold: true },
    { section: 'Passiva' },
    { label: 'Verbindlichkeiten L+L',        value: (c) => c.payables },
    { label: 'Kurzfristige Verbindlichk.',   value: (c) => c.short_term_debt },
    { label: 'Langfristige Verbindlichk.',   value: (c) => c.long_term_debt },
    { label: 'Summe Fremdkapital',           value: (c) => c.derived.totalLiabilities, bold: true },
    { label: 'Eigenkapital',                 value: (c) => c.derived.equity, bold: true },
  ]);

  // ── Sheet 4: Cashflow ──────────────────────────────────────────────────
  buildSheet('Cashflow', [
    { section: 'Cashflow-Aufstellung' },
    { label: 'Operativer Cashflow',          value: (c) => c.derived.cashflowOperating ?? c.cashflow_operating },
    { label: 'Investiver Cashflow',          value: (c) => c.derived.cashflowInvesting ?? c.cashflow_investing },
    { label: 'Finanzierungs-Cashflow',       value: (c) => c.derived.cashflowFinancing ?? c.cashflow_financing },
    { label: 'Netto-Liquiditätsveränderung', value: (c) => (c.derived.cashflowOperating ?? c.cashflow_operating) + (c.derived.cashflowInvesting ?? c.cashflow_investing) + (c.derived.cashflowFinancing ?? c.cashflow_financing), bold: true },
    { label: 'Kasse (Stand)',                value: (c) => c.cash },
  ]);

  // ── Sheet 5: Kennzahlen (optional) ─────────────────────────────────────
  if (includeRatios) {
    const r2 = wb.addWorksheet('Kennzahlen');
    r2.columns = [
      { header: 'Periode', key: 'period', width: 18 },
      { header: 'Bruttomarge', key: 'grossMargin', width: 14 },
      { header: 'EBITDA-Marge', key: 'ebitdaMargin', width: 14 },
      { header: 'Netto-Marge', key: 'netMargin', width: 14 },
      { header: 'EK-Quote', key: 'equityRatio', width: 14 },
      { header: 'Leverage', key: 'leverage', width: 12 },
      { header: 'Working Capital', key: 'workingCapital', width: 16 },
      { header: 'Current Ratio', key: 'currentRatio', width: 14 },
      { header: 'Zinsdeckung', key: 'interestCoverage', width: 14 },
    ];
    r2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandHex } };
    for (const c of rows) {
      r2.addRow({
        period: `${months[c.month - 1]} ${c.year}`,
        grossMargin: c.derived.grossMargin,
        ebitdaMargin: c.derived.ebitdaMargin,
        netMargin: c.derived.netMargin,
        equityRatio: c.derived.equityRatio,
        leverage: c.derived.leverage,
        workingCapital: c.derived.workingCapital,
        currentRatio: c.derived.currentRatio,
        interestCoverage: c.derived.interestCoverage,
      });
    }
    [2,3,4,5].forEach((cidx) => { r2.getColumn(cidx).numFmt = '0.00%'; });
    [6,8,9].forEach((cidx) => { r2.getColumn(cidx).numFmt = '0.00'; });
    r2.getColumn(7).numFmt = '#,##0.00 "€"';
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="finanzbericht-${year}${whole ? '' : '-' + String(month).padStart(2, '0')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

/** 10-K/10-Q-Style Finanzbericht-PDF: Titelseite + GuV + Bilanz + Cashflow + Kennzahlen. */
router.get('/:year/:month/export.pdf', smeAuth, asyncHandler(async (req, res) => {
  const PDFDocument = require('pdfkit');
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  const sme   = db.get('SELECT * FROM unternehmen WHERE id = ?', [smeId]);
  const year  = +req.params.year;
  const month = +req.params.month;
  const whole = req.params.month === '0';
  const includeRatios = req.query.include === 'ratios' || req.query.include === 'full';

  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const rows = whole
    ? db.all('SELECT * FROM monthly_closings WHERE unternehmen_id = ? AND year = ? ORDER BY month', [smeId, year]).map(withRatios)
    : [withRatios(db.get('SELECT * FROM monthly_closings WHERE unternehmen_id=? AND year=? AND month=?', [smeId, year, month]))].filter(Boolean);
  if (rows.length === 0) throw httpError(404, 'Kein Abschluss gefunden');

  const fmtEUR = (n) => `€ ${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (n) => n == null ? '–' : `${(n * 100).toFixed(1)} %`;
  const fmtRatio = (n) => n == null ? '–' : n.toFixed(2);

  const sumD = (k) => rows.reduce((s, c) => s + (Number(c.derived?.[k]) || 0), 0);
  const sumF = (k) => rows.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  const lastC = rows[rows.length - 1];
  const ld = lastC.derived || {};

  // Landscape A4 when the report has more than 4 monthly columns —
  // otherwise portrait stays readable.
  const isWide = rows.length > 4;
  const doc = new PDFDocument({
    size: 'A4',
    layout: isWide ? 'landscape' : 'portrait',
    margin: 40,
    bufferPages: true,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="finanzbericht-${year}${whole ? '' : '-' + String(month).padStart(2, '0')}.pdf"`);
  doc.pipe(res);

  const brand = sme?.theme_color || '#1d3f36';
  const periodLabel = whole ? `Jahresabschluss ${year}` : `Monatsabschluss ${months[month - 1]} ${year}`;
  // In landscape we have 842pt width vs. 595pt in portrait — fit 12 monthly columns + total
  const PAGE_W = isWide ? 842 : 595;
  const colsPerPage = Math.min(rows.length, isWide ? 12 : 6);

  const innerW = PAGE_W - 100; // 50px margin each side (we use 40 but keep 50 inner for compatibility)
  const contentW = PAGE_W - 80; // for left=40 + right=40

  // ── Page 1: Title ───────────────────────────────────────────────────────
  doc.fontSize(9).fillColor('#666').text((sme?.firm_name || '').toUpperCase(), 50, 50, { characterSpacing: 1 });
  doc.fontSize(8).fillColor('#999').text(
    [sme?.address, [sme?.plz, sme?.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    50, 64,
  );
  if (sme?.phone || sme?.email) {
    doc.text([sme?.phone ? `Tel. ${sme.phone}` : null, sme?.email].filter(Boolean).join(' · '), 50, 76);
  }
  doc.moveTo(50, 100).lineTo(PAGE_W - 50, 100).strokeColor(brand).lineWidth(0.5).stroke();

  doc.fontSize(11).fillColor('#666').font('Helvetica').text('FINANZBERICHT', 50, 200, { characterSpacing: 3 });
  doc.fontSize(34).fillColor('#000').font('Helvetica-Bold').text(periodLabel, 50, 220, { width: innerW });
  doc.fontSize(13).fillColor('#666').font('Helvetica').text(`${sme?.firm_name || ''}${sme?.legal_form ? ' · ' + sme.legal_form : ''}`, 50, 280);

  // Headline KPIs on cover
  const kpiY = 360;
  const kpiW = (innerW - 20) / 4;
  const kpis = [
    { label: 'Umsatz', value: fmtEUR(sumD('effectiveRevenue')) },
    { label: 'EBITDA', value: fmtEUR(sumD('ebitda')) },
    { label: 'Netto-Marge', value: fmtPct(ld.netMargin) },
    { label: 'EK-Quote', value: fmtPct(ld.equityRatio) },
  ];
  kpis.forEach((k, i) => {
    const x = 50 + i * (kpiW + 6);
    doc.roundedRect(x, kpiY, kpiW, 70, 4).fillColor('#f8f9fa').fill();
    doc.fontSize(9).fillColor('#888').font('Helvetica').text(k.label, x + 12, kpiY + 12);
    doc.fontSize(15).fillColor('#000').font('Helvetica-Bold').text(k.value, x + 12, kpiY + 32);
  });

  const bottomY = isWide ? 480 : 540;
  doc.fontSize(9).fillColor('#999').text(
    'Inhalt: GuV (Gewinn- und Verlustrechnung) · Bilanz · Cashflow' + (includeRatios ? ' · Kennzahlen' : ''),
    50, bottomY
  );
  doc.fontSize(8).fillColor('#bbb').text(
    `Erstellt am ${new Date().toLocaleDateString('de-DE')} · Daten aus ${rows.length} Monatsabschluss${rows.length === 1 ? '' : 'en'}`,
    50, bottomY + 20
  );

  // ── Helpers ─────────────────────────────────────────────────────────────
  const RIGHT_X = PAGE_W - 50;
  const drawSectionPage = (title) => {
    doc.addPage({ size: 'A4', layout: isWide ? 'landscape' : 'portrait', margin: 40 });
    doc.fontSize(9).fillColor('#999').text((sme?.firm_name || '').toUpperCase(), 50, 40, { characterSpacing: 1 });
    doc.fontSize(8).fillColor('#bbb').text(periodLabel, RIGHT_X - 200, 40, { width: 200, align: 'right' });
    doc.moveTo(50, 60).lineTo(RIGHT_X, 60).strokeColor('#ddd').lineWidth(0.5).stroke();
    doc.fontSize(22).fillColor(brand).font('Helvetica-Bold').text(title, 50, 80);
    doc.moveTo(50, 118).lineTo(RIGHT_X, 118).strokeColor(brand).lineWidth(1).stroke();
    return 138;
  };

  // Adapt label/cell sizes to landscape so 12 monthly columns fit.
  const labelW  = isWide ? 200 : 220;
  const cellW   = (innerW - labelW) / Math.min(rows.length + 1, colsPerPage + 1);
  const rowFont = isWide && rows.length > 6 ? 8 : 9;

  const drawTableRow = (y, label, values, opts = {}) => {
    const totalW = innerW - labelW;
    const cellW2 = totalW / (values.length || 1);
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 10 : 9).fillColor(opts.muted ? '#888' : '#000');
    doc.text(label, 50, y, { width: labelW });
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      doc.text(typeof v === 'number' ? fmtEUR(v) : v, 50 + labelW + i * cellW2, y, { width: cellW2 - 4, align: 'right' });
    }
    if (opts.line) doc.moveTo(50, y + 14).lineTo(RIGHT_X, y + 14).strokeColor('#ddd').lineWidth(0.5).stroke();
    return y + 16;
  };

  const drawSectionHeader = (y, text) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text(text.toUpperCase(), 50, y, { characterSpacing: 0.5 });
    doc.moveTo(50, y + 14).lineTo(RIGHT_X, y + 14).strokeColor('#ddd').lineWidth(0.4).stroke();
    return y + 22;
  };

  // Column headers
  const drawColHeader = (y) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#666');
    rows.slice(0, colsPerPage).forEach((c, i) => {
      doc.text(months[c.month - 1].slice(0, 3) + (whole ? '' : ` ${c.year}`), 50 + labelW + i * cellW, y, { width: cellW - 4, align: 'right' });
    });
    if (rows.length > 0) {
      doc.fillColor(brand).text('Gesamt', 50 + labelW + Math.min(rows.length, colsPerPage) * cellW, y, { width: cellW - 4, align: 'right' });
    }
    doc.moveTo(50, y + 12).lineTo(RIGHT_X, y + 12).strokeColor(brand).lineWidth(0.8).stroke();
    return y + 20;
  };

  const renderRow = (y, label, getter, opts = {}) => {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? rowFont + 1 : rowFont).fillColor(opts.muted ? '#888' : '#000');
    doc.text(label, 50, y, { width: labelW });
    rows.slice(0, colsPerPage).forEach((c, i) => {
      const v = getter(c);
      doc.text(fmtEUR(v), 50 + labelW + i * cellW, y, { width: cellW - 4, align: 'right' });
    });
    const allTotal = rows.reduce((s, c) => s + (getter(c) || 0), 0);
    doc.font('Helvetica-Bold').fillColor(brand).text(fmtEUR(allTotal), 50 + labelW + Math.min(rows.length, colsPerPage) * cellW, y, { width: cellW - 4, align: 'right' });
    if (opts.line) doc.moveTo(50, y + 14).lineTo(RIGHT_X, y + 14).strokeColor('#ddd').lineWidth(0.5).stroke();
    return y + 16;
  };

  // ── GuV ────────────────────────────────────────────────────────────────
  let y = drawSectionPage('Gewinn- und Verlustrechnung');
  y = drawColHeader(y);
  y = drawSectionHeader(y, 'Erträge');
  y = renderRow(y, 'Umsatzerlöse (netto)', (c) => c.derived.effectiveRevenue);
  y = renderRow(y, 'Summe Erträge', (c) => c.derived.effectiveRevenue, { bold: true, line: true });
  y += 8;
  y = drawSectionHeader(y, 'Aufwendungen');
  y = renderRow(y, 'Wareneinsatz / Material',     (c) => -c.cogs);
  y = renderRow(y, 'Personalkosten',              (c) => -c.personnel);
  y = renderRow(y, 'Marketing & Werbung',         (c) => -c.marketing);
  y = renderRow(y, 'Miete & Nebenkosten',         (c) => -c.rent);
  y = renderRow(y, 'Sonst. betr. Aufwendungen',   (c) => -c.opex);
  y = renderRow(y, 'Übrige Aufwendungen',         (c) => -c.other_expenses);
  y = renderRow(y, 'Abschreibungen',              (c) => -c.depreciation);
  y = renderRow(y, 'Summe Aufwendungen', (c) => -(c.cogs + c.personnel + c.marketing + c.rent + c.opex + c.other_expenses + c.depreciation), { bold: true, line: true });
  y += 8;
  y = drawSectionHeader(y, 'Ergebnis');
  y = renderRow(y, 'EBITDA',           (c) => c.derived.ebitda, { bold: true });
  y = renderRow(y, 'EBIT',             (c) => c.derived.ebit, { bold: true });
  y = renderRow(y, 'Zinserträge',      (c) => c.interest_income);
  y = renderRow(y, 'Zinsaufwendungen', (c) => -c.interest_expense);
  y = renderRow(y, 'Steuern',          (c) => -c.tax);
  y += 4;
  y = renderRow(y, 'Jahresüberschuss', (c) => c.derived.netIncome, { bold: true });

  // ── Bilanz ─────────────────────────────────────────────────────────────
  y = drawSectionPage('Bilanz');
  doc.fontSize(9).fillColor('#888').text(`Stand: ${months[lastC.month - 1]} ${lastC.year} (letzter erfasster Monat)`, 50, y);
  y += 20;
  y = drawColHeader(y);
  y = drawSectionHeader(y, 'Aktiva');
  y = renderRow(y, 'Kasse & Bank',          (c) => c.cash);
  y = renderRow(y, 'Forderungen L+L',       (c) => c.receivables);
  y = renderRow(y, 'Vorräte',               (c) => c.inventory_value);
  y = renderRow(y, 'Anlagevermögen',        (c) => c.fixed_assets);
  y = renderRow(y, 'Bilanzsumme',           (c) => c.derived.totalAssets, { bold: true, line: true });
  y += 8;
  y = drawSectionHeader(y, 'Passiva');
  y = renderRow(y, 'Verbindlichkeiten L+L',     (c) => c.payables);
  y = renderRow(y, 'Kurzfristige Verbindlichk.', (c) => c.short_term_debt);
  y = renderRow(y, 'Langfristige Verbindlichk.', (c) => c.long_term_debt);
  y = renderRow(y, 'Summe Fremdkapital',     (c) => c.derived.totalLiabilities, { bold: true });
  y = renderRow(y, 'Eigenkapital',           (c) => c.derived.equity, { bold: true, line: true });

  // ── Cashflow ───────────────────────────────────────────────────────────
  y = drawSectionPage('Kapitalflussrechnung');
  y = drawColHeader(y);
  y = drawSectionHeader(y, 'Cashflow');
  y = renderRow(y, 'Operativer Cashflow',     (c) => c.derived.cashflowOperating ?? c.cashflow_operating);
  y = renderRow(y, 'Investiver Cashflow',     (c) => c.derived.cashflowInvesting ?? c.cashflow_investing);
  y = renderRow(y, 'Finanzierungs-Cashflow',  (c) => c.derived.cashflowFinancing ?? c.cashflow_financing);
  y = renderRow(y, 'Netto-Liquiditätsveränderung',
    (c) => (c.derived.cashflowOperating ?? c.cashflow_operating) + (c.derived.cashflowInvesting ?? c.cashflow_investing) + (c.derived.cashflowFinancing ?? c.cashflow_financing),
    { bold: true, line: true });
  y += 8;
  y = renderRow(y, 'Kasse (Stand)',           (c) => c.cash, { muted: true });

  // ── Kennzahlen ─────────────────────────────────────────────────────────
  if (includeRatios) {
    y = drawSectionPage('Kennzahlen');
    y = drawSectionHeader(y, 'Margen (Gesamtperiode)');
    y = drawTableRow(y, 'Bruttomarge',  [fmtPct(ld.grossMargin)]);
    y = drawTableRow(y, 'EBITDA-Marge', [fmtPct(ld.ebitdaMargin)]);
    y = drawTableRow(y, 'Netto-Marge',  [fmtPct(ld.netMargin)], { line: true });
    y += 8;
    y = drawSectionHeader(y, 'Bilanz-Struktur (Periodenende)');
    y = drawTableRow(y, 'Bilanzsumme',     [fmtEUR(ld.totalAssets)]);
    y = drawTableRow(y, 'Eigenkapital',    [fmtEUR(ld.equity)]);
    y = drawTableRow(y, 'Verbindlichkeiten', [fmtEUR(ld.totalLiabilities)]);
    y = drawTableRow(y, 'Working Capital', [fmtEUR(ld.workingCapital)]);
    y = drawTableRow(y, 'Eigenkapitalquote', [fmtPct(ld.equityRatio)]);
    y = drawTableRow(y, 'Leverage (FK/EK)',  [fmtRatio(ld.leverage)], { line: true });
    y += 8;
    y = drawSectionHeader(y, 'Liquidität');
    y = drawTableRow(y, 'Current Ratio',     [ld.currentRatio != null ? fmtRatio(ld.currentRatio) + 'x' : '–']);
    y = drawTableRow(y, 'Zinsdeckung',       [ld.interestCoverage != null ? fmtRatio(ld.interestCoverage) + 'x' : '–']);
  }

  // Footer on every page
  doc.flushPages();
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const pw = doc.page.width;
    doc.fontSize(7).fillColor('#bbb').text(
      `${sme?.firm_name || ''}${sme?.legal_form ? ' · ' + sme.legal_form : ''}${sme?.ust_id ? ' · USt-IdNr. ' + sme.ust_id : ''}`,
      50, doc.page.height - 50, { width: pw - 180, align: 'left' }
    );
    doc.text(`Seite ${i + 1} / ${range.count}`, pw - 110, doc.page.height - 50, { width: 60, align: 'right' });
  }
  doc.end();
}));

router.delete('/:year/:month', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);
  db.run('DELETE FROM monthly_closings WHERE unternehmen_id=? AND year=? AND month=?',
         [smeId, +req.params.year, +req.params.month]);
  res.json({ ok: true });
}));

/** Seed demo data for Deich Dynamics Solutions 2022–2025.
 *  Triggered by the SMP user manually; idempotent. */
router.post('/seed-demo', smeAuth, asyncHandler(async (req, res) => {
  const db    = getDb();
  const smeId = getSmeId(req.user.id);

  // Don't double-seed
  const has = db.get('SELECT COUNT(*) AS c FROM monthly_closings WHERE unternehmen_id=?', [smeId]).c;
  if (has > 0 && !req.body.force) return res.json({ ok: true, seeded: 0, skipped: 'already_has_data' });
  if (req.body.force) {
    db.run('DELETE FROM monthly_closings WHERE unternehmen_id=?', [smeId]);
  }

  // Deich Dynamics — synthetic plausible growth path 2022-2025.
  // Numbers chosen to give interesting ratios (working cap growth, leverage drop).
  const baseRevenueByYear = { 2022: 18000, 2023: 26000, 2024: 38000, 2025: 52000 };
  const seasonality = [0.85, 0.80, 1.05, 1.00, 1.10, 1.05, 0.75, 0.70, 1.05, 1.15, 1.20, 1.30];
  let cumCash = 5000;
  let inserted = 0;

  for (const year of [2022, 2023, 2024, 2025]) {
    const baseMonthly = baseRevenueByYear[year];
    for (let m = 1; m <= 12; m++) {
      if (year === 2025 && m > new Date().getMonth() + 1) break;
      const rev = Math.round(baseMonthly * seasonality[m - 1]);
      const cogs = Math.round(rev * 0.32);
      const personnel = Math.round(rev * 0.28);
      const marketing = Math.round(rev * 0.08);
      const rent = 1800;
      const otherExpenses = Math.round(rev * 0.06);
      const depreciation = 350;
      const interestExpense = year < 2025 ? 220 : 80;
      const grossProfit = rev - cogs;
      const ebitda = grossProfit - personnel - marketing - rent - otherExpenses;
      const ebit = ebitda - depreciation;
      const ebt = ebit - interestExpense;
      const tax = Math.max(0, Math.round(ebt * 0.30));
      const netIncome = ebt - tax;
      cumCash += Math.round(netIncome * 0.6);

      const cash = cumCash;
      const receivables = Math.round(rev * 0.35);
      const inventoryValue = Math.round(cogs * 0.5);
      const fixedAssets = 12000 - depreciation * ((year - 2022) * 12 + m);
      const payables = Math.round(cogs * 0.4);
      const shortTermDebt = year < 2024 ? 4500 : 2200;
      const longTermDebt = year < 2024 ? 18000 - (year - 2022) * 2400 : 6000;
      const totalAssets = cash + receivables + inventoryValue + fixedAssets;
      const equity = totalAssets - payables - shortTermDebt - longTermDebt;

      db.run(
        `INSERT INTO monthly_closings (id, unternehmen_id, year, month,
           revenue, cogs, opex, personnel, marketing, rent, other_expenses, depreciation,
           interest_income, interest_expense, tax,
           cash, receivables, inventory_value, fixed_assets,
           payables, short_term_debt, long_term_debt, equity,
           cashflow_operating, cashflow_investing, cashflow_financing,
           notes, locked, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uuid(), smeId, year, m,
          rev, cogs, 0, personnel, marketing, rent, otherExpenses, depreciation,
          0, interestExpense, tax,
          cash, receivables, inventoryValue, fixedAssets > 0 ? fixedAssets : 0,
          payables, shortTermDebt, longTermDebt, equity,
          Math.round(netIncome * 0.9 + depreciation), -200, -interestExpense,
          'Demo-Daten (auto-generiert)', year < 2025 ? 1 : 0, now(),
        ]
      );
      inserted++;
    }
  }
  res.json({ ok: true, seeded: inserted });
}));

module.exports = router;
