import { useState, useEffect } from 'react';
import { FileText, Users, TrendingUp, Package, Receipt, ArrowRight, AlertTriangle } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api.js';
import { Badge } from '../../components/ui.jsx';

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.sme.dashboard().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="muted sm" style={{padding:40,textAlign:'center'}}>Lade Dashboard…</div>;
  if (!data)   return null;

  return (
    <div>
      {/* KPIs */}
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))'}}>
        <div className="stat" onClick={()=>onNavigate('invoices')}>
          <div className="stat-label">Umsatz (bezahlt)</div>
          <div className="stat-value" style={{color:'var(--ok)'}}>{fmt(data.revenue)}</div>
          <div className="stat-sub">↗ Alle bezahlten Rechnungen</div>
        </div>
        <div className="stat" onClick={()=>onNavigate('invoices')}>
          <div className="stat-label">Offen</div>
          <div className="stat-value" style={{color:'var(--primary)'}}>{fmt(data.openAmount)}</div>
          <div className="stat-sub" style={{color:'var(--ink3)'}}>{data.openCount} Rechnung{data.openCount!==1?'en':''}</div>
        </div>
        {data.overdueAmount > 0 && (
          <div className="stat" onClick={()=>onNavigate('invoices')}>
            <div className="stat-label">Überfällig</div>
            <div className="stat-value" style={{color:'var(--danger)'}}>{fmt(data.overdueAmount)}</div>
            <div className="stat-sub warn">{data.overdueCount} Mahnung{data.overdueCount!==1?'en':''} nötig</div>
          </div>
        )}
        <div className="stat" onClick={()=>onNavigate('customers')}>
          <div className="stat-label">Kunden</div>
          <div className="stat-value">{data.customerCount}</div>
          <div className="stat-sub">Kontakte gesamt</div>
        </div>
        <div className="stat" onClick={()=>onNavigate('pipeline')}>
          <div className="stat-label">Pipeline</div>
          <div className="stat-value">{fmt(data.pipelineValue)}</div>
          <div className="stat-sub">Gewichteter Wert</div>
        </div>
        <div className="stat" onClick={()=>onNavigate('expenses')}>
          <div className="stat-label">Ausgaben</div>
          <div className="stat-value">{fmt(data.expenses)}</div>
          <div className="stat-sub">Gesamt Belege</div>
        </div>
      </div>

      {/* Alerts */}
      {data.lowStockCount > 0 && (
        <div className="notice" style={{cursor:'pointer'}} onClick={()=>onNavigate('inventory')}>
          <AlertTriangle size={13} style={{verticalAlign:'-2px',marginRight:6}}/>
          <strong>{data.lowStockCount} Artikel</strong> unter Mindestbestand — Inventar prüfen
        </div>
      )}

      <div className="grid-2">
        {/* Recent invoices */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Letzte Rechnungen</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>onNavigate('invoices')}>
              Alle <ArrowRight size={12}/>
            </button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Nummer</th><th>Kunde</th><th>Betrag</th><th>Status</th></tr></thead>
              <tbody>
                {data.recentInvoices.map(i => (
                  <tr key={i.id} className="clickable" onClick={()=>onNavigate('invoices')}>
                    <td className="bold sm">{i.invoice_number}</td>
                    <td className="sm">{i.client_name}</td>
                    <td className="bold">{fmt(i.gross)}</td>
                    <td><Badge status={i.status}/></td>
                  </tr>
                ))}
                {data.recentInvoices.length === 0 && (
                  <tr><td colSpan={4} className="muted sm" style={{textAlign:'center',padding:24}}>Noch keine Rechnungen</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent customers */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Neue Kunden</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>onNavigate('customers')}>
              Alle <ArrowRight size={12}/>
            </button>
          </div>
          <div className="card-body">
            {data.recentCustomers.map(c => (
              <div key={c.id} className="fb" style={{padding:'8px 0',borderBottom:'1px solid var(--border2)',cursor:'pointer'}}
                onClick={()=>onNavigate('customers')}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div className="avatar-sm">{c.name.slice(0,2).toUpperCase()}</div>
                  <div>
                    <div className="bold sm">{c.name}</div>
                    <div className="muted sm">{c.company||c.city||'–'}</div>
                  </div>
                </div>
                <Badge status={c.type}/>
              </div>
            ))}
            {data.recentCustomers.length === 0 && (
              <div className="empty"><Users size={28}/><span>Noch keine Kunden</span></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
