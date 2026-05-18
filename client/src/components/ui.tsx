import type { ReactNode } from 'react';
import { X, AlertCircle, Zap } from 'lucide-react';

/**
 * Status → CSS class mapping for the Badge component. Keep keys in sync with
 * the status enums in server/db/init.js (CHECK constraints on invoices,
 * customers, deals). Unknown statuses fall back to the neutral style.
 */
const STATUS: Record<string, string> = {
  'Bezahlt':'ok','Aktiv':'ok','Gewonnen':'ok','Gebucht':'ok',
  'Offen':'info','Lead':'info','Warm':'info','Entwurf':'neu',
  'Überfällig':'err','Inaktiv':'err','Storniert':'err',
  'warn':'warn',
};

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ status, text }: { status: string; text?: string }) {
  const cls = STATUS[status] ?? 'neu';
  return <span className={`badge badge-${cls}`}>{text ?? status}</span>;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({
  title,
  onClose,
  children,
  footer,
  large,
}: {
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  large?: boolean;
}) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${large ? ' modal-lg' : ''}`}>
        <div className="modal-hd">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ── AI Panel ──────────────────────────────────────────────────────────────────
export function AIPanel({
  title,
  result,
  loading,
}: {
  title: ReactNode;
  result?: string;
  loading?: boolean;
}) {
  return (
    <div className="ai-panel">
      <div className="ai-hd">
        <span className="ai-chip">KI · Claude</span>
        <span className="ai-title">{title}</span>
      </div>
      {loading
        ? <div className="ai-spin"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /> Analysiere…</div>
        : result
          ? <div className="ai-body">{result}</div>
          : <p className="ai-hint">Klicken Sie auf „KI-Analyse" um zu starten.</p>
      }
    </div>
  );
}

// ── Notice ────────────────────────────────────────────────────────────────────
export function Notice({
  type = 'warn',
  children,
  onClick,
}: {
  type?: 'warn' | 'err';
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className={`notice${type === 'err' ? ' err' : ''}`} onClick={onClick}>
      {type === 'err'
        ? <AlertCircle size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        : <Zap size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
      }
      {children}
    </div>
  );
}

// ── API-Key notice ────────────────────────────────────────────────────────────
export function KeyNotice({ onGo }: { onGo?: () => void }) {
  return (
    <Notice onClick={onGo}>
      KI-Funktionen verfügbar — <strong style={{ textDecoration: 'underline' }}>API-Key in Einstellungen hinterlegen</strong> um Belegscan, Deal-Analyse & mehr zu aktivieren.
    </Notice>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function Empty({
  icon,
  text,
  action,
}: {
  icon?: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div>{icon}</div>}
      <p className="sm muted">{text}</p>
      {action}
    </div>
  );
}
