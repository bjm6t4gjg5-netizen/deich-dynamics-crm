import { useEffect, useMemo, useState } from 'react';
import { Save, Database, Lock, Unlock, Calculator, Sparkles, ChevronLeft, ChevronRight, Plus, Trash2, CheckCircle2, Circle, Download, FileSpreadsheet, FileText, Archive, FilePlus } from 'lucide-react';
import { api, fmt, STORAGE } from '../../api';
import { Empty } from '../../components/ui';
import { CurrencyInput } from '../../components/CurrencyInput';

/**
 * Monatsabschluss-Wizard.
 *
 * Replaces the old "all fields on one page" editor with a step-by-step flow:
 *   Step 1 — Erträge
 *   Step 2 — Aufwendungen
 *   Step 3 — Finanzergebnis & Steuern
 *   Step 4 — Bilanz · Aktiva
 *   Step 5 — Bilanz · Passiva
 *   Step 6 — Cashflow
 *   Step 7 — Übersicht & Kennzahlen
 *
 * In each step the user can add custom line items (e.g. "Erstattung Krankenkasse"
 * under Erträge) — these are stored as a JSON list on the closing row and flow
 * into the ratios computed by the server.
 *
 * Entsperren-Bug fix: previously "Entsperren" called save(false) which
 * persisted the *current* form state — overwriting fresh user input. Now
 * Entsperren and Sperren are dedicated lock-only PATCH calls, separate from
 * the data save.
 */

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

interface FieldDef { key: string; label: string; hint?: string }
interface StepDef {
  id: string;
  title: string;
  icon: string;
  fields: FieldDef[];
  customSection?: string; // section name for custom line items belonging to this step
  description?: string;
}

const STEPS: StepDef[] = [
  {
    id: 'income', title: 'Erträge', icon: '📈',
    description: 'Welche Einnahmen sind in diesem Monat angefallen? Umsatzerlöse zählen netto (ohne USt).',
    fields: [
      { key: 'revenue', label: 'Umsatzerlöse (netto)', hint: 'Bezahlte und gestellte Rechnungen' },
    ],
    customSection: 'income',
  },
  {
    id: 'expenses', title: 'Aufwendungen', icon: '📉',
    description: 'Was hat das Unternehmen in diesem Monat gekostet?',
    fields: [
      { key: 'cogs',           label: 'Wareneinsatz / Materialkosten' },
      { key: 'personnel',      label: 'Personalkosten' },
      { key: 'marketing',      label: 'Marketing & Werbung' },
      { key: 'rent',           label: 'Miete & Nebenkosten' },
      { key: 'opex',           label: 'Sonstige betriebliche Aufwendungen' },
      { key: 'other_expenses', label: 'Übrige Aufwendungen' },
      { key: 'depreciation',   label: 'Abschreibungen' },
    ],
    customSection: 'expense',
  },
  {
    id: 'finance', title: 'Finanzergebnis & Steuern', icon: '💸',
    description: 'Zinsen und Steuerlast für die EBT/Jahresüberschuss-Rechnung.',
    fields: [
      { key: 'interest_income',  label: 'Zinserträge' },
      { key: 'interest_expense', label: 'Zinsaufwendungen' },
      { key: 'tax',              label: 'Steuern (KSt, GewSt)' },
    ],
  },
  {
    id: 'assets', title: 'Bilanz · Aktiva', icon: '🏦',
    description: 'Vermögen des Unternehmens zum Monatsende.',
    fields: [
      { key: 'cash',            label: 'Kasse & Bank' },
      { key: 'receivables',     label: 'Forderungen (offene Kundenrechnungen)' },
      { key: 'inventory_value', label: 'Vorräte / Lagerbestand' },
      { key: 'fixed_assets',    label: 'Anlagevermögen' },
    ],
    customSection: 'asset',
  },
  {
    id: 'liabilities', title: 'Bilanz · Passiva', icon: '🏛️',
    description: 'Verbindlichkeiten und Eigenkapital zum Monatsende.',
    fields: [
      { key: 'payables',        label: 'Verbindlichkeiten (L+L)' },
      { key: 'short_term_debt', label: 'Kurzfristige Verbindlichkeiten' },
      { key: 'long_term_debt',  label: 'Langfristige Verbindlichkeiten' },
      { key: 'equity',          label: 'Eigenkapital' },
    ],
    customSection: 'liability',
  },
  {
    id: 'cashflow', title: 'Cashflow', icon: '💧',
    description: 'Liquiditätsbewegungen — operativ, investiv, finanziell.',
    fields: [
      { key: 'cashflow_operating', label: 'Operativer Cashflow' },
      { key: 'cashflow_investing', label: 'Investiver Cashflow' },
      { key: 'cashflow_financing', label: 'Finanzierungs-Cashflow' },
    ],
  },
  {
    id: 'summary', title: 'Übersicht & Kennzahlen', icon: '✅',
    description: 'Alle Werte im Überblick mit automatisch berechneten Kennzahlen.',
    fields: [],
  },
];

interface CustomLine { id: string; section: string; label: string; amount: number; note?: string }

