import { useState, useEffect } from 'react';
import { Users, ArrowRight, AlertTriangle, Settings as SettingsIcon, Check, Calendar, LayoutDashboard } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api';
import { Badge, Modal, Empty } from '../../components/ui';
import { useLang } from '../../context/LangContext';

/**
 * Dashboard v2 — sectioned, drag-droppable widget layout.
 *
 *   Section "header"  — KPI tiles (Umsatz, Offen, etc.)
 *   Section "alerts"  — yellow/red notices (low stock, stale deals, abos due)
 *   Section "body"    — wider cards (recent invoices, customers)
 *
 * Each widget knows its current section; the user drags a widget header to
 * another section to move it. Config is persisted per-user in localStorage.
 *
 * Empty state: if no widgets are active in any section, we show a friendly
 * "Add some widgets" CTA instead of a blank page.
 */

type Section = 'header' | 'alerts' | 'body';

interface WidgetConfig { id: string; label: string; section: Section; enabled: boolean }

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'revenue',    label: 'Umsatz (bezahlt)',        section: 'header', enabled: true },
  { id: 'open',       label: 'Offene Rechnungen',       section: 'header', enabled: true },
  { id: 'overdue',    label: 'Überfällige Rechnungen',  section: 'header', enabled: true },
  { id: 'customers',  label: 'Kunden gesamt',           section: 'header', enabled: true },
  { id: 'pipeline',   label: 'Pipeline-Wert',           section: 'header', enabled: true },
  { id: 'expenses',   label: 'Ausgaben',                section: 'header', enabled: true },
  { id: 'lowStock',   label: 'Lager-Warnungen',         section: 'alerts', enabled: true },
  { id: 'staleDeals', label: 'Pipeline Follow-ups',     section: 'alerts', enabled: true },
  { id: 'dueAbos',    label: 'Fällige Abos',            section: 'alerts', enabled: true },
  { id: 'recentInv',  label: 'Letzte Rechnungen',       section: 'body',   enabled: true },
  { id: 'recentCust', label: 'Kunden',                   section: 'body',   enabled: true },
];

const KEY = 'dd_dashboard_widgets_v2';
function loadCfg(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_WIDGETS;
    const parsed: WidgetConfig[] = JSON.parse(raw);
    const seen = new Set(parsed.map((w) => w.id));
    for (const d of DEFAULT_WIDGETS) if (!seen.has(d.id)) parsed.push(d);
    return parsed;
  } catch { return DEFAULT_WIDGETS; }
}
function saveCfg(c: WidgetConfig[]) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

const SECTION_LABELS: Record<Section, string> = {
  header: 'Kennzahlen-Sektion',
  alerts: 'Warnungen & Hinweise',
  body:   'Hauptbereich (Listen & Detail-Cards)',
};

