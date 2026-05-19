import { useEffect, useState, useRef } from 'react';
import { Search, Users, FileText, Receipt, Package, Megaphone, Banknote, Inbox, FileSignature, Repeat } from 'lucide-react';
import { api } from '../api';

/**
 * Global command palette (Cmd+K / Ctrl+K).
 *
 * Fetches small lists from the server on open and does fuzzy matching client-
 * side. Activation: any key combo with the user's platform meta-key + K. Items
 * are role-aware: only ones the current user can navigate to show up.
 */

type Hit = {
  kind: 'page' | 'customer' | 'invoice' | 'expense';
  label: string;
  sub?: string;
  go: () => void;
};

const ICONS: Record<string, any> = {
  page: Search, customer: Users, invoice: FileText, expense: Receipt,
};

const PAGES: Array<{ id: string; label: string; Icon: any; description: string }> = [
  { id: 'dashboard',  label: 'Dashboard',        Icon: Search,     description: 'KPIs und Übersicht' },
  { id: 'mailbox',    label: 'Postfach',         Icon: Inbox,      description: 'Mails empfangen + senden' },
  { id: 'customers',  label: 'Kunden',           Icon: Users,      description: 'CRM, Kundenstamm' },
  { id: 'pipeline',   label: 'Pipeline',         Icon: FileText,   description: 'Deals & Verkaufschancen' },
  { id: 'invoices',   label: 'Rechnungen',       Icon: FileText,   description: 'Ausgangsrechnungen' },
  { id: 'expenses',   label: 'Belege',           Icon: Receipt,    description: 'Eingangsbelege, Ausgaben' },
  { id: 'inventory',  label: 'Inventar',         Icon: Package,    description: 'Artikel & Lager' },
  { id: 'marketing',  label: 'Marketing',        Icon: Megaphone,  description: 'Kampagnen & ROI' },
  { id: 'finance',    label: 'Finanzen',         Icon: Banknote,   description: 'Cashflow, USt, Bilanz' },
  { id: 'quotes',     label: 'Angebote',         Icon: FileSignature, description: 'Quotes → Rechnungen' },
  { id: 'recurring',  label: 'Wiederkehrende',   Icon: Repeat,     description: 'Abo-Rechnungen' },
];

export function CommandPalette({ onNavigate, role }: { onNavigate: (page: string) => void; role: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  // Compute hits when query changes — for sme/stb show all the things
  useEffect(() => {
    if (!open) return;
    const q = query.trim().toLowerCase();
    const out: Hit[] = [];

    for (const p of PAGES) {
      if (!q || p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) {
        out.push({ kind: 'page', label: p.label, sub: p.description, go: () => { onNavigate(p.id); setOpen(false); } });
      }
    }

    if (q && role === 'unternehmen') {
      Promise.all([api.sme.customers().catch(() => []), api.sme.invoices().catch(() => []), api.sme.expenses().catch(() => [])])
        .then(([cs, invs, exps]) => {
          for (const c of cs as any[]) {
            if ([c.name, c.company, c.email].some((v) => v?.toLowerCase().includes(q))) {
              out.push({ kind: 'customer', label: c.name, sub: c.company || c.email || c.city, go: () => { onNavigate('customers'); setOpen(false); } });
            }
          }
          for (const i of invs as any[]) {
            if ([i.invoice_number, i.client_name, i.description].some((v) => v?.toLowerCase().includes(q))) {
              out.push({ kind: 'invoice', label: i.invoice_number, sub: `${i.client_name} · ${i.status}`, go: () => { onNavigate('invoices'); setOpen(false); } });
            }
          }
          for (const e of exps as any[]) {
            if ([e.supplier, e.description, e.category].some((v) => v?.toLowerCase().includes(q))) {
              out.push({ kind: 'expense', label: e.supplier, sub: `${e.description || e.category}`, go: () => { onNavigate('expenses'); setOpen(false); } });
            }
          }
          setHits(out);
        });
    } else {
      setHits(out);
    }
    setActiveIdx(0);
  }, [query, open, onNavigate, role]);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    hits[activeIdx]?.go();
  };
  const onArrow = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15,17,23,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 100,
      }}
    >
      <form onSubmit={onSubmit} style={{
        width: '100%', maxWidth: 600, background: 'var(--surface)',
        borderRadius: 12, boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border2)' }}>
          <Search size={16} color="var(--ink3)" style={{ marginRight: 10 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onArrow}
            placeholder="Suche nach Kunde, Rechnung, Beleg, Seite…"
            style={{ flex: 1, fontSize: 16, border: 'none', outline: 'none', fontFamily: 'var(--font)', background: 'transparent', color: 'var(--ink)' }}
          />
          <kbd style={{ fontSize: 11, color: 'var(--ink3)', padding: '2px 6px', background: 'var(--bg2)', borderRadius: 4 }}>Esc</kbd>
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {hits.length === 0 && (
            <div style={{ padding: 20, color: 'var(--ink3)', fontSize: 13 }}>Keine Treffer.</div>
          )}
          {hits.map((h, i) => {
            const Icon = ICONS[h.kind] || Search;
            return (
              <button
                key={`${h.kind}-${h.label}-${i}`}
                type="button"
                onMouseEnter={() => setActiveIdx(i)}
                onClick={h.go}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '10px 16px', background: activeIdx === i ? 'var(--primary-lt)' : 'none',
                  border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10, fontFamily: 'var(--font)',
                }}
              >
                <Icon size={14} color="var(--ink3)" />
                <div style={{ flex: 1 }}>
                  <div className="bold sm">{h.label}</div>
                  {h.sub && <div className="muted sm">{h.sub}</div>}
                </div>
                <span className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>{h.kind}</span>
              </button>
            );
          })}
        </div>
      </form>
    </div>
  );
}
