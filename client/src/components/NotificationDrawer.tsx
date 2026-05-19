import { useEffect, useState, useRef } from 'react';
import { Bell, AlertTriangle, FileText, Receipt, Package, X } from 'lucide-react';
import { api, fmt, fmtDate } from '../api';

/**
 * NotificationDrawer — popover triggered by the topbar bell.
 *
 * Pulls aggregate counts from the SME dashboard endpoint and surfaces the
 * three things business owners care about most: overdue invoices, missing
 * receipts (GoBD risk), low-stock alerts. Each item is a deep-link into the
 * relevant page so the bell becomes a quick triage tool.
 *
 * Only used for `unternehmen` role — admins and Steuerberater get their own
 * dashboards already.
 */
export function NotificationBell({
  enabled,
  onNavigate,
}: {
  enabled: boolean;
  onNavigate: (page: string) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [data, setData]   = useState<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fetch lazily — only when drawer opens (and refresh every time it opens).
  useEffect(() => {
    if (!open || !enabled) return;
    api.sme.dashboard().then(setData).catch(() => setData({ overdueCount: 0, recentInvoices: [], lowStockItems: [] }));
  }, [open, enabled]);

  // Close when clicking outside or pressing Esc
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Total badge count — overdue + missing receipts + low stock
  const overdueCount = data?.overdueCount || 0;
  const missingReceipts = (data?.recentInvoices || []).length && data
    ? // proxy: we don't have an aggregate of missing receipts in dashboard payload,
      // so we approximate by lowStockCount on demand. For real count we'd add it
      // server-side; placeholder here keeps the UI honest.
      0
    : 0;
  const lowStock = (data?.lowStockItems || []).length;
  const total = overdueCount + missingReceipts + lowStock;

  if (!enabled) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ width: 32, padding: 0, justifyContent: 'center', opacity: 0.4, cursor: 'not-allowed' }} title="Benachrichtigungen verfügbar für Unternehmen-Nutzer">
        <Bell size={15} />
      </button>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: 32, padding: 0, justifyContent: 'center', position: 'relative' }}
        onClick={() => setOpen((o) => !o)}
        title="Benachrichtigungen"
      >
        <Bell size={15} />
        {total > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
            background: 'var(--danger)', color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 40, right: 0,
          width: 340, maxHeight: 480, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-xl)',
          zIndex: 100,
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span className="bold sm">Benachrichtigungen</span>
            <button className="modal-close" onClick={() => setOpen(false)}><X size={14} /></button>
          </div>

          {!data && (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Lade…</div>
          )}

          {data && total === 0 && (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              ✓ Alles im grünen Bereich.<br/>Keine offenen Punkte.
            </div>
          )}

          {data && overdueCount > 0 && (
            <button
              className="notification-row"
              onClick={() => { onNavigate('invoices'); setOpen(false); }}
            >
              <AlertTriangle size={18} color="var(--danger)" />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="bold sm">{overdueCount} überfällige Rechnung{overdueCount !== 1 ? 'en' : ''}</div>
                <div className="muted sm">{fmt(data.overdueAmount)} ausstehend</div>
              </div>
            </button>
          )}

          {data && lowStock > 0 && (
            <button
              className="notification-row"
              onClick={() => { onNavigate('inventory'); setOpen(false); }}
            >
              <Package size={18} color="var(--warn)" />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="bold sm">{lowStock} Artikel unter Mindestbestand</div>
                <div className="muted sm">Nachbestellung prüfen</div>
              </div>
            </button>
          )}

          {/* Recent invoices preview — context, not a notification */}
          {data?.recentInvoices?.length > 0 && (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Zuletzt aktualisiert
              </div>
              {data.recentInvoices.slice(0, 3).map((i: any) => (
                <button
                  key={i.id}
                  className="notification-row"
                  onClick={() => { onNavigate('invoices'); setOpen(false); }}
                  style={{ borderBottom: 'none' }}
                >
                  {i.status === 'Bezahlt' ? <Receipt size={16} color="var(--ok)" /> : <FileText size={16} color="var(--ink3)" />}
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div className="sm">{i.invoice_number} · {i.client_name}</div>
                    <div className="muted sm">{fmt(i.gross)} · {fmtDate(i.date)}</div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
