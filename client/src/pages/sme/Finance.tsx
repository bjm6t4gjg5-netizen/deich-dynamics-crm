import { useEffect, useState, useRef, useMemo } from 'react';
import { Banknote, Upload, Lock, Database, TrendingDown, Calculator, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { api, fmt, STORAGE } from '../../api';
import { useLang } from '../../context/LangContext';
import type { Invoice, Expense } from '../../types';
import Closings from './Closings';

/**
 * Finanzen — at-a-glance accounting view.
 *
 * Updated: Dashboard, GuV, Bilanz, Cashflow tabs all read from monthly_closings
 * (the canonical record). Live numbers from /invoices and /expenses are now
 * only used as a "fallback" / preview when no closings exist yet. The user
 * pflegt seine Zahlen über den Monatsabschluss-Wizard — Finanzen zeigt sie an.
 *
 * Auto-Suffix entfernt: GuV/Bilanz/Cashflow heißen nicht mehr "(auto)" weil sie
 * jetzt aus echten Abschlüssen kommen.
 */

const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

interface Closing {
  id: string;
  year: number;
  month: number;
  revenue: number;
  cogs: number;
  opex: number;
  personnel: number;
  marketing: number;
  rent: number;
  other_expenses: number;
  depreciation: number;
  interest_income: number;
  interest_expense: number;
  tax: number;
  cash: number;
  receivables: number;
  inventory_value: number;
  fixed_assets: number;
  payables: number;
  short_term_debt: number;
  long_term_debt: number;
  equity: number;
  cashflow_operating: number;
  cashflow_investing: number;
  cashflow_financing: number;
  notes?: string;
  locked: number;
  custom_lines?: Array<{ id: string; section: string; label: string; amount: number }>;
  derived?: {
    effectiveRevenue: number;
    grossProfit: number;
    ebitda: number;
    ebit: number;
    ebt: number;
    netIncome: number;
    totalAssets: number;
    totalLiabilities: number;
    equity: number;
    workingCapital: number;
    cashflowOperating: number;
    cashflowInvesting: number;
    cashflowFinancing: number;
    totalCashflow: number;
    grossMargin: number | null;
    ebitdaMargin: number | null;
    netMargin: number | null;
    leverage: number | null;
    debtToAssets: number | null;
    equityRatio: number | null;
    interestCoverage: number | null;
    currentRatio: number | null;
  };
}

export default function Finance({ onNavigate }: { onNavigate?: (page: string, hint?: any) => void } = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [period, setPeriod] = useState<'year' | 'quarter' | 'month'>('year');
  const [quarter, setQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [tab, setTab] = useState<'dashboard' | 'closing' | 'guv' | 'bilanz' | 'cashflow' | 'import'>('dashboard');
  const [exportOpen, setExportOpen] = useState(false);
  const { t } = useLang();

  const reload = () => Promise.all([
    api.sme.invoices(),
    api.sme.expenses(),
    api.get<Closing[]>('/sme/closings').catch(() => []),
  ]).then(([inv, exp, cls]) => { setInvoices(inv); setExpenses(exp); setClosings(cls); });

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  if (loading) return <div className="muted sm" style={{ padding: 40, textAlign: 'center' }}>Lade Finanzen…</div>;

  const years = Array.from(new Set([
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
    ...closings.map((c) => c.year),
    ...invoices.map((i) => +((i.paid_at || i.date || '').slice(0, 4))).filter(Boolean),
  ])).filter((y) => y > 2000).sort((a, b) => b - a);

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 18 }}>
        {([
          ['dashboard', `📊 ${t('finance_dashboard')}`],
          ['closing',   `🧾 ${t('finance_closing')}`],
          ['guv',       `📈 ${t('finance_guv')}`],
          ['bilanz',    `📋 ${t('finance_balance')}`],
          ['cashflow',  `💧 ${t('finance_cashflow')}`],
          ['import',    `📥 ${t('finance_excel_import')}`],
        ] as const).map(([v, l]) => (
          <button key={v} className={`tab${tab === v ? ' active' : ''}`} onClick={() => setTab(v as any)}>{l}</button>
        ))}
      </div>

      {tab === 'closing' && <Closings onNavigate={onNavigate} />}

      {tab !== 'closing' && tab !== 'import' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <span className="bold sm">{t('period')}</span>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            {(['year', 'quarter', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '6px 14px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  background: period === p ? 'var(--primary)' : 'transparent',
                  color: period === p ? '#fff' : 'var(--ink2)',
                  fontWeight: period === p ? 600 : 400,
                }}
              >
                {p === 'year' ? t('year_label') : p === 'quarter' ? t('quarter_label') : t('month_label')}
              </button>
            ))}
          </div>
          <select className="form-select" style={{ width: 110 }} value={year} onChange={(e) => setYear(+e.target.value)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {period === 'quarter' && (
            <select className="form-select" style={{ width: 90 }} value={quarter} onChange={(e) => setQuarter(+e.target.value)}>
              <option value={1}>Q1</option><option value={2}>Q2</option><option value={3}>Q3</option><option value={4}>Q4</option>
            </select>
          )}
          {period === 'month' && (
            <select className="form-select" style={{ width: 140 }} value={month} onChange={(e) => setMonth(+e.target.value)}>
              {['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
                .map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          )}
          <div style={{ flex: 1 }} />
          <ClosingsStatus year={year} closings={closings} />
          {tab === 'dashboard' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setExportOpen(true)} title="Periode exportieren">
              <Download size={12} />Export
            </button>
          )}
        </div>
      )}

      {tab === 'dashboard' && <DashboardTab year={year} period={period} quarter={quarter} month={month} closings={closings} invoices={invoices} expenses={expenses} onJumpToClosing={() => setTab('closing')} onOpenInvoice={(id) => onNavigate?.('invoices', { focus_invoice: id })} onOpenExport={() => setExportOpen(true)} />}
      {exportOpen && (
        <ExportDialog year={year} period={period} quarter={quarter} month={month} onClose={() => setExportOpen(false)} />
      )}
      {tab === 'guv' && <GuVTab year={year} period={period} quarter={quarter} month={month} closings={closings} invoices={invoices} expenses={expenses} onOpenInvoice={(id) => onNavigate?.('invoices', { focus_invoice: id })} />}
      {tab === 'bilanz' && <BilanzTab year={year} period={period} quarter={quarter} month={month} closings={closings} />}
      {tab === 'cashflow' && <CashflowTab year={year} closings={closings} invoices={invoices} expenses={expenses} />}
      {tab === 'import' && <ExcelImportTab onImported={reload} />}
    </div>
  );
}

/** Small inline indicator showing how many months of the selected year have a
 *  closing — encourages the user to maintain them. */
function ClosingsStatus({ year, closings }: { year: number; closings: Closing[] }) {
  const yearClosings = closings.filter((c) => c.year === year);
  const locked = yearClosings.filter((c) => c.locked).length;
  if (yearClosings.length === 0) {
    return <span className="badge badge-warn" style={{ fontSize: 11 }}>Keine Abschlüsse für {year}</span>;
  }
  return (
    <span className="muted sm">
      <strong>{yearClosings.length}/12</strong> Monate erfasst{locked > 0 ? ` · ${locked} gesperrt` : ''}
    </span>
  );
}

// Check whether a yyyy-mm-dd date falls into the selected period.
function isInPeriod(date: string, year: number, period: 'year' | 'quarter' | 'month', quarter: number, month: number): boolean {
  if (!date) return false;
  if (!date.startsWith(`${year}-`)) return false;
  const m = +date.slice(5, 7);
  if (period === 'year') return true;
  if (period === 'quarter') return m >= quarter * 3 - 2 && m <= quarter * 3;
  return m === month;
}

// Filter closings by period selection (year / quarter / single month).
function filterByPeriod(closings: Closing[], year: number, period: 'year' | 'quarter' | 'month', quarter: number, month: number): Closing[] {
  const y = closings.filter((c) => c.year === year);
  if (period === 'year') return y;
  if (period === 'quarter') {
    const months = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
    return y.filter((c) => months.includes(c.month));
  }
  return y.filter((c) => c.month === month);
}

