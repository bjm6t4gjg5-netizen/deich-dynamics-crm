import { X, AlertCircle, CheckCircle, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';

// ── Badge ─────────────────────────────────────────────────────────────────────
const STATUS = {
  'Bezahlt':'ok','Aktiv':'ok','Gewonnen':'ok','Gebucht':'ok',
  'Offen':'info','Lead':'info','Warm':'info','Entwurf':'neu',
  'Überfällig':'err','Inaktiv':'err','Storniert':'err',
  'warn':'warn',
};
export function Badge({ status, text }) {
  const cls = STATUS[status] ?? 'neu';
  return <span className={`badge badge-${cls}`}>{text ?? status}</span>;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, footer, large }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal${large ? ' modal-lg' : ''}`}>
        <div className="modal-hd">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ── AI Panel ──────────────────────────────────────────────────────────────────
export function AIPanel({ title, result, loading }) {
  return (
    <div className="ai-panel">
      <div className="ai-hd">
        <span className="ai-chip">KI · Claude</span>
        <span className="ai-title">{title}</span>
      </div>
      {loading
        ? <div className="ai-spin"><div className="ai-dot"/><div className="ai-dot"/><div className="ai-dot"/> Analysiere…</div>
        : result
          ? <div className="ai-body">{result}</div>
          : <p className="ai-hint">Klicken Sie auf „KI-Analyse" um zu starten.</p>
      }
    </div>
  );
}

// ── Notice ────────────────────────────────────────────────────────────────────
export function Notice({ type = 'warn', children, onClick }) {
  return (
    <div className={`notice${type === 'err' ? ' err' : ''}`} onClick={onClick}>
      {type === 'err' ? <AlertCircle size={13} style={{verticalAlign:'-2px',marginRight:6}}/> : <Zap size={13} style={{verticalAlign:'-2px',marginRight:6}}/>}
      {children}
    </div>
  );
}

// ── ApiKey notice ─────────────────────────────────────────────────────────────
export function KeyNotice({ onGo }) {
  return (
    <Notice onClick={onGo}>
      KI-Funktionen verfügbar — <strong style={{textDecoration:'underline'}}>API-Key in Einstellungen hinterlegen</strong> um Belegscan, Deal-Analyse & mehr zu aktivieren.
    </Notice>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function Empty({ icon, text, action }) {
  return (
    <div className="empty">
      {icon && <div>{icon}</div>}
      <p className="sm muted">{text}</p>
      {action}
    </div>
  );
}