export default function Closings({ initialYear, initialMonth, onNavigate }: { initialYear?: number; initialMonth?: number; onNavigate?: (page: string, hint?: any) => void } = {}) {
  const now = new Date();
  const [year, setYear]   = useState(initialYear  || now.getFullYear());
  const [month, setMonth] = useState(initialMonth || now.getMonth() + 1);
  const [closing, setClosing] = useState<any>(null);
  const [form, setForm]   = useState<any>({});
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<'new' | 'archive' | 'edit'>('new');
  const [editArchived, setEditArchived] = useState<{ year: number; month: number } | null>(null);
  const [originalSnapshot, setOriginalSnapshot] = useState<string>(''); // for dirty detection
  const [busy, setBusy]   = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [listing, setListing] = useState<any[]>([]);
  const [suggestion, setSuggestion] = useState<{ invoices: any[]; total: number; perCategory: Record<string, number>; perExpense: any[] } | null>(null);
  const [drillDown, setDrillDown] = useState<{ kind: 'revenue' | 'expense'; items: any[]; title: string } | null>(null);
  const [viewerClosing, setViewerClosing] = useState<any | null>(null);

  const load = async () => {
    const r = await api.get<any>(`/sme/closings/${year}/${month}`).catch(() => null);
    setClosing(r);
    setForm(r || {});
    setCustomLines(Array.isArray(r?.custom_lines) ? r.custom_lines : []);
    setOriginalSnapshot(JSON.stringify({ form: r || {}, customLines: Array.isArray(r?.custom_lines) ? r.custom_lines : [] }));
  };

  const isDirty = JSON.stringify({ form, customLines }) !== originalSnapshot;
  const loadList = () => api.get<any[]>('/sme/closings').then(setListing).catch(() => setListing([]));

  useEffect(() => { load(); loadSuggestion(); }, [year, month]);
  useEffect(() => { loadList(); }, []);
  // Cmd/Ctrl+S → speichern
  useEffect(() => {
    if (tab !== 'new' && tab !== 'edit') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        save(false).catch(() => { /* ignore */ });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, form, customLines, closing]);
  useEffect(() => { setStep(0); }, [year, month]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const loadSuggestion = async () => {
    try {
      const [invs, exps] = await Promise.all([
        api.sme.invoices(),
        api.sme.expenses(),
      ]);
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const next  = new Date(year, month, 1).toISOString().slice(0, 10);
      const inMonth = (date: string) => date && date >= start && date < next;
      const paidInMonth = (invs as any[]).filter((i) => i.status === 'Bezahlt' && inMonth(i.paid_at || i.date));
      const expInMonth  = (exps as any[]).filter((e) => inMonth(e.expense_date));

      const total = paidInMonth.reduce((s, i) => s + (i.net || 0), 0);
      const perCategory: Record<string, number> = {};
      for (const e of expInMonth) {
        const cat = e.category || 'Sonstiges';
        perCategory[cat] = (perCategory[cat] || 0) + (e.net || 0);
      }
      setSuggestion({ invoices: paidInMonth, total, perCategory, perExpense: expInMonth });
    } catch {
      setSuggestion(null);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    const byCat = (name: string) => suggestion.perExpense
      .filter((e) => (e.category || '').toLowerCase().includes(name.toLowerCase()))
      .reduce((s, e) => s + (e.net || 0), 0);
    const other = suggestion.perExpense
      .filter((e) => {
        const c = (e.category || '').toLowerCase();
        return !c.includes('personal') && !c.includes('marketing') && !c.includes('miete');
      })
      .reduce((s, e) => s + (e.net || 0), 0);
    setForm((f: any) => ({
      ...f,
      revenue: suggestion.total,
      personnel: byCat('personal'),
      marketing: byCat('marketing'),
      rent: byCat('miete'),
      other_expenses: other,
    }));
  };

  const downloadExport = async (fmt: 'xlsx' | 'pdf', includeRatios: boolean) => {
    const token = localStorage.getItem(STORAGE.TOKEN_KEY);
    const url = `/api/sme/closings/${year}/${month}/export.${fmt}${includeRatios ? '?include=ratios' : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { alert('Export fehlgeschlagen'); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `abschluss-${year}-${String(month).padStart(2, '0')}.${fmt}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const drillIntoInvoice = (invoiceId: string) => {
    if (onNavigate) onNavigate('invoices', { focus_invoice: invoiceId });
  };
  const drillIntoExpense = (_expenseId: string) => {
    if (onNavigate) onNavigate('expenses');
  };

  const suggest = applySuggestion;

  const save = async (silent = false) => {
    setBusy(true);
    try {
      await api.put(`/sme/closings/${year}/${month}`, {
        ...form,
        custom_lines: customLines,
        locked: closing?.locked ? 1 : 0,
      });
      if (!silent) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2500);
      }
      await load();
      await loadList();
    } catch (e: any) { if (!silent) alert(e.message); throw e; }
    finally { setBusy(false); }
  };

  const toggleLock = async (locked: boolean) => {
    if (!closing) {
      alert('Bitte zuerst speichern, bevor der Abschluss gesperrt werden kann.');
      return;
    }
    if (locked && !confirm('Abschluss sperren? Nach dem Sperren sind keine Änderungen mehr möglich, ohne vorher zu entsperren.')) return;
    try {
      await api.patch(`/sme/closings/${year}/${month}/lock`, { locked });
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const seedDemo = async () => {
    if (!confirm('Demo-Daten für 2022-2025 einspielen? Falls bereits Daten vorhanden sind, werden sie übersprungen.')) return;
    try {
      const r = await api.post<any>('/sme/closings/seed-demo', { force: false });
      alert(`${r.seeded} Monatsabschlüsse angelegt.`);
      await load(); await loadList();
    } catch (e: any) { alert(e.message); }
  };

  const locked = !!closing?.locked;
  const ratios = useMemo(() => deriveLocal({ ...form, custom_lines: customLines }), [form, customLines]);

  const years = Array.from(new Set([
    new Date().getFullYear(), 2022, 2023, 2024, 2025,
    ...listing.map((c: any) => c.year),
  ])).sort((a, b) => b - a);

  const current = STEPS[step];
  const linesForStep = customLines.filter((l) => l.section === current.customSection);

  const addLine = () => {
    if (!current.customSection) return;
    setCustomLines((ls) => [...ls, { id: 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), section: current.customSection!, label: '', amount: 0 }]);
  };
  const updateLine = (id: string, patch: Partial<CustomLine>) => {
    setCustomLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const removeLine = (id: string) => setCustomLines((ls) => ls.filter((l) => l.id !== id));

  return (
    <div>
      {/* Tab switcher — switching tabs auto-saves the current draft silently */}
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={`tab${tab === 'new' ? ' active' : ''}`} onClick={async () => {
          if (tab === 'edit' && isDirty) { try { await save(true); } catch { /* ignore */ } }
          setEditArchived(null); setTab('new');
          setYear(now.getFullYear()); setMonth(now.getMonth() + 1);
        }}>
          <FilePlus size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Neuer Abschluss
        </button>
        <button className={`tab${tab === 'archive' ? ' active' : ''}`} onClick={async () => {
          if (tab === 'edit' && isDirty) { try { await save(true); } catch { /* ignore */ } }
          setTab('archive');
        }}>
          <Archive size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Archiv ({listing.length})
        </button>
        {editArchived && (
          <button className={`tab${tab === 'edit' ? ' active' : ''}`} onClick={() => setTab('edit')} title="Archivierten Monat bearbeiten">
            ✏️ {MONTHS[editArchived.month - 1]} {editArchived.year}
            {isDirty && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: 'var(--warn)', marginLeft: 8, verticalAlign: 'middle' }} title="Ungespeicherte Änderungen — werden beim Tab-Wechsel automatisch als Entwurf gespeichert" />}
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (isDirty && !confirm('Ungespeicherte Änderungen verwerfen und Tab schließen? Tipp: Tab-Wechsel speichert automatisch — nur das X verwirft.')) return;
                setEditArchived(null); setTab('archive');
                setYear(now.getFullYear()); setMonth(now.getMonth() + 1);
              }}
              style={{ marginLeft: 10, padding: '0 4px', color: 'var(--ink3)', cursor: 'pointer' }}
              title="Bearbeiten schließen (mit Discard-Warnung)"
            >
              ×
            </span>
          </button>
        )}
      </div>

      {tab === 'archive' ? (
        <ArchiveView
          listing={listing}
          onView={(c) => setViewerClosing(c)}
          onEdit={(y, m) => { setEditArchived({ year: y, month: m }); setYear(y); setMonth(m); setTab('edit'); }}
          onExportXlsx={(y, m, withRatios) => downloadYearOrMonth('xlsx', y, m, withRatios)}
          onExportPdf={(y, m, withRatios) => downloadYearOrMonth('pdf', y, m, withRatios)}
        />
      ) : (
      <>
      {/* Periode + global actions */}
      <div className="card mb-3">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="bold sm">Periode</span>
          <select className="form-select" style={{ width: 120 }} value={year} onChange={(e) => setYear(+e.target.value)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="form-select" style={{ width: 160 }} value={month} onChange={(e) => setMonth(+e.target.value)}>
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          {locked && <span className="badge badge-info"><Lock size={11} /> Gesperrt</span>}
          {!locked && closing && <span className="badge badge-ok">Offen</span>}
          {!closing && <span className="badge badge-neu">Neu</span>}
          <div style={{ flex: 1 }} />
          {closing && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadExport('xlsx', true)} title="Als Excel inkl. Kennzahlen">
                <FileSpreadsheet size={12} />Excel
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadExport('pdf', true)} title="Als PDF inkl. Kennzahlen">
                <Download size={12} />PDF
              </button>
            </>
          )}
          {listing.length === 0 && (
            <button className="btn btn-secondary btn-sm" onClick={seedDemo}>
              <Database size={12} />Demo-Daten 2022-2025
            </button>
          )}
        </div>
      </div>

      {/* Suggestion banner — what's in the app for this month */}
      {suggestion && (suggestion.invoices.length > 0 || suggestion.perExpense.length > 0) && (
        <div className="card mb-3">
          <div className="card-body" style={{ background: 'rgba(99,102,241,.06)', borderLeft: '3px solid var(--primary)', padding: '12px 16px' }}>
            <div className="fb" style={{ marginBottom: 8 }}>
              <span className="bold sm" style={{ color: 'var(--primary)' }}>
                <Sparkles size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Daten aus der App für {MONTHS[month - 1]} {year}
              </span>
              <button className="btn btn-primary btn-sm" onClick={applySuggestion} disabled={locked}>
                <Sparkles size={11} />Werte übernehmen
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12 }}>
              <div>
                <div className="muted sm" style={{ marginBottom: 4 }}>Umsatz (bezahlte Rechnungen)</div>
                <div className="bold" style={{ fontSize: 16, color: 'var(--ok)' }}>{fmt(suggestion.total)}</div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, fontSize: 11 }} onClick={() => setDrillDown({ kind: 'revenue', items: suggestion.invoices, title: `Bezahlte Rechnungen ${MONTHS[month - 1]} ${year}` })}>
                  {suggestion.invoices.length} Rechnungen anzeigen →
                </button>
              </div>
              <div>
                <div className="muted sm" style={{ marginBottom: 4 }}>Belege nach Kategorie</div>
                {Object.entries(suggestion.perCategory).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat, sum]) => (
                  <div key={cat} className="fb" style={{ padding: '2px 0' }}>
                    <span className="sm">{cat}</span>
                    <span className="bold sm">{fmt(sum)}</span>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, fontSize: 11 }} onClick={() => setDrillDown({ kind: 'expense', items: suggestion.perExpense, title: `Belege ${MONTHS[month - 1]} ${year}` })}>
                  {suggestion.perExpense.length} Belege anzeigen →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="card mb-3">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '14px 18px', overflowX: 'auto' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
              <button
                onClick={() => setStep(i)}
                className="btn-ghost"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--r)', cursor: 'pointer',
                  border: 'none', background: i === step ? 'var(--primary-lt)' : 'transparent',
                  color: i === step ? 'var(--primary)' : 'var(--ink2)', fontSize: 12, fontWeight: i === step ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {i < step ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                <span>{i + 1}. {s.title}</span>
              </button>
              {i < STEPS.length - 1 && <div style={{ width: 12, height: 1, background: 'var(--border2)' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="card">
        <div className="card-header" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 5 }}>
          <span className="card-title">
            <span style={{ marginRight: 6 }}>{current.icon}</span>
            Schritt {step + 1} / {STEPS.length}: {current.title} — {MONTHS[month - 1]} {year}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isDirty && <span className="muted sm" style={{ fontSize: 11 }}>● Ungespeichert</span>}
            {savedFlash && <span className="badge badge-ok" style={{ fontSize: 11 }}>✓ Gespeichert</span>}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => save(false)}
              disabled={busy || locked}
              title="Aktuellen Stand speichern (oder Strg+S)"
            >
              <Save size={12} />{busy ? '…' : 'Speichern'}
            </button>
          </div>
        </div>
        <div className="card-body">
          {current.description && (
            <p className="muted sm" style={{ marginBottom: 16, lineHeight: 1.6 }}>{current.description}</p>
          )}

          {current.id === 'summary' ? (
            <SummaryStep ratios={ratios} form={form} customLines={customLines} />
          ) : (
            <>
              {/* Standard fields for this step */}
              {current.fields.map((f) => (
                <div key={f.key} className="form-row" style={{ marginBottom: 10, gap: 10, alignItems: 'center' }}>
                  <label className="form-label" style={{ flex: 1, marginBottom: 0, fontSize: 13 }}>
                    {f.label}
                    {f.hint && <div className="muted" style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>{f.hint}</div>}
                  </label>
                  <div style={{ width: 200 }}>
                    <CurrencyInput
                      value={form[f.key]}
                      onChange={(n) => set(f.key, n)}
                      disabled={locked}
                    />
                  </div>
                </div>
              ))}

              {/* Custom line items for this step */}
              {current.customSection && (
                <div style={{ marginTop: 22, padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px dashed var(--border)' }}>
                  <div className="fb" style={{ marginBottom: 10 }}>
                    <span className="bold sm">Eigene Positionen</span>
                    <button className="btn btn-ghost btn-sm" onClick={addLine} disabled={locked}>
                      <Plus size={12} /> Hinzufügen
                    </button>
                  </div>
                  {linesForStep.length === 0 ? (
                    <p className="muted sm" style={{ padding: '8px 4px', margin: 0 }}>
                      Brauchst du eine eigene Position (z.B. „{exampleFor(current.id)}")? Klick auf „Hinzufügen".
                    </p>
                  ) : (
                    linesForStep.map((l) => (
                      <div key={l.id} className="form-row" style={{ marginBottom: 8, gap: 8, alignItems: 'center' }}>
                        <input
                          className="form-input"
                          style={{ flex: 2 }}
                          placeholder="Bezeichnung"
                          value={l.label}
                          onChange={(e) => updateLine(l.id, { label: e.target.value })}
                          disabled={locked}
                        />
                        <div style={{ width: 180 }}>
                          <CurrencyInput
                            value={l.amount}
                            onChange={(n) => updateLine(l.id, { amount: n })}
                            disabled={locked}
                          />
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeLine(l.id)} disabled={locked} title="Entfernen" style={{ color: 'var(--danger)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Notes on last data step */}
              {current.id === 'cashflow' && (
                <div className="form-group" style={{ marginTop: 18 }}>
                  <label className="form-label">Notiz zum Abschluss</label>
                  <textarea className="form-textarea" rows={2} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} disabled={locked} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Wizard navigation */}
        <div className="card-body" style={{ borderTop: '1px solid var(--border2)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft size={13} /> Zurück
          </button>
          <div style={{ flex: 1, textAlign: 'center' }} className="muted sm">
            Schritt {step + 1} von {STEPS.length}
          </div>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Weiter <ChevronRight size={13} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => save(false)} disabled={busy || locked}>
              <Save size={13} />{busy ? 'Speichert…' : 'Abschluss speichern'}
            </button>
          )}
        </div>

        {/* Save + lock actions, persistent on every step */}
        <div className="card-body" style={{ borderTop: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => save(false)} disabled={busy || locked}>
            <Save size={12} />Zwischenstand speichern
          </button>
          {!locked ? (
            <button className="btn btn-ghost btn-sm" onClick={() => toggleLock(true)} disabled={!closing}>
              <Lock size={12} />Sperren
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => toggleLock(false)}>
              <Unlock size={12} />Entsperren
            </button>
          )}
          {savedFlash && <span className="badge badge-ok" style={{ fontSize: 12 }}>✓ Gespeichert</span>}
          <div style={{ flex: 1 }} />
          <span className="muted sm">
            {locked
              ? 'Abschluss gesperrt — Werte sind schreibgeschützt. Zum Bearbeiten erst „Entsperren" klicken.'
              : 'Tipp: Felder leer lassen ist OK — sie zählen dann als 0.'}
          </span>
        </div>
      </div>

      </>
      )}

      {/* Read-only Viewer-Wizard für Archiv-Klicks */}
      {viewerClosing && (
        <ClosingViewerModal
          closing={viewerClosing}
          onClose={() => setViewerClosing(null)}
          onEdit={() => { setEditArchived({ year: viewerClosing.year, month: viewerClosing.month }); setYear(viewerClosing.year); setMonth(viewerClosing.month); setTab('edit'); setViewerClosing(null); }}
          onExportXlsx={(withRatios) => downloadYearOrMonth('xlsx', viewerClosing.year, viewerClosing.month, withRatios)}
          onExportPdf={(withRatios) => downloadYearOrMonth('pdf', viewerClosing.year, viewerClosing.month, withRatios)}
        />
      )}

      {/* Drill-down modal */}
      {drillDown && (
        <DrillDownModal
          title={drillDown.title}
          kind={drillDown.kind}
          items={drillDown.items}
          onClose={() => setDrillDown(null)}
          onOpenInvoice={drillIntoInvoice}
          onOpenExpense={drillIntoExpense}
        />
      )}
    </div>
  );

  // helper: download export from archive tab
  async function downloadYearOrMonth(format: 'xlsx' | 'pdf', y: number, m: number, includeRatios: boolean) {
    const token = localStorage.getItem(STORAGE.TOKEN_KEY);
    const url = `/api/sme/closings/${y}/${m}/export.${format}${includeRatios ? '?include=ratios' : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { alert('Export fehlgeschlagen'); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `abschluss-${y}${m > 0 ? '-' + String(m).padStart(2, '0') : ''}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

// ─── Archive View ────────────────────────────────────────────────────────────
function ArchiveView({ listing, onView, onEdit, onExportXlsx, onExportPdf }: {
  listing: any[];
  onView: (c: any) => void;
  onEdit: (y: number, m: number) => void;
  onExportXlsx: (y: number, m: number, withRatios: boolean) => void;
  onExportPdf: (y: number, m: number, withRatios: boolean) => void;
}) {
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [includeRatios, setIncludeRatios] = useState(true);
  const years = Array.from(new Set(listing.map((c) => c.year))).sort((a, b) => b - a);
  const filtered = filterYear ? listing.filter((c) => c.year === filterYear) : listing;
  const grouped: Record<number, any[]> = {};
  for (const c of filtered) {
    if (!grouped[c.year]) grouped[c.year] = [];
    grouped[c.year].push(c);
  }
  const yearKeys = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  if (listing.length === 0) {
    return (
      <Empty
        icon={<Archive size={32} />}
        text={'Keine archivierten Abschlüsse vorhanden. Lege deinen ersten Abschluss im Tab „Neuer Abschluss" an.'}
      />
    );
  }

  return (
    <div>
      <div className="card mb-3">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="bold sm">Jahr filtern</span>
          <select className="form-select" style={{ width: 140 }} value={filterYear ?? ''} onChange={(e) => setFilterYear(e.target.value ? +e.target.value : null)}>
            <option value="">Alle Jahre</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={includeRatios} onChange={(e) => setIncludeRatios(e.target.checked)} />
            Export inkl. Kennzahlen
          </label>
          <div style={{ flex: 1 }} />
        </div>
      </div>

      {yearKeys.map((year) => (
        <div className="card" key={year} style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">{year} — {grouped[year].length} Monate erfasst</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onExportXlsx(year, 0, includeRatios)} title="Jahresübersicht als Excel">
                <FileSpreadsheet size={11} />Jahr Excel
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onExportPdf(year, 0, includeRatios)} title="Jahresübersicht als PDF">
                <FileText size={11} />Jahr PDF
              </button>
            </div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Monat</th><th>Umsatz</th><th>EBITDA</th><th>Netto</th><th>EK-Quote</th><th>Status</th><th>Aktionen</th></tr></thead>
              <tbody>
                {grouped[year].sort((a, b) => a.month - b.month).map((c: any) => (
                  <tr key={`${c.year}-${c.month}`} className="clickable" onClick={() => onView(c)}>
                    <td className="bold sm">{MONTHS[c.month - 1]}</td>
                    <td>{fmt(c.derived?.effectiveRevenue ?? c.revenue)}</td>
                    <td>{fmt(c.derived?.ebitda)}</td>
                    <td>{fmt(c.derived?.netIncome)}</td>
                    <td>{pct(c.derived?.equityRatio)}</td>
                    <td>{c.locked ? <span className="badge badge-info">🔒</span> : <span className="badge badge-ok">Offen</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => onExportXlsx(c.year, c.month, includeRatios)} title="Excel">
                          <FileSpreadsheet size={11} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => onExportPdf(c.year, c.month, includeRatios)} title="PDF">
                          <FileText size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Drill-down Modal ───────────────────────────────────────────────────────
function DrillDownModal({ title, kind, items, onClose, onOpenInvoice, onOpenExpense }: {
  title: string;
  kind: 'revenue' | 'expense';
  items: any[];
  onClose: () => void;
  onOpenInvoice: (id: string) => void;
  onOpenExpense: (id: string) => void;
}) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-hd">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {items.length === 0 ? (
            <p className="muted sm">Nichts gefunden.</p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{kind === 'revenue' ? 'Rechnung' : 'Beleg'}</th>
                    <th>{kind === 'revenue' ? 'Kunde' : 'Lieferant'}</th>
                    <th>{kind === 'revenue' ? 'Beschreibung' : 'Kategorie'}</th>
                    <th>Datum</th>
                    <th style={{ textAlign: 'right' }}>Netto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="clickable" onClick={() => kind === 'revenue' ? onOpenInvoice(it.id) : onOpenExpense(it.id)}>
                      <td className="bold sm">{kind === 'revenue' ? it.invoice_number : (it.receipt_number || it.id.slice(0, 6))}</td>
                      <td className="sm">{kind === 'revenue' ? it.client_name : it.supplier}</td>
                      <td className="muted sm">{kind === 'revenue' ? it.description : it.category}</td>
                      <td className="sm">{(kind === 'revenue' ? (it.paid_at || it.date) : it.expense_date)?.slice(0, 10)}</td>
                      <td className="bold" style={{ textAlign: 'right' }}>{fmt(it.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

function exampleFor(stepId: string): string {
  switch (stepId) {
    case 'income':      return 'Erstattung Krankenkasse';
    case 'expenses':    return 'Software-Abos';
    case 'assets':      return 'Wertpapierdepot';
    case 'liabilities': return 'Gesellschafterdarlehen';
    default:            return 'Sonderposten';
  }
}

function SummaryStep({ ratios, form, customLines }: { ratios: any; form: any; customLines: CustomLine[] }) {
  const d = ratios?.derived || {};
  const hasData = (d.effectiveRevenue || 0) !== 0 || (form.cogs || 0) !== 0;
  if (!hasData) {
    return <Empty icon={<Calculator size={28} />} text="Noch keine Werte erfasst — geh zurück zu Schritt 1 und fülle die Erträge aus." />;
  }
  const customByLabel = (section: string) => customLines.filter((l) => l.section === section);
  // hideZeros: blendet Zeilen aus, deren Wert 0/null ist (übersichtlicher)
  const rows = (defs: Array<[string, number | null | undefined, string?]>): Array<[string, string, string?]> =>
    defs
      .filter(([, v]) => v != null && v !== 0)
      .map(([label, v, kind]) => [label, fmt(v as number), kind]);
  const pctRows = (defs: Array<[string, number | null]>): Array<[string, string]> =>
    defs.filter(([, v]) => v != null).map(([label, v]) => [label, pct(v)]);

  return (
    <div className="grid-2" style={{ alignItems: 'flex-start' }}>
      <div>
        <Section title="Ergebnisrechnung" rows={rows([
          ['Umsatzerlöse (inkl. eigene)', d.effectiveRevenue],
          ['Bruttogewinn', d.grossProfit],
          ['EBITDA',       d.ebitda],
          ['EBIT',         d.ebit],
          ['Vorsteuer-Ergebnis (EBT)', d.ebt],
          ['Jahresüberschuss', d.netIncome, 'bold'],
        ])} />
        <Section title="Margen" rows={pctRows([
          ['Bruttomarge',  d.grossMargin],
          ['EBITDA-Marge', d.ebitdaMargin],
          ['Netto-Marge',  d.netMargin],
        ])} />
        <Section title="Cashflow" rows={rows([
          ['Operativ',  d.cashflowOperating],
          ['Investiv',  d.cashflowInvesting],
          ['Finanziell', d.cashflowFinancing],
          ['Netto-Liquiditätsveränderung', d.totalCashflow, 'bold'],
        ])} />
      </div>
      <div>
        <Section title="Bilanz-Struktur" rows={rows([
          ['Bilanzsumme',     d.totalAssets],
          ['Eigenkapital',    d.equity],
          ['Verbindlichkeiten', d.totalLiabilities],
          ['Working Capital', d.workingCapital],
        ])} />
        <Section title="Risiko & Liquidität" rows={[
          ...(d.leverage != null ? [['Leverage (FK/EK)', ratio(d.leverage)] as [string, string]] : []),
          ...(d.equityRatio != null ? [['Eigenkapitalquote', pct(d.equityRatio)] as [string, string]] : []),
          ...(d.interestCoverage != null ? [['Zinsdeckungsgrad', ratio(d.interestCoverage) + '×'] as [string, string]] : []),
          ...(d.currentRatio != null ? [['Liquidität (current ratio)', ratio(d.currentRatio) + '×'] as [string, string]] : []),
        ]} />
        {customLines.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="bold sm" style={{ marginBottom: 6, color: 'var(--primary)' }}>Eigene Positionen</div>
            {['income','expense','asset','liability'].map((section) => {
              const arr = customByLabel(section);
              if (arr.length === 0) return null;
              return (
                <div key={section} style={{ marginBottom: 8 }}>
                  <div className="muted sm" style={{ marginBottom: 4 }}>
                    {section === 'income' ? 'Erträge' :
                     section === 'expense' ? 'Aufwendungen' :
                     section === 'asset' ? 'Aktiva' :
                     'Passiva'}
                  </div>
                  {arr.map((l) => (
                    <div key={l.id} className="fb" style={{ padding: '3px 0', fontSize: 12 }}>
                      <span className="sm">{l.label || '(ohne Bezeichnung)'}</span>
                      <span className="sm bold">{fmt(l.amount)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Closing Viewer (read-only) ──────────────────────────────────────────────
function ClosingViewerModal({ closing, onClose, onEdit, onExportXlsx, onExportPdf }: {
  closing: any;
  onClose: () => void;
  onEdit: () => void;
  onExportXlsx: (withRatios: boolean) => void;
  onExportPdf: (withRatios: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const d = closing.derived || {};
  const customLines: CustomLine[] = Array.isArray(closing.custom_lines) ? closing.custom_lines : [];

  const sections = [
    { id: 'income', title: 'Erträge', icon: '📈', rows: [
      ['Umsatzerlöse', closing.revenue],
      ...customLines.filter((l) => l.section === 'income').map((l) => [`+ ${l.label}`, l.amount] as [string, number]),
      ['Summe Erträge', d.effectiveRevenue, 'bold'],
    ] },
    { id: 'expenses', title: 'Aufwendungen', icon: '📉', rows: [
      ['Wareneinsatz', closing.cogs],
      ['Personalkosten', closing.personnel],
      ['Marketing', closing.marketing],
      ['Miete', closing.rent],
      ['Sonst. betr. Aufw.', closing.opex],
      ['Übrige Aufw.', closing.other_expenses],
      ['Abschreibungen', closing.depreciation],
      ...customLines.filter((l) => l.section === 'expense').map((l) => [`+ ${l.label}`, l.amount] as [string, number]),
    ] },
    { id: 'finance', title: 'Finanzergebnis', icon: '💸', rows: [
      ['Zinserträge', closing.interest_income],
      ['Zinsaufwendungen', closing.interest_expense],
      ['Steuern', closing.tax],
    ] },
    { id: 'assets', title: 'Bilanz · Aktiva', icon: '🏦', rows: [
      ['Kasse & Bank', closing.cash],
      ['Forderungen', closing.receivables],
      ['Vorräte', closing.inventory_value],
      ['Anlagevermögen', closing.fixed_assets],
      ...customLines.filter((l) => l.section === 'asset').map((l) => [`+ ${l.label}`, l.amount] as [string, number]),
      ['Bilanzsumme', d.totalAssets, 'bold'],
    ] },
    { id: 'liabilities', title: 'Bilanz · Passiva', icon: '🏛️', rows: [
      ['Verbindlichkeiten L+L', closing.payables],
      ['Kurzfristige Verbindlichk.', closing.short_term_debt],
      ['Langfristige Verbindlichk.', closing.long_term_debt],
      ...customLines.filter((l) => l.section === 'liability').map((l) => [`+ ${l.label}`, l.amount] as [string, number]),
      ['Eigenkapital', d.equity, 'bold'],
    ] },
    { id: 'cashflow', title: 'Cashflow', icon: '💧', rows: [
      ['Operativ', d.cashflowOperating ?? closing.cashflow_operating],
      ['Investiv', d.cashflowInvesting ?? closing.cashflow_investing],
      ['Finanziell', d.cashflowFinancing ?? closing.cashflow_financing],
      ['Netto-Veränderung', d.totalCashflow, 'bold'],
    ] },
    { id: 'summary', title: 'Kennzahlen', icon: '✅', rows: [] as Array<[string, number | null, string?]> },
  ];

  const current = sections[step];

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-xl">
        <div className="modal-hd">
          <span className="modal-title">
            Abschluss {MONTHS[closing.month - 1]} {closing.year}
            {closing.locked ? <span className="badge badge-info" style={{ marginLeft: 8 }}><Lock size={11} /> Gesperrt</span> : <span className="badge badge-ok" style={{ marginLeft: 8 }}>Offen</span>}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onExportXlsx(true)}>
              <FileSpreadsheet size={12} />Excel
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onExportPdf(true)}>
              <Download size={12} />PDF
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onEdit}>
              <FilePlus size={12} />Bearbeiten
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ borderBottom: '1px solid var(--border2)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', background: 'var(--bg)' }}>
          {sections.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
              <button
                onClick={() => setStep(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--r)', cursor: 'pointer',
                  border: 'none', background: i === step ? 'var(--primary-lt)' : 'transparent',
                  color: i === step ? 'var(--primary)' : 'var(--ink2)', fontSize: 12, fontWeight: i === step ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {i < step ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                <span>{i + 1}. {s.title}</span>
              </button>
              {i < sections.length - 1 && <div style={{ width: 12, height: 1, background: 'var(--border2)' }} />}
            </div>
          ))}
        </div>

        <div className="modal-body">
          {current.id === 'summary' ? (
            <div className="grid-2" style={{ alignItems: 'flex-start' }}>
              <div>
                <ReadOnlySection title="Ergebnisrechnung" rows={[
                  ['Bruttogewinn', d.grossProfit],
                  ['EBITDA', d.ebitda],
                  ['EBIT', d.ebit],
                  ['Vorsteuer-Ergebnis', d.ebt],
                  ['Jahresüberschuss', d.netIncome, 'bold'],
                ]} />
                <ReadOnlySection title="Margen" rows={[
                  ['Bruttomarge', d.grossMargin, 'pct'],
                  ['EBITDA-Marge', d.ebitdaMargin, 'pct'],
                  ['Netto-Marge', d.netMargin, 'pct'],
                ]} />
              </div>
              <div>
                <ReadOnlySection title="Bilanz-Struktur" rows={[
                  ['Bilanzsumme', d.totalAssets],
                  ['Eigenkapital', d.equity],
                  ['Verbindlichkeiten', d.totalLiabilities],
                  ['Working Capital', d.workingCapital],
                ]} />
                <ReadOnlySection title="Risiko &amp; Liquidität" rows={[
                  ['Leverage (FK/EK)', d.leverage, 'ratio'],
                  ['Eigenkapitalquote', d.equityRatio, 'pct'],
                  ...(d.interestCoverage != null ? [['Zinsdeckung', d.interestCoverage, 'ratio'] as [string, number, 'ratio']] : []),
                  ...(d.currentRatio != null ? [['Liquidität', d.currentRatio, 'ratio'] as [string, number, 'ratio']] : []),
                ]} />
              </div>
            </div>
          ) : (
            <div>
              <p className="muted sm" style={{ marginBottom: 12 }}>{current.title} — {MONTHS[closing.month - 1]} {closing.year}</p>
              {current.rows.filter(([, v]) => v != null && v !== 0).map(([label, val, kind], i) => (
                <div key={i} className="fb" style={{ padding: '8px 0', borderBottom: '1px dotted var(--border2)' }}>
                  <span className={`sm ${kind === 'bold' ? 'bold' : 'muted'}`}>{label}</span>
                  <span className={`sm ${kind === 'bold' ? 'bold' : ''}`}>{fmt(val as number)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft size={13} /> Zurück
          </button>
          <div style={{ flex: 1, textAlign: 'center' }} className="muted sm">Schritt {step + 1} von {sections.length}</div>
          <button className="btn btn-primary" onClick={() => setStep((s) => Math.min(sections.length - 1, s + 1))} disabled={step === sections.length - 1}>
            Weiter <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadOnlySection({ title, rows }: { title: string; rows: Array<[string, number | null | undefined] | [string, number | null | undefined, 'bold' | 'pct' | 'ratio']> }) {
  const visible = rows.filter(([, v]) => v != null && v !== 0);
  if (visible.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="bold sm" style={{ marginBottom: 6, color: 'var(--primary)' }}>{title}</div>
      {visible.map(([label, v, kind], i) => (
        <div key={i} className="fb" style={{ padding: '5px 0', borderBottom: '1px dotted var(--border2)' }}>
          <span className="sm muted">{label}</span>
          <span className={`sm${kind === 'bold' ? ' bold' : ''}`}>
            {kind === 'pct' ? `${((v as number) * 100).toFixed(1)} %`
              : kind === 'ratio' ? (v as number).toFixed(2)
              : fmt(v as number)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Array<[string, string, string?]> }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="bold sm" style={{ marginBottom: 6, color: 'var(--primary)' }}>{title}</div>
      {rows.map(([label, value, kind]) => (
        <div key={label} className="fb" style={{ padding: '4px 0', borderBottom: '1px dotted var(--border2)' }}>
          <span className="sm muted">{label}</span>
          <span className={`sm${kind === 'bold' ? ' bold' : ''}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function pct(v: number | null | undefined): string {
  if (v == null) return '–';
  return `${(v * 100).toFixed(1)} %`;
}
function ratio(v: number | null | undefined): string {
  if (v == null) return '–';
  return v.toFixed(2);
}

/** Local re-implementation of the server-side ratio derivation so the wizard
 *  can preview live values before save. Mirrors `server/routes/closings.js`
 *  withRatios(). */
function deriveLocal(c: any): any {
  if (!c) return null;
  const lines: CustomLine[] = Array.isArray(c.custom_lines) ? c.custom_lines : [];
  const sumBy = (section: string) => lines.filter((l) => l.section === section).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const customIncome    = sumBy('income');
  const customExpense   = sumBy('expense');
  const customAsset     = sumBy('asset');
  const customLiability = sumBy('liability');

  const revenue = (c.revenue || 0) + customIncome;
  const grossProfit = revenue - (c.cogs || 0);
  const ebitda = grossProfit - (c.opex || 0) - (c.personnel || 0) - (c.marketing || 0) - (c.rent || 0) - (c.other_expenses || 0) - customExpense;
  const ebit = ebitda - (c.depreciation || 0);
  const ebt = ebit + (c.interest_income || 0) - (c.interest_expense || 0);
  const netIncome = ebt - (c.tax || 0);
  const totalAssets = (c.cash || 0) + (c.receivables || 0) + (c.inventory_value || 0) + (c.fixed_assets || 0) + customAsset;
  const totalLiabilities = (c.payables || 0) + (c.short_term_debt || 0) + (c.long_term_debt || 0) + customLiability;
  const equity = c.equity || (totalAssets - totalLiabilities);
  const cashflowOperating = c.cashflow_operating || 0;
  const cashflowInvesting = c.cashflow_investing || 0;
  const cashflowFinancing = c.cashflow_financing || 0;
  return { derived: {
    effectiveRevenue: revenue,
    grossProfit, ebitda, ebit, ebt, netIncome,
    totalAssets, totalLiabilities, equity,
    workingCapital: (c.cash || 0) + (c.receivables || 0) + (c.inventory_value || 0) - (c.payables || 0) - (c.short_term_debt || 0),
    grossMargin: revenue > 0 ? grossProfit / revenue : null,
    ebitdaMargin: revenue > 0 ? ebitda / revenue : null,
    netMargin: revenue > 0 ? netIncome / revenue : null,
    leverage: equity > 0 ? totalLiabilities / equity : null,
    equityRatio: totalAssets > 0 ? equity / totalAssets : null,
    interestCoverage: c.interest_expense > 0 ? ebit / c.interest_expense : null,
    currentRatio: ((c.short_term_debt || 0) + (c.payables || 0)) > 0
      ? ((c.cash || 0) + (c.receivables || 0) + (c.inventory_value || 0)) / ((c.short_term_debt || 0) + (c.payables || 0))
      : null,
    cashflowOperating, cashflowInvesting, cashflowFinancing,
    totalCashflow: cashflowOperating + cashflowInvesting + cashflowFinancing,
  } };
}