function periodLabel(year: number, period: 'year' | 'quarter' | 'month', quarter: number, month: number) {
  if (period === 'year') return `${year}`;
  if (period === 'quarter') return `Q${quarter} ${year}`;
  return `${['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][month - 1]} ${year}`;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ year, period, quarter, month, closings, invoices, expenses, onJumpToClosing, onOpenInvoice, onOpenExport: _onOpenExport }: {
  year: number;
  period: 'year' | 'quarter' | 'month';
  quarter: number;
  month: number;
  closings: Closing[];
  invoices: Invoice[];
  expenses: Expense[];
  onJumpToClosing: () => void;
  onOpenInvoice: (id: string) => void;
  onOpenExport?: () => void;
}) {
  const yearClosings = useMemo(
    () => filterByPeriod(closings, year, period, quarter, month).sort((a, b) => a.month - b.month),
    [closings, year, period, quarter, month]
  );
  const totals = useMemo(() => sumYear(yearClosings), [yearClosings]);
  const ratios = useMemo(() => computeRatios(totals, yearClosings), [totals, yearClosings]);
  const [marginExplain, setMarginExplain] = useState<null | {
    title: string;
    formula: string;
    rows: Array<[string, string]>;
    result: string;
    trend?: Array<{ label: string; value: number }>;
    breakdown?: Array<{ label: string; value: number; share?: number }>;
    benchmark?: { value: number; unit: '%' | 'x' | '€'; rating: 'good' | 'ok' | 'bad'; benchmarkText: string; goodWhen: string; badWhen: string; pottedGold?: string };
    description?: string;
  }>(null);
  const [productView, setProductView] = useState(false);

  // Product revenue from paid invoices' line_items (Erlöse pro Produkt)
  const productRevenue = useMemo(() => {
    const byProd: Record<string, { net: number; invoices: Array<{ id: string; number: string }> }> = {};
    for (const inv of invoices) {
      if (inv.status !== 'Bezahlt') continue;
      const date = inv.paid_at || inv.date || '';
      if (!isInPeriod(date, year, period, quarter, month)) continue;
      let items: any[] = [];
      try { items = JSON.parse((inv as any).line_items || '[]'); } catch { items = []; }
      if (items.length === 0) {
        const key = inv.description || 'Sonstige Leistung';
        if (!byProd[key]) byProd[key] = { net: 0, invoices: [] };
        byProd[key].net += inv.net || 0;
        byProd[key].invoices.push({ id: inv.id, number: inv.invoice_number });
      } else {
        for (const it of items) {
          const key = (it.description || '').trim() || 'Ohne Beschreibung';
          if (!byProd[key]) byProd[key] = { net: 0, invoices: [] };
          byProd[key].net += ((+it.qty) || 0) * ((+it.unit_price) || 0);
          if (!byProd[key].invoices.find((x) => x.id === inv.id)) byProd[key].invoices.push({ id: inv.id, number: inv.invoice_number });
        }
      }
    }
    return Object.entries(byProd).sort((a, b) => b[1].net - a[1].net);
  }, [invoices, year, period, quarter, month]);

  // Top customers (paid revenue, gross, period-filtered)
  const byClient: Record<string, number> = {};
  for (const inv of invoices) {
    if (inv.status !== 'Bezahlt') continue;
    const date = inv.paid_at || inv.date || '';
    if (!isInPeriod(date, year, period, quarter, month)) continue;
    byClient[inv.client_name] = (byClient[inv.client_name] || 0) + (inv.gross || 0);
  }
  const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const fmtNum = (n: number) => fmt(n);
  const explainMargin = (key: 'gross' | 'ebitda' | 'net' | 'equity') => {
    if (key === 'gross') {
      const trend = yearClosings.map((c) => ({
        label: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][c.month - 1],
        value: (c.derived?.grossMargin ?? 0) * 100,
      }));
      const gm = (ratios.grossMargin ?? 0) * 100;
      setMarginExplain({
        title: 'Bruttomarge',
        formula: '(Umsatzerlöse − Wareneinsatz) / Umsatzerlöse',
        rows: [
          ['Umsatzerlöse (Periode)', fmtNum(totals.revenue)],
          ['– Wareneinsatz', fmtNum(totals.cogs)],
          ['= Bruttogewinn', fmtNum(totals.revenue - totals.cogs)],
          ['÷ Umsatzerlöse', fmtNum(totals.revenue)],
        ],
        result: pct(ratios.grossMargin),
        trend,
        description: 'Wie viel bleibt nach Material- und Wareneinsatz übrig? Je höher, desto mehr Spielraum für laufende Kosten, Marketing und Gewinn.',
        benchmark: {
          value: gm,
          unit: '%',
          rating: gm >= 50 ? 'good' : gm >= 30 ? 'ok' : 'bad',
          benchmarkText: 'Median Mittelstand: 40–60 %. Handel: 25–40 %, Dienstleistung: 50–70 %, Software/SaaS: 70–85 %.',
          goodWhen: 'Deine Margenstruktur trägt locker Personal, Miete und Marketing. Gut für Skalierung.',
          badWhen: 'Wenig Puffer für Fixkosten. Preise prüfen oder günstigeren Einkauf verhandeln.',
          pottedGold: gm < 40
            ? 'Großes Optimierungspotenzial: Lieferanten neu ausschreiben, Mengenrabatte verhandeln, Eigenmarken-Anteil erhöhen oder Verkaufspreis um 3–5 % anheben.'
            : undefined,
        },
      });
    } else if (key === 'ebitda') {
      const trend = yearClosings.map((c) => ({
        label: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][c.month - 1],
        value: c.derived?.ebitda ?? 0,
      }));
      const breakdown = [
        { label: 'Personal', value: totals.personnel },
        { label: 'Marketing', value: totals.marketing },
        { label: 'Miete', value: totals.rent },
        { label: 'Sonstige', value: totals.opex },
        { label: 'Übrige', value: totals.other_expenses },
      ].filter((b) => b.value !== 0).map((b) => ({ ...b, share: totals.revenue > 0 ? b.value / totals.revenue : 0 }));
      const em = (ratios.ebitdaMargin ?? 0) * 100;
      // Find largest cost block (potential lever)
      const largest = breakdown.length > 0 ? [...breakdown].sort((a, b) => b.value - a.value)[0] : null;
      setMarginExplain({
        title: 'EBITDA-Marge',
        formula: 'EBITDA / Umsatzerlöse',
        rows: [
          ['Bruttogewinn', fmtNum(totals.revenue - totals.cogs)],
          ['– Personalkosten', fmtNum(totals.personnel)],
          ['– Marketing', fmtNum(totals.marketing)],
          ['– Miete', fmtNum(totals.rent)],
          ['– Sonst. betr. Aufw.', fmtNum(totals.opex)],
          ['– Übrige Aufw.', fmtNum(totals.other_expenses)],
          ['= EBITDA', fmtNum(totals.ebitda)],
          ['÷ Umsatzerlöse', fmtNum(totals.revenue)],
        ],
        result: pct(ratios.ebitdaMargin),
        trend,
        breakdown,
        description: 'Operative Ertragskraft vor Zinsen, Steuern, Abschreibungen — die "echte" Profitabilität deines Geschäftsmodells.',
        benchmark: {
          value: em,
          unit: '%',
          rating: em >= 15 ? 'good' : em >= 8 ? 'ok' : 'bad',
          benchmarkText: 'Median Mittelstand: 8–12 %. Sehr gut: ≥ 15 %. Industrie: 10–18 %, Handel: 4–8 %, SaaS: 20–35 %.',
          goodWhen: 'Operatives Geschäft trägt sich selbst sehr gut — genug Substanz für Investitionen und Schuldenabbau.',
          badWhen: 'Operatives Geschäft ist knapp profitabel. Großer Hebel: Fixkostenblock prüfen.',
          pottedGold: em < 10 && largest
            ? `Größter Hebel: ${largest.label} (${pct(largest.share ?? 0)} vom Umsatz). Bereits 10 % Einsparung dort heben die EBITDA-Marge um ~${((largest.value * 0.1 / Math.max(totals.revenue, 1)) * 100).toFixed(1)} Prozentpunkte.`
            : undefined,
        },
      });
    } else if (key === 'net') {
      const trend = yearClosings.map((c) => ({
        label: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][c.month - 1],
        value: c.derived?.netIncome ?? 0,
      }));
      const nm = (ratios.netMargin ?? 0) * 100;
      setMarginExplain({
        title: 'Netto-Marge',
        formula: 'Jahresüberschuss / Umsatzerlöse',
        rows: [
          ['EBITDA', fmtNum(totals.ebitda)],
          ['– Abschreibungen', fmtNum(totals.depreciation)],
          ['+ Zinserträge', fmtNum(totals.interest_income)],
          ['– Zinsaufwendungen', fmtNum(totals.interest_expense)],
          ['– Steuern', fmtNum(totals.tax)],
          ['= Jahresüberschuss', fmtNum(totals.netIncome)],
          ['÷ Umsatzerlöse', fmtNum(totals.revenue)],
        ],
        result: pct(ratios.netMargin),
        trend,
        description: 'Was bleibt am Ende für die Eigentümer übrig — nach allen Kosten, Zinsen und Steuern.',
        benchmark: {
          value: nm,
          unit: '%',
          rating: nm >= 8 ? 'good' : nm >= 4 ? 'ok' : 'bad',
          benchmarkText: 'Median Mittelstand: 4–7 %. Sehr gut: ≥ 8 %. Auf Dauer < 3 % sind ein Risiko bei Krisenfestigkeit.',
          goodWhen: 'Solide Substanz. Du kannst Rücklagen bilden, dividieren oder investieren.',
          badWhen: 'Dünne Decke nach Steuern — eine Krise oder Investition kann das schnell ins Minus drehen.',
          pottedGold: totals.interest_expense > totals.netIncome * 0.5 && totals.interest_expense > 0
            ? `Zinsaufwand frisst spürbar Gewinn (${fmt(totals.interest_expense)}). Umschuldung auf günstigere Kredite oder Tilgung aus liquiden Mitteln prüfen.`
            : undefined,
        },
      });
    } else if (key === 'equity') {
      const totalAssets = ratios.totalAssets;
      const equity = totalAssets * (ratios.equityRatio ?? 0);
      const trend = yearClosings.map((c) => ({
        label: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][c.month - 1],
        value: (c.derived?.equityRatio ?? 0) * 100,
      }));
      const eq = (ratios.equityRatio ?? 0) * 100;
      setMarginExplain({
        title: 'Eigenkapitalquote',
        formula: 'Eigenkapital / Bilanzsumme',
        rows: [
          ['Eigenkapital (letzter Stand)', fmtNum(equity)],
          ['÷ Bilanzsumme', fmtNum(totalAssets)],
        ],
        result: pct(ratios.equityRatio),
        trend,
        description: 'Anteil eigenen Geldes an der Bilanzsumme — die wichtigste Kennzahl für Krisenfestigkeit und Bank-Bonität.',
        benchmark: {
          value: eq,
          unit: '%',
          rating: eq >= 30 ? 'good' : eq >= 20 ? 'ok' : 'bad',
          benchmarkText: 'Median Mittelstand: ~30 %. Banken-Schwellen: < 10 % = schwach, 10–25 % = solide, > 25 % = stark.',
          goodWhen: 'Bonität hervorragend, Banken-Kredite werden leicht und günstig vergeben.',
          badWhen: 'Hohe Fremdkapital-Abhängigkeit. Zinsänderungen treffen dich überproportional.',
          pottedGold: eq < 25
            ? 'Gewinne thesaurieren statt entnehmen, Sale-and-Lease-Back von Maschinen prüfen, oder Gesellschafterdarlehen in Eigenkapital umwandeln.'
            : undefined,
        },
      });
    }
  };

  if (yearClosings.length === 0) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
          <Database size={40} color="var(--ink3)" style={{ marginBottom: 14 }} />
          <h3 style={{ marginBottom: 8 }}>Noch keine Monatsabschlüsse für {periodLabel(year, period, quarter, month)}</h3>
          <p className="muted sm" style={{ maxWidth: 480, margin: '0 auto 18px', lineHeight: 1.6 }}>
            Das Finanz-Dashboard zeigt deine echten Kennzahlen — Erträge, EBITDA, Bilanzsumme, Liquidität — auf
            Basis der Monatsabschlüsse. Lege deinen ersten Abschluss an oder spiel Demo-Daten ein.
          </p>
          <button className="btn btn-primary" onClick={onJumpToClosing}>
            <Calculator size={13} />Zum Monatsabschluss
          </button>
        </div>
      </div>
    );
  }

  // Chart always shows the whole year so user can compare context;
  // the selected period gets full opacity, rest is dimmed.
  const fullYearClosings = closings.filter((c) => c.year === year);
  const maxMonth = Math.max(1, ...fullYearClosings.map((c) => Math.max(c.derived?.effectiveRevenue || c.revenue || 0, sumExpenses(c))));
  const isMonthInPeriod = (m: number) =>
    period === 'year' ? true :
    period === 'quarter' ? (m >= quarter * 3 - 2 && m <= quarter * 3) :
    m === month;
  const periodTitle = periodLabel(year, period, quarter, month);
  const monthsInScope = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;

  return (
    <>
      {/* KPIs — clickable to show breakdown + benchmark + recommendations */}
      <div className="stats-grid">
        <KpiCard
          label={`Umsatz ${periodTitle}`}
          value={fmt(totals.revenue)}
          sub={`${yearClosings.length}/${monthsInScope} Monate · ${pct(ratios.grossMargin)} Bruttomarge`}
          rating={ratingFor('gross', (ratios.grossMargin ?? 0) * 100)}
          onClick={() => explainMargin('gross')}
        />
        <KpiCard
          label="EBITDA"
          value={fmt(totals.ebitda)}
          sub={`${pct(ratios.ebitdaMargin)} Marge · Details öffnen`}
          rating={ratingFor('ebitda', (ratios.ebitdaMargin ?? 0) * 100)}
          isNegative={totals.ebitda < 0}
          onClick={() => explainMargin('ebitda')}
        />
        <KpiCard
          label="Jahresüberschuss"
          value={fmt(totals.netIncome)}
          sub={`${pct(ratios.netMargin)} Netto-Marge`}
          rating={ratingFor('net', (ratios.netMargin ?? 0) * 100)}
          isNegative={totals.netIncome < 0}
          onClick={() => explainMargin('net')}
        />
        <KpiCard
          label="Eigenkapitalquote"
          value={pct(ratios.equityRatio)}
          sub={`Bilanzsumme ${fmt(ratios.totalAssets)}`}
          rating={ratingFor('equity', (ratios.equityRatio ?? 0) * 100)}
          onClick={() => explainMargin('equity')}
        />
      </div>

      {/* Revenue/expense chart */}
      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title">Erträge vs. Aufwendungen {year}</span>
          <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ok)' }} /> Erträge
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--warn)' }} /> Aufwendungen
            </span>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, height: 180, alignItems: 'end' }}>
            {Array.from({ length: 12 }).map((_, idx) => {
              const m = idx + 1;
              const c = fullYearClosings.find((x) => x.month === m);
              const rev = c?.derived?.effectiveRevenue ?? c?.revenue ?? 0;
              const exp = c ? sumExpenses(c) : 0;
              const revHeight = (rev / maxMonth) * 100;
              const expHeight = (exp / maxMonth) * 100;
              const inPeriod = isMonthInPeriod(m);
              // No data → dim placeholder; data + outside selected period → 40%; selected period → full
              const opacity = !c ? 0.18 : (inPeriod ? 1 : 0.35);
              return (
                <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, width: '100%', justifyContent: 'center' }}>
                    <div title={`Erträge ${MONTHS[idx]}: ${fmt(rev)}`} style={{ width: '40%', height: `${revHeight}%`, background: 'var(--ok)', borderRadius: '2px 2px 0 0', minHeight: rev > 0 ? 2 : 0, opacity }} />
                    <div title={`Aufwendungen ${MONTHS[idx]}: ${fmt(exp)}`} style={{ width: '40%', height: `${expHeight}%`, background: 'var(--warn)', borderRadius: '2px 2px 0 0', minHeight: exp > 0 ? 2 : 0, opacity }} />
                  </div>
                  <div style={{ fontSize: 10, color: inPeriod ? 'var(--ink2)' : 'var(--ink4)', marginTop: 4, fontWeight: inPeriod ? 600 : 400 }}>{MONTHS[idx]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Ratios card */}
        <div className="card">
          <div className="card-header"><span className="card-title"><Calculator size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Kennzahlen {year}</span></div>
          <div className="card-body">
            <RatioRow label="Bruttomarge"        value={pct(ratios.grossMargin)} />
            <RatioRow label="EBITDA-Marge"       value={pct(ratios.ebitdaMargin)} />
            <RatioRow label="Netto-Marge"        value={pct(ratios.netMargin)} />
            <RatioRow label="Eigenkapitalquote"  value={pct(ratios.equityRatio)} />
            <RatioRow label="Leverage (FK/EK)"   value={ratioFmt(ratios.leverage)} />
            <RatioRow label="Working Capital"    value={fmt(ratios.workingCapital)} />
            <RatioRow label="Liquidität (CR)"    value={ratios.currentRatio != null ? ratioFmt(ratios.currentRatio) + '×' : '–'} />
            <RatioRow label="Zinsdeckung"        value={ratios.interestCoverage != null ? ratioFmt(ratios.interestCoverage) + '×' : '–'} />
          </div>
        </div>

        {/* Top customers */}
        <div className="card">
          <div className="card-header"><span className="card-title">Top-Kunden {year} (Gesamtumsatz, brutto)</span></div>
          <div className="card-body">
            {topClients.length === 0 ? (
              <p className="muted sm" style={{ padding: 8 }}>Noch keine bezahlten Rechnungen in {year}.</p>
            ) : (
              topClients.map(([name, total], i) => (
                <div key={name} className="fb" style={{ padding: '8px 0', borderBottom: i < topClients.length - 1 ? '1px solid var(--border2)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="avatar-sm">{i + 1}</span>
                    <span className="sm bold">{name}</span>
                  </div>
                  <span className="bold ok-c">{fmt(total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Erlöse pro Produkt */}
      {productRevenue.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-header">
            <span className="card-title">Erlöse pro Produkt / Position ({periodTitle})</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setProductView((v) => !v)}>
              {productView ? 'Als Balken' : 'Als Tabelle'}
            </button>
          </div>
          <div className="card-body">
            {(() => {
              const maxRev = Math.max(...productRevenue.map(([, v]) => v.net));
              if (productView) {
                return (
                  <div className="tbl-wrap">
                    <table>
                      <thead><tr><th>Position</th><th style={{ textAlign: 'right' }}>Umsatz (netto)</th><th style={{ textAlign: 'right' }}>Anteil</th><th>Quellen</th></tr></thead>
                      <tbody>
                        {productRevenue.slice(0, 30).map(([name, v]) => (
                          <tr key={name}>
                            <td className="bold sm">{name}</td>
                            <td className="bold" style={{ textAlign: 'right' }}>{fmt(v.net)}</td>
                            <td style={{ textAlign: 'right' }}>{totals.revenue > 0 ? pct(v.net / totals.revenue) : '–'}</td>
                            <td style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {v.invoices.slice(0, 4).map((i) => (
                                <button key={i.id} className="btn btn-ghost btn-sm" onClick={() => onOpenInvoice(i.id)} style={{ fontSize: 10 }}>
                                  {i.number}
                                </button>
                              ))}
                              {v.invoices.length > 4 && <span className="muted" style={{ fontSize: 10 }}>+{v.invoices.length - 4}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }
              return (
                <div>
                  {productRevenue.slice(0, 10).map(([name, v]) => (
                    <div key={name} style={{ marginBottom: 10 }}>
                      <div className="fb" style={{ marginBottom: 4 }}>
                        <span className="sm bold">{name}</span>
                        <span className="bold sm">{fmt(v.net)} <span className="muted" style={{ fontWeight: 400 }}>({totals.revenue > 0 ? pct(v.net / totals.revenue) : '–'})</span></span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg2)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(v.net / maxRev) * 100}%`, background: 'linear-gradient(90deg, var(--primary), var(--accent, var(--primary)))' }} />
                      </div>
                    </div>
                  ))}
                  {productRevenue.length > 10 && (
                    <p className="muted sm" style={{ marginTop: 8 }}>{productRevenue.length - 10} weitere Positionen — Tab „Als Tabelle" für komplette Liste.</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, padding: 14, background: 'var(--info-bg)', border: '1px solid var(--info)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--info)', lineHeight: 1.6 }}>
        <Banknote size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        Die Werte stammen aus deinen Monatsabschlüssen. Bearbeiten unter „Monatsabschluss". DATEV-Export &amp; ELSTER-Anbindung folgen.
      </div>

      {/* Margin-explain modal — Berechnung + Einordnung + Trend + Aufschlüsselung */}
      {marginExplain && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setMarginExplain(null)}>
          <div className="modal modal-xl">
            <div className="modal-hd">
              <span className="modal-title">{marginExplain.title} · {periodTitle}</span>
              <button className="modal-close" onClick={() => setMarginExplain(null)}>×</button>
            </div>
            <div className="modal-body">
              {marginExplain.description && (
                <p className="muted sm" style={{ marginBottom: 14, lineHeight: 1.6 }}>{marginExplain.description}</p>
              )}

              {/* Result hero with traffic light */}
              {(() => {
                const rating = marginExplain.benchmark?.rating;
                const heroColor = rating === 'good' ? 'var(--ok)' : rating === 'ok' ? 'var(--warn)' : rating === 'bad' ? 'var(--danger)' : 'var(--primary)';
                const heroBg = rating === 'good' ? 'rgba(5,150,105,.08)' : rating === 'ok' ? 'rgba(217,119,6,.08)' : rating === 'bad' ? 'rgba(220,38,38,.08)' : 'var(--primary-lt)';
                const ratingLabel = rating === 'good' ? '🟢 Stark — über Branchen-Median' : rating === 'ok' ? '🟡 Solide — im Markt-Bereich' : rating === 'bad' ? '🔴 Schwach — Handlungsbedarf' : '';
                return (
                  <div style={{ padding: 18, background: heroBg, borderRadius: 'var(--r-lg)', textAlign: 'center', marginBottom: 16, border: `1px solid ${heroColor}` }}>
                    <div className="muted sm" style={{ marginBottom: 4 }}>{marginExplain.title}</div>
                    <div className="bold" style={{ fontSize: 36, color: heroColor, lineHeight: 1.1, marginBottom: 4 }}>{marginExplain.result}</div>
                    {ratingLabel && <div style={{ fontSize: 13, fontWeight: 600, color: heroColor }}>{ratingLabel}</div>}
                    {marginExplain.benchmark?.benchmarkText && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>{marginExplain.benchmark.benchmarkText}</div>
                    )}
                  </div>
                );
              })()}

              {/* Einordnung: was ist gut / was ist riskant / wo lassen wir Geld liegen */}
              {marginExplain.benchmark && (
                <div style={{ display: 'grid', gridTemplateColumns: marginExplain.benchmark.pottedGold ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 18 }}>
                  <div style={{ padding: 12, background: 'rgba(5,150,105,.04)', border: '1px solid rgba(5,150,105,.25)', borderRadius: 'var(--r)' }}>
                    <div className="bold sm" style={{ color: 'var(--ok)', marginBottom: 6 }}>✓ Was ist gut</div>
                    <div className="sm" style={{ lineHeight: 1.5, color: 'var(--ink2)' }}>{marginExplain.benchmark.goodWhen}</div>
                  </div>
                  <div style={{ padding: 12, background: 'rgba(220,38,38,.04)', border: '1px solid rgba(220,38,38,.25)', borderRadius: 'var(--r)' }}>
                    <div className="bold sm" style={{ color: 'var(--danger)', marginBottom: 6 }}>⚠ Wo lauern Risiken</div>
                    <div className="sm" style={{ lineHeight: 1.5, color: 'var(--ink2)' }}>{marginExplain.benchmark.badWhen}</div>
                  </div>
                  {marginExplain.benchmark.pottedGold && (
                    <div style={{ padding: 12, background: 'rgba(217,119,6,.04)', border: '1px solid rgba(217,119,6,.25)', borderRadius: 'var(--r)' }}>
                      <div className="bold sm" style={{ color: 'var(--warn)', marginBottom: 6 }}>💰 Liegt Geld auf dem Tisch?</div>
                      <div className="sm" style={{ lineHeight: 1.5, color: 'var(--ink2)' }}>{marginExplain.benchmark.pottedGold}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Two-column: Formel/Berechnung + Trend */}
              <div className="grid-2" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="bold sm" style={{ marginBottom: 8, color: 'var(--primary)' }}>Berechnung</div>
                  <div style={{ padding: 10, background: 'var(--bg)', borderRadius: 'var(--r)', marginBottom: 10, fontFamily: 'monospace', fontSize: 12 }}>
                    {marginExplain.formula}
                  </div>
                  <div>
                    {marginExplain.rows.map(([label, val], i) => (
                      <div key={i} className="fb" style={{ padding: '5px 0', borderBottom: '1px dotted var(--border2)', fontSize: 12 }}>
                        <span>{label}</span>
                        <span className="bold">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {marginExplain.trend && marginExplain.trend.length > 0 && (
                  <div>
                    <div className="bold sm" style={{ marginBottom: 8, color: 'var(--primary)' }}>Verlauf {year}</div>
                    <TrendBars data={marginExplain.trend} />
                  </div>
                )}
              </div>

              {marginExplain.breakdown && marginExplain.breakdown.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="bold sm" style={{ marginBottom: 8, color: 'var(--primary)' }}>Aufschlüsselung der Aufwendungen</div>
                  {(() => {
                    const max = Math.max(...marginExplain.breakdown!.map((b) => b.value));
                    return marginExplain.breakdown!.map((b, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <div className="fb" style={{ marginBottom: 3, fontSize: 12 }}>
                          <span>{b.label}</span>
                          <span className="bold">{fmt(b.value)}{b.share != null ? <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>({pct(b.share)})</span> : null}</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${(b.value / max) * 100}%`, background: 'var(--primary)', borderRadius: 3 }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setMarginExplain(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

function RatioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="fb" style={{ padding: '8px 0', borderBottom: '1px dotted var(--border2)' }}>
      <span className="sm muted">{label}</span>
      <span className="bold">{value}</span>
    </div>
  );
}

// ── GuV ──────────────────────────────────────────────────────────────────────
function GuVTab({ year, period, quarter, month, closings, invoices, expenses, onOpenInvoice }: { year: number; period: 'year' | 'quarter' | 'month'; quarter: number; month: number; closings: Closing[]; invoices: Invoice[]; expenses: Expense[]; onOpenInvoice?: (id: string) => void }) {
  const yc = filterByPeriod(closings, year, period, quarter, month);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // Filter underlying records to selected period
  const paidInvoices = invoices.filter((i) => i.status === 'Bezahlt' && isInPeriod((i.paid_at || i.date || ''), year, period, quarter, month));
  const periodExpenses = expenses.filter((e) => isInPeriod((e.expense_date || ''), year, period, quarter, month));
  const expensesByCat = (matcher: (cat: string) => boolean) => periodExpenses.filter((e) => matcher((e.category || '').toLowerCase()));

  const drillSources: Record<string, { kind: 'invoices' | 'expenses'; items: any[] }> = {
    revenue:        { kind: 'invoices', items: paidInvoices },
    cogs:           { kind: 'expenses', items: expensesByCat((c) => c.includes('material') || c.includes('warene') || c.includes('cogs')) },
    personnel:      { kind: 'expenses', items: expensesByCat((c) => c.includes('personal')) },
    marketing:      { kind: 'expenses', items: expensesByCat((c) => c.includes('marketing') || c.includes('werbung')) },
    rent:           { kind: 'expenses', items: expensesByCat((c) => c.includes('miete')) },
    opex:           { kind: 'expenses', items: expensesByCat((c) => c.includes('sonstige') || c.includes('büro') || c.includes('software') || c.includes('versicherung')) },
    other_expenses: { kind: 'expenses', items: expensesByCat((c) => c.includes('übrige') || c.includes('sonstiges') || (!c.includes('personal') && !c.includes('marketing') && !c.includes('miete') && !c.includes('material') && !c.includes('software') && !c.includes('büro') && !c.includes('versicherung'))) },
  };

  if (yc.length === 0) return <NoClosingsFallback year={year} />;
  const t = sumYear(yc);

  return (
    <div className="card">
      <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="card-title" style={{ fontFamily: 'var(--font-display)' }}>Gewinn- und Verlustrechnung — {periodLabel(year, period, quarter, month)}</span>
        <span className="muted sm">nach EÜR / Monatsabschlüsse</span>
      </div>
      <div className="card-body" style={{ padding: '24px 28px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <tbody>
            <tr><td colSpan={2} style={{ padding: '6px 0 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink3)', borderBottom: '1px solid var(--border2)' }}>Erträge</td></tr>
            <GuVRow label="Umsatzerlöse (netto)" value={t.revenueBase}
              expandable expanded={expanded.has('revenue')} onToggle={() => toggle('revenue')}
              detail={<DrillRows source={drillSources.revenue} onOpenInvoice={onOpenInvoice} />}
            />
            {t.customIncome > 0 && <GuVRow label="Sonstige Erträge" value={t.customIncome} muted />}
            <tr><td style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>Summe Erträge</td><td style={{ textAlign: 'right', fontWeight: 600, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>{fmt(t.revenue)}</td></tr>

            <tr><td colSpan={2} style={{ padding: '14px 0 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink3)', borderBottom: '1px solid var(--border2)' }}>Aufwendungen</td></tr>
            <GuVRow label="Wareneinsatz / Material" value={t.cogs}
              expandable expanded={expanded.has('cogs')} onToggle={() => toggle('cogs')}
              detail={<DrillRows source={drillSources.cogs} />}
            />
            <GuVRow label="Personalkosten" value={t.personnel}
              expandable expanded={expanded.has('personnel')} onToggle={() => toggle('personnel')}
              detail={<DrillRows source={drillSources.personnel} />}
            />
            <GuVRow label="Marketing & Werbung" value={t.marketing}
              expandable expanded={expanded.has('marketing')} onToggle={() => toggle('marketing')}
              detail={<DrillRows source={drillSources.marketing} />}
            />
            <GuVRow label="Miete & Nebenkosten" value={t.rent}
              expandable expanded={expanded.has('rent')} onToggle={() => toggle('rent')}
              detail={<DrillRows source={drillSources.rent} />}
            />
            <GuVRow label="Sonstige betriebliche Aufwendungen" value={t.opex}
              expandable expanded={expanded.has('opex')} onToggle={() => toggle('opex')}
              detail={<DrillRows source={drillSources.opex} />}
            />
            <GuVRow label="Übrige Aufwendungen" value={t.other_expenses}
              expandable expanded={expanded.has('other_expenses')} onToggle={() => toggle('other_expenses')}
              detail={<DrillRows source={drillSources.other_expenses} />}
            />
            <GuVRow label="Abschreibungen" value={t.depreciation} />
            {t.customExpense > 0 && <GuVRow label="Eigene Positionen" value={t.customExpense} muted />}
            <tr><td style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>Summe Aufwendungen</td><td style={{ textAlign: 'right', fontWeight: 600, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>{fmt(t.totalOperatingExp + t.customExpense)}</td></tr>

            <tr><td style={{ padding: '14px 0 6px', fontWeight: 600 }}>EBITDA</td><td style={{ textAlign: 'right', padding: '14px 0 6px', fontWeight: 600 }}>{fmt(t.ebitda)}</td></tr>
            <GuVRow label="– Abschreibungen" value={t.depreciation} />
            <tr><td style={{ padding: '6px 0', fontWeight: 600 }}>EBIT</td><td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{fmt(t.ebit)}</td></tr>
            <GuVRow label="+ Zinserträge"     value={t.interest_income} />
            <GuVRow label="– Zinsaufwendungen" value={t.interest_expense} />
            <GuVRow label="– Steuern"          value={t.tax} />
            <tr style={{ borderTop: '2px solid var(--ink2)' }}>
              <td style={{ padding: '14px 0', fontWeight: 700, fontSize: 15 }}>Jahresüberschuss / -fehlbetrag</td>
              <td style={{ textAlign: 'right', padding: '14px 0', fontWeight: 700, fontSize: 15, color: t.netIncome >= 0 ? 'var(--ink1)' : 'var(--danger)' }}>{fmt(t.netIncome)}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted sm" style={{ marginTop: 12, lineHeight: 1.6 }}>
          Daten aus {yc.length} Monatsabschluss{yc.length === 1 ? '' : 'en'}. Werte ändern? → Tab „Monatsabschluss" → entsprechenden Monat öffnen.
        </p>

        {/* Reconciliation note: how this compares to raw invoices/expenses (live) */}
        <ReconciliationNote year={year} closings={yc} invoices={invoices} expenses={expenses} />
      </div>
    </div>
  );
}
function GuVRow({ label, value, muted, expandable, expanded, onToggle, detail }: {
  label: string; value: number; muted?: boolean;
  expandable?: boolean; expanded?: boolean; onToggle?: () => void;
  detail?: React.ReactNode;
}) {
  const clickable = !!expandable && !!onToggle;
  return (
    <>
      <tr
        style={{ cursor: clickable ? 'pointer' : undefined }}
        onClick={clickable ? onToggle : undefined}
      >
        <td style={{ padding: '5px 0', fontSize: 13, color: muted ? 'var(--ink3)' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          {expandable && (
            <span style={{ display: 'inline-block', width: 12, fontSize: 10, color: 'var(--ink4)', transition: 'transform .15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          )}
          {label}
        </td>
        <td style={{ textAlign: 'right', padding: '5px 0', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</td>
      </tr>
      {expandable && expanded && detail && (
        <tr>
          <td colSpan={2} style={{ padding: '0 0 8px 22px', background: 'var(--bg)' }}>
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}

function DrillRows({ source, onOpenInvoice }: {
  source: { kind: 'invoices' | 'expenses'; items: any[] };
  onOpenInvoice?: (id: string) => void;
}) {
  if (!source || source.items.length === 0) {
    return <div className="muted sm" style={{ padding: '8px 0' }}>Keine Einzelposten für diese Periode vorhanden — Wert kommt aus dem Monatsabschluss.</div>;
  }
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead>
        <tr style={{ color: 'var(--ink3)' }}>
          <th style={{ textAlign: 'left', padding: '4px 0' }}>{source.kind === 'invoices' ? 'Rechnung' : 'Beleg'}</th>
          <th style={{ textAlign: 'left', padding: '4px 0' }}>{source.kind === 'invoices' ? 'Kunde' : 'Lieferant'}</th>
          <th style={{ textAlign: 'left', padding: '4px 0' }}>{source.kind === 'invoices' ? 'Beschreibung' : 'Kategorie'}</th>
          <th style={{ textAlign: 'left', padding: '4px 0' }}>Datum</th>
          <th style={{ textAlign: 'right', padding: '4px 0' }}>Netto</th>
        </tr>
      </thead>
      <tbody>
        {source.items.map((it) => (
          <tr
            key={it.id}
            onClick={() => source.kind === 'invoices' && onOpenInvoice?.(it.id)}
            style={{ cursor: source.kind === 'invoices' ? 'pointer' : 'default' }}
          >
            <td style={{ padding: '3px 0' }}>{source.kind === 'invoices' ? it.invoice_number : (it.receipt_number || it.id.slice(0, 6))}</td>
            <td style={{ padding: '3px 0' }}>{source.kind === 'invoices' ? it.client_name : it.supplier}</td>
            <td style={{ padding: '3px 0', color: 'var(--ink3)' }}>{source.kind === 'invoices' ? it.description : it.category}</td>
            <td style={{ padding: '3px 0', color: 'var(--ink3)' }}>{((source.kind === 'invoices' ? (it.paid_at || it.date) : it.expense_date) || '').slice(0, 10)}</td>
            <td style={{ padding: '3px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(it.net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Bilanz ───────────────────────────────────────────────────────────────────
function BilanzTab({ year, period, quarter, month, closings }: { year: number; period: 'year' | 'quarter' | 'month'; quarter: number; month: number; closings: Closing[] }) {
  const yc = filterByPeriod(closings, year, period, quarter, month);
  if (yc.length === 0) return <NoClosingsFallback year={year} />;

  // Use the LATEST closing in the year for balance-sheet positions (stock-Größen, nicht Fluss-Größen)
  const latest = [...yc].sort((a, b) => b.month - a.month)[0];
  const d = latest.derived;
  const customAssets = (latest.custom_lines || []).filter((l) => l.section === 'asset');
  const customLiabs  = (latest.custom_lines || []).filter((l) => l.section === 'liability');
  const totalAssets = d?.totalAssets ?? ((latest.cash || 0) + (latest.receivables || 0) + (latest.inventory_value || 0) + (latest.fixed_assets || 0));
  const totalLiabs  = d?.totalLiabilities ?? ((latest.payables || 0) + (latest.short_term_debt || 0) + (latest.long_term_debt || 0));
  const equity      = d?.equity ?? (latest.equity || (totalAssets - totalLiabs));

  return (
    <div>
      <p className="muted sm" style={{ marginBottom: 14 }}>
        Stand: <strong>{MONTHS[latest.month - 1]} {year}</strong> (letzter erfasster Monatsabschluss)
      </p>
      <div className="grid-2">
        <div className="card">
          <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}><span className="card-title" style={{ fontFamily: 'var(--font-display)' }}>Aktiva</span><span className="muted sm">Vermögen</span></div>
          <div className="card-body">
            <BilanzRow label="Kasse & Bank"           value={latest.cash} />
            <BilanzRow label="Forderungen L+L"        value={latest.receivables} />
            <BilanzRow label="Vorräte / Lagerbestand" value={latest.inventory_value} />
            <BilanzRow label="Anlagevermögen"         value={latest.fixed_assets} />
            {customAssets.map((l) => (
              <BilanzRow key={l.id} label={`+ ${l.label}`} value={l.amount} />
            ))}
            <div className="fb" style={{ padding: '12px 0', borderTop: '2px solid var(--border)', marginTop: 8 }}>
              <span className="bold">Bilanzsumme</span>
              <span className="bold">{fmt(totalAssets)}</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}><span className="card-title" style={{ fontFamily: 'var(--font-display)' }}>Passiva</span><span className="muted sm">Kapital</span></div>
          <div className="card-body">
            <BilanzRow label="Verbindlichkeiten L+L"     value={latest.payables} />
            <BilanzRow label="Kurzfristige Verbindlichk." value={latest.short_term_debt} />
            <BilanzRow label="Langfristige Verbindlichk." value={latest.long_term_debt} />
            {customLiabs.map((l) => (
              <BilanzRow key={l.id} label={`+ ${l.label}`} value={l.amount} />
            ))}
            <div className="fb" style={{ padding: '6px 0', borderTop: '1px dotted var(--border2)' }}>
              <span className="bold sm">Summe Fremdkapital</span>
              <span className="bold sm">{fmt(totalLiabs)}</span>
            </div>
            <BilanzRow label="Eigenkapital" value={equity} />
            <div className="fb" style={{ padding: '12px 0', borderTop: '2px solid var(--border)', marginTop: 8 }}>
              <span className="bold">Bilanzsumme</span>
              <span className="bold">{fmt(totalLiabs + equity)}</span>
            </div>
          </div>
        </div>
      </div>
      {Math.abs(totalAssets - (totalLiabs + equity)) > 1 && (
        <div className="card mt-2" style={{ marginTop: 14 }}>
          <div className="card-body" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', fontSize: 13 }}>
            <strong>⚠️ Bilanz stimmt nicht überein:</strong> Aktiva ({fmt(totalAssets)}) ≠ Passiva + EK ({fmt(totalLiabs + equity)}).
            Differenz: {fmt(totalAssets - (totalLiabs + equity))}. Bitte Eigenkapital im Monatsabschluss korrigieren.
          </div>
        </div>
      )}
    </div>
  );
}
function BilanzRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="fb" style={{ padding: '7px 0', borderBottom: '1px dotted var(--border2)', fontSize: 13 }}>
      <span style={{ color: 'var(--ink2)' }}>{label}</span>
      <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
    </div>
  );
}

// ── Cashflow ─────────────────────────────────────────────────────────────────
function CashflowTab({ year, closings, invoices, expenses }: { year: number; closings: Closing[]; invoices: Invoice[]; expenses: Expense[] }) {
  const yc = closings.filter((c) => c.year === year).sort((a, b) => a.month - b.month);
  if (yc.length === 0) return <NoClosingsFallback year={year} />;
  let running = 0;
  const totalOp = yc.reduce((s, c) => s + (c.derived?.cashflowOperating ?? c.cashflow_operating ?? 0), 0);
  const totalInv = yc.reduce((s, c) => s + (c.derived?.cashflowInvesting ?? c.cashflow_investing ?? 0), 0);
  const totalFin = yc.reduce((s, c) => s + (c.derived?.cashflowFinancing ?? c.cashflow_financing ?? 0), 0);

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-label">Operativer Cashflow</div><div className="stat-value" style={{ color: totalOp < 0 ? 'var(--danger)' : 'var(--ink1)' }}>{fmt(totalOp)}</div></div>
        <div className="stat"><div className="stat-label">Investiver Cashflow</div><div className="stat-value" style={{ color: totalInv < 0 ? 'var(--danger)' : 'var(--ink1)' }}>{fmt(totalInv)}</div></div>
        <div className="stat"><div className="stat-label">Finanzierungs-Cashflow</div><div className="stat-value" style={{ color: totalFin < 0 ? 'var(--danger)' : 'var(--ink1)' }}>{fmt(totalFin)}</div></div>
        <div className="stat"><div className="stat-label">Netto-Liquiditätsveränderung</div><div className="stat-value">{fmt(totalOp + totalInv + totalFin)}</div></div>
      </div>

      <div className="card">
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="card-title" style={{ fontFamily: 'var(--font-display)' }}>Liquiditätsplan — {year}</span>
          <span className="muted sm">nach Monatsabschlüssen</span>
        </div>
        <div className="card-body">
          <table style={{ width: '100%' }}>
            <thead><tr><th>Monat</th><th style={{ textAlign: 'right' }}>Operativ</th><th style={{ textAlign: 'right' }}>Investiv</th><th style={{ textAlign: 'right' }}>Finanziell</th><th style={{ textAlign: 'right' }}>Netto</th><th style={{ textAlign: 'right' }}>Kumuliert</th><th style={{ textAlign: 'right' }}>Kasse</th></tr></thead>
            <tbody>
              {yc.map((c) => {
                const op  = c.derived?.cashflowOperating  ?? c.cashflow_operating  ?? 0;
                const inv = c.derived?.cashflowInvesting  ?? c.cashflow_investing  ?? 0;
                const fin = c.derived?.cashflowFinancing  ?? c.cashflow_financing  ?? 0;
                const net = op + inv + fin;
                running += net;
                return (
                  <tr key={`${c.year}-${c.month}`}>
                    <td className="bold sm">{MONTHS[c.month - 1]} {c.locked ? <Lock size={10} style={{ verticalAlign: '-1px', marginLeft: 4, color: 'var(--ink3)' }} /> : null}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(op)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(inv)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(fin)}</td>
                    <td style={{ textAlign: 'right', color: net >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(net)}</td>
                    <td className="bold" style={{ textAlign: 'right' }}>{fmt(running)}</td>
                    <td className="muted sm" style={{ textAlign: 'right' }}>{fmt(c.cash)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ReconciliationNote year={year} closings={yc} invoices={invoices} expenses={expenses} />
    </div>
  );
}

// ── Reconciliation: how closings compare to raw invoices/expenses ───────────
function ReconciliationNote({ year, closings, invoices, expenses }: { year: number; closings: Closing[]; invoices: Invoice[]; expenses: Expense[] }) {
  const yStart = `${year}-01-01`, yEnd = `${year}-12-31`;
  const rawRevenue = invoices.filter((i) => i.status === 'Bezahlt' && (i.paid_at || i.date || '') >= yStart && (i.paid_at || i.date || '') <= yEnd).reduce((s, i) => s + (i.net || 0), 0);
  const rawExpenses = expenses.filter((e) => (e.expense_date || '') >= yStart && (e.expense_date || '') <= yEnd).reduce((s, e) => s + (e.net || 0), 0);
  const closingRevenue = closings.reduce((s, c) => s + (c.revenue || 0), 0);
  const closingExpenses = closings.reduce((s, c) => s + sumExpenses(c), 0);
  const diffRev = closingRevenue - rawRevenue;
  const diffExp = closingExpenses - rawExpenses;
  return (
    <div style={{ marginTop: 14, padding: 12, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 12, lineHeight: 1.6 }}>
      <strong>Abgleich zur App-Buchhaltung:</strong>
      <div className="fb"><span>Umsatz aus Rechnungen (bezahlt, netto)</span><span>{fmt(rawRevenue)} {diffRev !== 0 && <span className="muted">(Δ {fmt(diffRev)})</span>}</span></div>
      <div className="fb"><span>Aufwand aus Belegen (netto)</span><span>{fmt(rawExpenses)} {diffExp !== 0 && <span className="muted">(Δ {fmt(diffExp)})</span>}</span></div>
      <p className="muted" style={{ marginTop: 6 }}>Diese Zahlen sind nur ein Sanity-Check. Maßgeblich für GuV/Bilanz/Cashflow sind deine Monatsabschlüsse.</p>
    </div>
  );
}

// ── No-data fallback ─────────────────────────────────────────────────────────
function NoClosingsFallback({ year }: { year: number }) {
  return (
    <div className="card">
      <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
        <TrendingDown size={36} color="var(--ink3)" style={{ marginBottom: 12 }} />
        <h3 style={{ marginBottom: 8 }}>Keine Monatsabschlüsse für {year}</h3>
        <p className="muted sm" style={{ maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
          GuV, Bilanz und Cashflow speisen sich aus deinen Monatsabschlüssen. Lege einen Abschluss an oder spiel
          Demo-Daten ein — unter <strong>Monatsabschluss</strong>.
        </p>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sumExpenses(c: Closing): number {
  const customExp = (c.custom_lines || []).filter((l) => l.section === 'expense').reduce((s, l) => s + (l.amount || 0), 0);
  return (c.cogs || 0) + (c.personnel || 0) + (c.marketing || 0) + (c.rent || 0) + (c.opex || 0) + (c.other_expenses || 0) + (c.depreciation || 0) + customExp;
}

interface YearTotals {
  revenueBase: number;
  customIncome: number;
  revenue: number;
  cogs: number;
  personnel: number;
  marketing: number;
  rent: number;
  opex: number;
  other_expenses: number;
  depreciation: number;
  customExpense: number;
  totalOperatingExp: number;
  ebitda: number;
  ebit: number;
  interest_income: number;
  interest_expense: number;
  tax: number;
  netIncome: number;
}

function sumYear(closings: Closing[]): YearTotals {
  const get = (key: keyof Closing) => closings.reduce((s, c) => s + ((c[key] as number) || 0), 0);
  const customIncome  = closings.reduce((s, c) => s + (c.custom_lines || []).filter((l) => l.section === 'income').reduce((a, l) => a + l.amount, 0), 0);
  const customExpense = closings.reduce((s, c) => s + (c.custom_lines || []).filter((l) => l.section === 'expense').reduce((a, l) => a + l.amount, 0), 0);
  const revenueBase = get('revenue');
  const revenue = revenueBase + customIncome;
  const cogs = get('cogs');
  const personnel = get('personnel');
  const marketing = get('marketing');
  const rent = get('rent');
  const opex = get('opex');
  const other_expenses = get('other_expenses');
  const depreciation = get('depreciation');
  const totalOperatingExp = cogs + personnel + marketing + rent + opex + other_expenses + depreciation;
  const grossProfit = revenue - cogs;
  const ebitda = grossProfit - personnel - marketing - rent - opex - other_expenses - customExpense;
  const ebit = ebitda - depreciation;
  const interest_income = get('interest_income');
  const interest_expense = get('interest_expense');
  const tax = get('tax');
  const ebt = ebit + interest_income - interest_expense;
  const netIncome = ebt - tax;
  return { revenueBase, customIncome, revenue, cogs, personnel, marketing, rent, opex, other_expenses, depreciation, customExpense, totalOperatingExp, ebitda, ebit, interest_income, interest_expense, tax, netIncome };
}

interface YearRatios {
  grossMargin: number | null;
  ebitdaMargin: number | null;
  netMargin: number | null;
  equityRatio: number | null;
  leverage: number | null;
  workingCapital: number;
  currentRatio: number | null;
  interestCoverage: number | null;
  totalAssets: number;
}

function computeRatios(t: YearTotals, closings: Closing[]): YearRatios {
  const latest = [...closings].sort((a, b) => b.month - a.month)[0];
  if (!latest) {
    return { grossMargin: null, ebitdaMargin: null, netMargin: null, equityRatio: null, leverage: null, workingCapital: 0, currentRatio: null, interestCoverage: null, totalAssets: 0 };
  }
  const d = latest.derived || {};
  return {
    grossMargin:  t.revenue > 0 ? (t.revenue - t.cogs) / t.revenue : null,
    ebitdaMargin: t.revenue > 0 ? t.ebitda / t.revenue : null,
    netMargin:    t.revenue > 0 ? t.netIncome / t.revenue : null,
    equityRatio:  (d as any).equityRatio ?? null,
    leverage:     (d as any).leverage ?? null,
    workingCapital: (d as any).workingCapital ?? 0,
    currentRatio: (d as any).currentRatio ?? null,
    interestCoverage: t.interest_expense > 0 ? t.ebit / t.interest_expense : null,
    totalAssets:  (d as any).totalAssets ?? 0,
  };
}

function pct(v: number | null | undefined): string {
  if (v == null) return '–';
  return `${(v * 100).toFixed(1)} %`;
}
function ratioFmt(v: number | null | undefined): string {
  if (v == null) return '–';
  return v.toFixed(2);
}

// ── Excel-Import (CSV) — unchanged from previous version ─────────────────────
function ExcelImportTab({ onImported }: { onImported: () => void }) {
  const [parsed, setParsed] = useState<any[]>([]);
  const [mode, setMode] = useState<'invoices' | 'expenses'>('invoices');
  const [filename, setFilename] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const parseFile = async (f: File | null | undefined) => {
    if (!f) return;
    setFilename(f.name);
    const text = await f.text();
    const sep = (text.split(/\r?\n/, 1)[0] || '').includes(';') ? ';' : ',';
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return;
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(sep);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''); });
      return obj;
    });
    setParsed(rows);
  };

  const doImport = async () => {
    setImporting(true); let ok = 0, fail = 0;
    for (const row of parsed) {
      try {
        if (mode === 'invoices') {
          await api.sme.createInvoice({
            client_name: row['kunde'] || row['client'] || row['client_name'] || 'Unbekannt',
            description: row['beschreibung'] || row['description'] || '',
            net: parseFloat(row['netto'] || row['net'] || '0') || 0,
            vat_rate: parseInt(row['mwst'] || row['vat'] || '19') || 19,
            due_date: row['fällig'] || row['due_date'] || '',
          });
        } else {
          await api.sme.createExpense({
            supplier: row['lieferant'] || row['supplier'] || 'Unbekannt',
            description: row['beschreibung'] || row['description'] || '',
            category: row['kategorie'] || row['category'] || 'Sonstiges',
            net: parseFloat(row['netto'] || row['net'] || '0') || 0,
            vat_rate: parseInt(row['mwst'] || row['vat'] || '19') || 19,
            expense_date: row['datum'] || row['date'] || '',
          });
        }
        ok++;
      } catch { fail++; }
    }
    setResult(`✓ ${ok} angelegt, ${fail} übersprungen`);
    setImporting(false);
    onImported();
  };

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Excel-Import (CSV)</span></div>
      <div className="card-body">
        <p className="muted sm" style={{ marginBottom: 14, lineHeight: 1.7 }}>
          Importiere Rechnungen oder Belege aus Excel/CSV. Erwartete Spalten:
          <br />
          <code>Rechnungen: Kunde · Beschreibung · Netto · MwSt · Fällig</code><br />
          <code>Belege: Lieferant · Beschreibung · Kategorie · Netto · MwSt · Datum</code>
        </p>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Typ</label>
            <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value as any)}>
              <option value="invoices">Rechnungen</option>
              <option value="expenses">Belege / Ausgaben</option>
            </select>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => parseFile(e.target.files?.[0])} />
        <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed var(--border)', borderRadius: 'var(--r-lg)', padding: 30, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)' }}>
          <Upload size={28} color="var(--ink3)" style={{ marginBottom: 8 }} />
          <div className="bold sm">{filename || 'CSV-Datei wählen oder hierher ziehen'}</div>
          <div className="muted sm">UTF-8, Semikolon- oder Komma-getrennt</div>
        </div>
        {parsed.length > 0 && (
          <>
            <p style={{ marginTop: 14, fontSize: 13 }}><strong>{parsed.length}</strong> Datensätze erkannt.</p>
            <button className="btn btn-primary" onClick={doImport} disabled={importing}>
              {importing ? 'Importiere…' : `${parsed.length} ${mode === 'invoices' ? 'Rechnungen' : 'Belege'} importieren`}
            </button>
          </>
        )}
        {result && <div className="ok-box" style={{ marginTop: 14 }}>{result}</div>}
      </div>
    </div>
  );
}

// ── KPI-Karte mit Ampel-Punkt + Info-Hint ───────────────────────────────────
type Rating = 'good' | 'ok' | 'bad' | null;
function ratingFor(kind: 'gross' | 'ebitda' | 'net' | 'equity', pctValue: number): Rating {
  if (!Number.isFinite(pctValue)) return null;
  if (kind === 'gross')  return pctValue >= 50 ? 'good' : pctValue >= 30 ? 'ok' : 'bad';
  if (kind === 'ebitda') return pctValue >= 15 ? 'good' : pctValue >= 8  ? 'ok' : 'bad';
  if (kind === 'net')    return pctValue >= 8  ? 'good' : pctValue >= 4  ? 'ok' : 'bad';
  if (kind === 'equity') return pctValue >= 30 ? 'good' : pctValue >= 20 ? 'ok' : 'bad';
  return null;
}

function KpiCard({ label, value, sub, rating, isNegative, onClick }: {
  label: string;
  value: string;
  sub?: string;
  rating: Rating;
  isNegative?: boolean;
  onClick: () => void;
}) {
  const dotColor = rating === 'good' ? 'var(--ok)' : rating === 'ok' ? 'var(--warn)' : rating === 'bad' ? 'var(--danger)' : 'transparent';
  const valueColor = isNegative
    ? 'var(--danger)'
    : rating === 'good' ? 'var(--ok)' : rating === 'bad' ? 'var(--danger)' : 'var(--ink1)';
  return (
    <div
      className="stat stat-click"
      onClick={onClick}
      style={{ cursor: 'pointer', position: 'relative' }}
      title="Klicken für Berechnung, Branchen-Vergleich und Empfehlungen"
    >
      {/* Ampel-Punkt oben rechts */}
      {rating && (
        <span
          aria-hidden
          style={{
            position: 'absolute', top: 12, right: 12, width: 10, height: 10, borderRadius: 5, background: dotColor,
            boxShadow: `0 0 0 3px ${dotColor === 'transparent' ? 'transparent' : 'rgba(0,0,0,0.04)'}`,
          }}
        />
      )}
      {/* Info-Icon — gerendert dezent unten rechts */}
      <span style={{ position: 'absolute', bottom: 10, right: 12, color: 'var(--ink4)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: 7, border: '1px solid var(--ink4)',
          fontSize: 9, fontWeight: 700,
        }}>i</span>
      </span>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: valueColor }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── TrendBars — kompaktes Mini-Chart für die Margen-Modale ───────────────────
function TrendBars({ data }: { data: Array<{ label: string; value: number }> }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 4, height: 120, alignItems: 'flex-end', padding: '6px 0' }}>
      {data.map((d) => {
        const h = (Math.abs(d.value) / max) * 100;
        const negative = d.value < 0;
        return (
          <div key={d.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }} title={`${d.label}: ${d.value.toFixed(1)}`}>
            <div style={{
              width: '100%',
              height: `${h}%`,
              background: negative ? 'var(--danger)' : 'var(--primary)',
              borderRadius: '3px 3px 0 0',
              minHeight: 2,
              opacity: 0.85,
            }} />
            <div style={{ fontSize: 9, color: 'var(--ink3)', marginTop: 3 }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── ExportDialog — Format + Optionen ─────────────────────────────────────────
function ExportDialog({ year, period, quarter, month, onClose }: { year: number; period: 'year' | 'quarter' | 'month'; quarter: number; month: number; onClose: () => void }) {
  const [format, setFormat] = useState<'xlsx' | 'pdf' | 'csv'>('xlsx');
  const [includeRatios, setIncludeRatios] = useState(true);
  const [busy, setBusy] = useState(false);
  const periodLbl = period === 'year' ? `${year}` : period === 'quarter' ? `Q${quarter} ${year}` : `${['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][month - 1]} ${year}`;

  const doExport = async () => {
    setBusy(true);
    try {
      const token = localStorage.getItem(STORAGE.TOKEN_KEY);
      // For year exports we use :month=0; for quarter we export each month and let user pick year-export instead.
      const m = period === 'month' ? month : 0;
      const ext = format === 'csv' ? 'xlsx' : format; // server only has xlsx + pdf — CSV via xlsx
      const url = `/api/sme/closings/${year}/${m}/export.${ext}${includeRatios ? '?include=ratios' : ''}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `finanzen-${year}${m > 0 ? '-' + String(m).padStart(2, '0') : ''}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      onClose();
    } catch (e: any) {
      alert('Export fehlgeschlagen: ' + e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <span className="modal-title">Export · {periodLbl}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Format</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {([
                ['xlsx', FileSpreadsheet, 'Excel', 'für Steuerberater'],
                ['pdf',  FileText,        'PDF',   'zum Drucken'],
                ['csv',  Download,        'CSV',   'für andere Tools'],
              ] as const).map(([v, Icon, label, hint]) => (
                <button
                  key={v}
                  onClick={() => setFormat(v as any)}
                  style={{
                    padding: 14, border: format === v ? '2px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: 'var(--r)', background: format === v ? 'var(--primary-lt)' : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'center',
                  }}
                >
                  <Icon size={20} color={format === v ? 'var(--primary)' : 'var(--ink3)'} style={{ marginBottom: 4 }} />
                  <div className="bold sm">{label}</div>
                  <div className="muted" style={{ fontSize: 10 }}>{hint}</div>
                </button>
              ))}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r)' }}>
            <input type="checkbox" checked={includeRatios} onChange={(e) => setIncludeRatios(e.target.checked)} />
            <div>
              <div className="bold sm">Mit Kennzahlen &amp; Graphen</div>
              <div className="muted" style={{ fontSize: 11 }}>Inklusive Margen, EK-Quote, Working Capital etc.</div>
            </div>
          </label>
          <p className="muted sm" style={{ marginTop: 14, lineHeight: 1.6 }}>
            Der Export enthält {period === 'year' ? 'alle Monate des Geschäftsjahrs' : period === 'month' ? 'den ausgewählten Monat' : 'das ausgewählte Quartal (als Jahresübersicht)'}.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={doExport} disabled={busy}>
            <Download size={13} />{busy ? 'Erstelle…' : 'Herunterladen'}
          </button>
        </div>
      </div>
    </div>
  );
}