export default function Dashboard({ onNavigate }: { onNavigate: (page: string, hint?: any) => void }) {
  const { t } = useLang();
  const [data, setData] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [abos, setAbos]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => loadCfg());
  const [showConfig, setShowConfig] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.sme.dashboard(),
      api.sme.deals().catch(() => []),
      api.get<any[]>('/sme/recurring').catch(() => []),
    ]).then(([d, ds, rs]) => { setData(d); setDeals(ds); setAbos(rs); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="muted sm" style={{ padding: 40, textAlign: 'center' }}>Lade Dashboard…</div>;
  if (!data) return null;

  const visible = (section: Section) => widgets.filter((w) => w.section === section && w.enabled);
  const anyVisible = widgets.some((w) => w.enabled);

  // Computed alert sources
  const now = Date.now();
  const staleDeals = deals.filter((d: any) => {
    if (!d.stage_entered_at) return false;
    const days = Math.floor((now - new Date(d.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24));
    return days > 14 && d.stage !== 'Gewonnen' && d.stage !== 'Verloren';
  });
  const dueAbos = abos.filter((a: any) => a.active && a.next_due && a.next_due <= new Date().toISOString().slice(0, 10));

  // ── Drag handlers (between sections) ──────────────────────────────────
  const onDragStart = (id: string) => setDragId(id);
  const onDragEnd   = () => setDragId(null);
  const onDropOnSection = (section: Section) => {
    if (!dragId) return;
    const next = widgets.map((w) => (w.id === dragId ? { ...w, section } : w));
    setWidgets(next); saveCfg(next); setDragId(null);
  };
  const toggle = (id: string) => {
    const next = widgets.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w));
    setWidgets(next); saveCfg(next);
  };

  // ── Widget renderers ──────────────────────────────────────────────────
  const renderWidget = (w: WidgetConfig) => {
    switch (w.id) {
      // Header (KPIs)
      case 'revenue': return (
        <div className="stat" onClick={() => onNavigate('invoices', 'Bezahlt')}>
          <div className="stat-label">Umsatz (bezahlt)</div>
          <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(data.revenue)}</div>
          <div className="stat-sub">↗ Alle bezahlten Rechnungen</div>
        </div>
      );
      case 'open': return (
        <div className="stat" onClick={() => onNavigate('invoices', 'Offen')}>
          <div className="stat-label">Offen</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{fmt(data.openAmount)}</div>
          <div className="stat-sub" style={{ color: 'var(--ink3)' }}>{data.openCount} Rechnung{data.openCount !== 1 ? 'en' : ''}</div>
        </div>
      );
      case 'overdue': return data.overdueAmount > 0 ? (
        <div className="stat" onClick={() => onNavigate('invoices', 'Überfällig')}>
          <div className="stat-label">Überfällig</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{fmt(data.overdueAmount)}</div>
          <div className="stat-sub warn">{data.overdueCount} Mahnung{data.overdueCount !== 1 ? 'en' : ''} nötig</div>
        </div>
      ) : null;
      case 'customers': return (
        <div className="stat" onClick={() => onNavigate('customers')}>
          <div className="stat-label">Kunden</div>
          <div className="stat-value">{data.customerCount}</div>
          <div className="stat-sub">Kontakte gesamt</div>
        </div>
      );
      case 'pipeline': return (
        <div className="stat" onClick={() => onNavigate('pipeline')}>
          <div className="stat-label">Pipeline</div>
          <div className="stat-value">{fmt(data.pipelineValue)}</div>
          <div className="stat-sub">Gewichteter Wert</div>
        </div>
      );
      case 'expenses': return (
        <div className="stat" onClick={() => onNavigate('expenses')}>
          <div className="stat-label">Ausgaben</div>
          <div className="stat-value">{fmt(data.expenses)}</div>
          <div className="stat-sub">Gesamt Belege</div>
        </div>
      );

      // Alerts
      case 'lowStock': return data.lowStockCount > 0 ? (
        <div className="notice" style={{ cursor: 'pointer' }} onClick={() => onNavigate('inventory')}>
          <AlertTriangle size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          <strong>{data.lowStockCount} Artikel</strong> unter Mindestbestand — Inventar prüfen
        </div>
      ) : null;
      case 'staleDeals': return staleDeals.length > 0 ? (
        <div className="notice" style={{ cursor: 'pointer', background: 'var(--warn-bg)', borderColor: 'var(--warn)', color: 'var(--warn)' }} onClick={() => onNavigate('pipeline')}>
          🚨 <strong>{staleDeals.length} Pipeline-Deals</strong> sind seit über 14 Tagen in der gleichen Phase — Follow-up empfohlen
        </div>
      ) : null;
      case 'dueAbos': return dueAbos.length > 0 ? (
        <div className="notice" style={{ cursor: 'pointer', background: 'var(--info-bg)', borderColor: 'var(--info)', color: 'var(--info)' }} onClick={() => onNavigate('recurring')}>
          <Calendar size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          <strong>{dueAbos.length} Abo{dueAbos.length !== 1 ? 's' : ''}</strong> heute oder überfällig — Rechnungen generieren
        </div>
      ) : null;

      // Body
      case 'recentInv': return (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('dashboard_recent_invoices')}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('invoices')}>Alle <ArrowRight size={12} /></button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Nummer</th><th>Kunde</th><th>Betrag</th><th>Status</th></tr></thead>
              <tbody>
                {data.recentInvoices.map((i: any) => (
                  <tr key={i.id} className="clickable" onClick={() => onNavigate('invoices')}>
                    <td className="bold sm">{i.invoice_number}</td>
                    <td className="sm">{i.client_name}</td>
                    <td className="bold">{fmt(i.gross)}</td>
                    <td><Badge status={i.status} /></td>
                  </tr>
                ))}
                {data.recentInvoices.length === 0 && (
                  <tr><td colSpan={4} className="muted sm" style={{ textAlign: 'center', padding: 24 }}>Noch keine Rechnungen</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
      case 'recentCust': return (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('customers')}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('customers')}>Alle <ArrowRight size={12} /></button>
          </div>
          <div className="card-body">
            {data.recentCustomers.map((c: any) => (
              <div key={c.id} className="fb" style={{ padding: '8px 0', borderBottom: '1px solid var(--border2)', cursor: 'pointer' }} onClick={() => onNavigate('customers')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar-sm">{c.name.slice(0, 2).toUpperCase()}</div>
                  <div><div className="bold sm">{c.name}</div><div className="muted sm">{c.company || c.city || '–'}</div></div>
                </div>
                <Badge status={c.type} />
              </div>
            ))}
            {data.recentCustomers.length === 0 && (
              <div className="empty"><Users size={28} /><span>Noch keine Kunden</span></div>
            )}
          </div>
        </div>
      );
      default: return null;
    }
  };

  const SectionDropzone = ({ section, children }: { section: Section; children: React.ReactNode }) => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDropOnSection(section)}
      style={{
        minHeight: 40,
        border: dragId ? '2px dashed var(--primary)' : '2px dashed transparent',
        borderRadius: 'var(--r-lg)',
        padding: dragId ? 8 : 0,
        marginBottom: 18,
        transition: 'all .15s',
      }}
    >
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowConfig(true)}>
          <SettingsIcon size={13} />Widgets anpassen
        </button>
      </div>

      {!anyVisible && (
        <Empty
          icon={<LayoutDashboard size={40} />}
          text="Dein Dashboard ist noch leer."
          action={
            <button className="btn btn-primary" onClick={() => setShowConfig(true)}>
              <SettingsIcon size={13} />Widgets hinzufügen
            </button>
          }
        />
      )}

      {anyVisible && (
        <>
          {/* Header section — KPIs */}
          {visible('header').length > 0 && (
            <SectionDropzone section="header">
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
                {visible('header').map((w) => <div key={w.id}>{renderWidget(w)}</div>)}
              </div>
            </SectionDropzone>
          )}

          {/* Alerts section */}
          {visible('alerts').length > 0 && (
            <SectionDropzone section="alerts">
              {visible('alerts').map((w) => <div key={w.id}>{renderWidget(w)}</div>)}
            </SectionDropzone>
          )}

          {/* Body section — wider cards */}
          {visible('body').length > 0 && (
            <SectionDropzone section="body">
              <div className="grid-2">
                {visible('body').map((w) => <div key={w.id}>{renderWidget(w)}</div>)}
              </div>
            </SectionDropzone>
          )}
        </>
      )}

      {showConfig && (
        <Modal title="Dashboard-Widgets anpassen" onClose={() => setShowConfig(false)} large
          footer={<button className="btn btn-primary" onClick={() => setShowConfig(false)}><Check size={13} />Fertig</button>}>
          <p className="muted sm" style={{ marginBottom: 14, lineHeight: 1.6 }}>
            Aktiviere/deaktiviere Widgets oder ziehe sie per Drag &amp; Drop in eine andere Sektion. Die Sektion bestimmt, wo das Widget auf dem Dashboard erscheint.
          </p>

          {(['header', 'alerts', 'body'] as const).map((sec) => (
            <div key={sec} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
                {SECTION_LABELS[sec]}
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropOnSection(sec)}
                style={{
                  minHeight: 60,
                  background: 'var(--bg)',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--r)',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {widgets.filter((w) => w.section === sec).map((w) => (
                  <div
                    key={w.id}
                    draggable
                    onDragStart={() => onDragStart(w.id)}
                    onDragEnd={onDragEnd}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r)',
                      cursor: 'grab',
                      opacity: dragId === w.id ? 0.4 : 1,
                    }}
                  >
                    <span style={{ color: 'var(--ink3)' }}>⋮⋮</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{w.label}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={w.enabled} onChange={() => toggle(w.id)} />
                      Aktiv
                    </label>
                  </div>
                ))}
                {widgets.filter((w) => w.section === sec).length === 0 && (
                  <div className="muted sm" style={{ padding: 10, textAlign: 'center' }}>Drag Widget hier rein</div>
                )}
              </div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
