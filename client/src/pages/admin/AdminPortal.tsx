import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, CheckCircle, ToggleLeft, ToggleRight, Save } from 'lucide-react';
import { api, fmt } from '../../api';
import { Badge, Modal } from '../../components/ui';

const MODULES = [
  {key:'contacts',label:'Kunden & CRM'},
  {key:'pipeline',label:'Sales Pipeline'},
  {key:'invoices',label:'Rechnungen'},
  {key:'expenses',label:'Belege'},
  {key:'inventory',label:'Inventar'},
  {key:'ai',label:'KI-Assistent'},
];

function Toggle({on, onToggle}) {
  return (
    <button onClick={onToggle} style={{background:'none',border:'none',cursor:'pointer',color:on?'var(--ok)':'var(--ink3)',display:'flex',alignItems:'center',gap:4,fontSize:12}}>
      {on ? <><ToggleRight size={20}/>Aktiv</> : <><ToggleLeft size={20}/>Aus</>}
    </button>
  );
}

function CreateStbModal({onClose,onDone}) {
  const [f,setF] = useState({email:'',name:'',password:'',firm_name:'',address:'',phone:'',commission_rate:'0.25'});
  const [err,setErr] = useState('');
  const save = async () => {
    setErr('');
    try { await api.admin.createStb(f); onDone(); }
    catch(e) { setErr(e.message); }
  };
  return (
    <Modal title="Neuer Steuerberater" onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
      <button className="btn btn-primary" onClick={save}><Plus size={13}/>Anlegen</button>
    </>}>
      {err && <div className="notice err">{err}</div>}
      <div className="form-row">
        <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Kanzlei *</label><input className="form-input" value={f.firm_name} onChange={e=>setF(p=>({...p,firm_name:e.target.value}))}/></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">E-Mail *</label><input className="form-input" type="email" value={f.email} onChange={e=>setF(p=>({...p,email:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Passwort *</label><input className="form-input" type="password" value={f.password} onChange={e=>setF(p=>({...p,password:e.target.value}))}/></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Provision (z.B. 0.25 = 25%)</label><input className="form-input" type="number" step="0.01" value={f.commission_rate} onChange={e=>setF(p=>({...p,commission_rate:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Telefon</label><input className="form-input" value={f.phone} onChange={e=>setF(p=>({...p,phone:e.target.value}))}/></div>
      </div>
    </Modal>
  );
}

function EditStbModal({stb,onClose,onDone}) {
  const [feats,setFeats] = useState(() => { try { return JSON.parse(stb.features||'{}'); } catch { return {ai:true,datev:true}; } });
  const [rate,setRate]   = useState(stb.commission_rate || 0.25);
  const save = async () => {
    try { await api.admin.updateStb(stb.id, {features:feats, commission_rate:parseFloat(rate)}); onDone(); }
    catch(e) { alert(e.message); }
  };
  return (
    <Modal title={`Einstellungen: ${stb.firm_name}`} onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
      <button className="btn btn-primary" onClick={save}><CheckCircle size={13}/>Speichern</button>
    </>}>
      <div className="form-group">
        <label className="form-label">Provision (z.B. 0.25 = 25%)</label>
        <input className="form-input" type="number" step="0.01" value={rate} onChange={e=>setRate(e.target.value)}/>
      </div>
      <p className="sm muted" style={{marginBottom:10}}>Erlaubte Features:</p>
      {[['ai','KI-Funktionen'],['datev','DATEV-Export'],['invoices','Rechnungen einsehen'],['commission','Provisionsübersicht']].map(([k,l]) => (
        <div key={k} className="fb" style={{padding:'9px 0',borderBottom:'1px solid var(--border2)'}}>
          <span className="sm bold">{l}</span>
          <Toggle on={feats[k]} onToggle={()=>setFeats(p=>({...p,[k]:!p[k]}))}/>
        </div>
      ))}
    </Modal>
  );
}

function EditSmeModal({sme,stbs,onClose,onDone}) {
  const [mods,setMods] = useState(() => { try { return JSON.parse(sme.modules||'{}'); } catch { return {}; } });
  const [stbId,setStbId] = useState(sme.stb_id||'');
  const save = async () => {
    try { await api.admin.updateSme(sme.id, {modules:mods, stb_id:stbId||null}); onDone(); }
    catch(e) { alert(e.message); }
  };
  return (
    <Modal title={`Einstellungen: ${sme.firm_name}`} onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
      <button className="btn btn-primary" onClick={save}><CheckCircle size={13}/>Speichern</button>
    </>}>
      <div className="form-group">
        <label className="form-label">Steuerberater zuweisen</label>
        <select className="form-select" value={stbId} onChange={e=>setStbId(e.target.value)}>
          <option value="">— Kein Steuerberater —</option>
          {stbs.map(s=><option key={s.id} value={s.id}>{s.firm_name}</option>)}
        </select>
      </div>
      <p className="sm muted" style={{marginBottom:10}}>Freigeschaltete Module:</p>
      {MODULES.map(m=>(
        <div key={m.key} className="fb" style={{padding:'9px 0',borderBottom:'1px solid var(--border2)'}}>
          <span className="sm bold">{m.label}</span>
          <Toggle on={mods[m.key]} onToggle={()=>setMods(p=>({...p,[m.key]:!p[m.key]}))}/>
        </div>
      ))}
    </Modal>
  );
}

export default function AdminPortal() {
  const [tab,setTab]             = useState('overview');
  const [stats,setStats]         = useState(null);
  const [stbs,setStbs]           = useState([]);
  const [smes,setSmes]           = useState([]);
  const [coms,setComs]           = useState([]);
  const [showCreateStb,setShowCreateStb] = useState(false);
  const [editStb,setEditStb]     = useState(null);
  const [editSme,setEditSme]     = useState(null);

  const load = async () => {
    const [s,st,sm,c] = await Promise.all([api.admin.stats(),api.admin.stbs(),api.admin.smes(),api.admin.commissions()]);
    setStats(s); setStbs(st); setSmes(sm); setComs(c);
  };
  useEffect(() => { load(); }, []);

  const delStb = async (id) => {
    if (confirm('Steuerberater und alle Daten löschen?')) { await api.admin.deleteStb(id); load(); }
  };

  return (
    <div>
      <div style={{background:'linear-gradient(135deg,#0d1b2a,#1e3a5f)',borderRadius:'var(--r-xl)',padding:'18px 22px',marginBottom:22,display:'flex',alignItems:'center',gap:14}}>
        <div style={{width:42,height:42,borderRadius:'50%',background:'#f39c12',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:16}}>SA</div>
        <div>
          <div style={{fontFamily:'var(--font-display)',fontSize:18,color:'#fff',fontWeight:700}}>Super-Admin Konsole</div>
          <div style={{fontSize:12,color:'rgba(255,255,255,.5)'}}>Vollzugriff auf die gesamte Plattform</div>
        </div>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat"><div className="stat-label">Steuerberater</div><div className="stat-value">{stats.stbCount}</div></div>
          <div className="stat"><div className="stat-label">Unternehmen</div><div className="stat-value">{stats.smeCount}</div></div>
          <div className="stat"><div className="stat-label">Rechnungsvolumen</div><div className="stat-value">{fmt(stats.invoiceVol)}</div></div>
          <div className="stat"><div className="stat-label">Plattform-Provision</div><div className="stat-value">{fmt(coms.reduce((s,c)=>s+c.commission_eur,0))}</div></div>
        </div>
      )}

      <div className="tabs">
        {[['overview','Übersicht'],['stb','Steuerberater'],['sme','Unternehmen'],['commissions','Provisionen'],['stats','Statistiken'],['tickets','Tickets'],['audit','Audit-Log']].map(([v,l]) => (
          <button key={v} className={`tab${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
        ))}
      </div>

      {tab==='audit' && <AuditLogTab/>}
      {tab==='stats' && <UsageStatsTab/>}
      {tab==='tickets' && <TicketsAdminTab/>}

      {tab==='stb' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Steuerberater ({stbs.length})</span>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowCreateStb(true)}><Plus size={13}/>Neuer StB</button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Kanzlei</th><th>E-Mail</th><th>Mandanten</th><th>Volumen</th><th>Provision</th><th>Login</th><th></th></tr></thead>
              <tbody>
                {stbs.map(s => (
                  <tr key={s.id}>
                    <td><div className="bold">{s.firm_name}</div><div className="muted sm">{s.user_name}</div></td>
                    <td className="muted sm">{s.email}</td>
                    <td className="bold">{s.client_count}</td>
                    <td>{fmt(s.paid_vol)}</td>
                    <td className="bold ok-c">{fmt(s.paid_vol*s.commission_rate)}</td>
                    <td className="muted sm">{s.last_login?.slice(0,10)||'–'}</td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setEditStb(s)}><Edit2 size={12}/></button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>delStb(s.id)} style={{color:'var(--danger)'}}><Trash2 size={12}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='sme' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Alle Unternehmen ({smes.length})</span></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Firma</th><th>Steuerberater</th><th>E-Mail</th><th>Rechnungen</th><th>Volumen</th><th>Login</th><th></th></tr></thead>
              <tbody>
                {smes.map(s => (
                  <tr key={s.id}>
                    <td><div className="bold">{s.firm_name}</div><div className="muted sm">{s.legal_form}</div></td>
                    <td className="muted sm">{s.stb_firm||'–'}</td>
                    <td className="muted sm">{s.email}</td>
                    <td>{s.invoice_count}</td>
                    <td>{fmt(s.total_vol)}</td>
                    <td className="muted sm">{s.last_login?.slice(0,10)||'–'}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={()=>setEditSme(s)}><Edit2 size={12}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='commissions' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Provisionsübersicht</span></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Steuerberater</th><th>Mandanten</th><th>Bezahltes Volumen</th><th>Provision %</th><th>Provision €</th></tr></thead>
              <tbody>
                {coms.map(c => (
                  <tr key={c.id}>
                    <td><div className="bold">{c.firm_name}</div><div className="muted sm">{c.email}</div></td>
                    <td>{c.client_count}</td>
                    <td>{fmt(c.paid_vol)}</td>
                    <td>{(c.commission_rate*100).toFixed(0)} %</td>
                    <td className="bold ok-c">{fmt(c.commission_eur)}</td>
                  </tr>
                ))}
                <tr style={{background:'var(--bg)',fontWeight:700}}>
                  <td colSpan={4}>Gesamt</td>
                  <td className="ok-c">{fmt(coms.reduce((s,c)=>s+c.commission_eur,0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='overview' && stats && (
        <div className="grid-2">
          <div className="card"><div className="card-header"><span className="card-title">Top Steuerberater</span></div>
            <div className="card-body">
              {stbs.slice(0,5).map(s=>(
                <div key={s.id} className="fb mb-2" style={{paddingBottom:10,borderBottom:'1px solid var(--border2)'}}>
                  <div><div className="bold sm">{s.firm_name}</div><div className="muted sm">{s.client_count} Mandanten</div></div>
                  <span className="bold ok-c sm">{fmt(s.paid_vol*s.commission_rate)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card"><div className="card-header"><span className="card-title">Neueste Firmen</span></div>
            <div className="card-body">
              {smes.slice(0,5).map(s=>(
                <div key={s.id} className="fb mb-2" style={{paddingBottom:10,borderBottom:'1px solid var(--border2)'}}>
                  <div><div className="bold sm">{s.firm_name}</div><div className="muted sm">{s.stb_firm||'Kein StB'}</div></div>
                  <span className="muted sm">{s.last_login?.slice(0,10)||'–'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCreateStb && <CreateStbModal onClose={()=>setShowCreateStb(false)} onDone={()=>{setShowCreateStb(false);load();}}/>}
      {editStb && <EditStbModal stb={editStb} onClose={()=>setEditStb(null)} onDone={()=>{setEditStb(null);load();}}/>}
      {editSme && <EditSmeModal sme={editSme} stbs={stbs} onClose={()=>setEditSme(null)} onDone={()=>{setEditSme(null);load();}}/>}
    </div>
  );
}

function AuditLogTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [search, setSearch]   = useState('');
  const loadEntries = (q='') => api.get<any[]>(`/admin/audit${q?`?search=${encodeURIComponent(q)}`:''}`).then(setEntries).catch(()=>setEntries([]));
  useEffect(()=>{ loadEntries(); }, []);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Audit-Log ({entries.length})</span>
        <div style={{display:'flex',gap:8}}>
          <input className="form-input" style={{width:220,fontSize:12}} placeholder="Action / Email / Ref-ID…"
            value={search} onChange={(e)=>setSearch(e.target.value)}
            onKeyDown={(e)=>e.key==='Enter'&&loadEntries(search)}/>
          <button className="btn btn-secondary btn-sm" onClick={()=>loadEntries(search)}>Suchen</button>
        </div>
      </div>
      <div className="tbl-wrap" style={{maxHeight:'70vh',overflowY:'auto'}}>
        <table>
          <thead><tr><th>Zeit</th><th>Aktion</th><th>User</th><th>Ref</th><th>IP</th><th>Meta</th></tr></thead>
          <tbody>
            {entries.map((e:any)=>(
              <tr key={e.id}>
                <td className="muted sm" style={{whiteSpace:'nowrap'}}>{e.created_at}</td>
                <td className="bold sm">{e.action}</td>
                <td className="muted sm">{e.user_email||'–'}</td>
                <td className="muted sm">{e.ref_type ? `${e.ref_type}:${(e.ref_id||'').slice(0,8)}` : '–'}</td>
                <td className="muted sm">{e.ip || '–'}</td>
                <td className="muted sm" style={{maxWidth:300,overflow:'hidden',textOverflow:'ellipsis'}}>{e.meta || '–'}</td>
              </tr>
            ))}
            {entries.length===0 && <tr><td colSpan={6} className="muted sm" style={{textAlign:'center',padding:24}}>Keine Audit-Einträge.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Usage-Statistiken ────────────────────────────────────────────────────────
function UsageStatsTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api.get(`/admin/usage/summary?days=${days}`).then(setData).catch(() => setData(null));
  }, [days]);

  if (!data) return <div className="muted sm" style={{ padding: 30, textAlign: 'center' }}>Lade Statistiken…</div>;

  const maxDaily = Math.max(1, ...data.daily_active.map((d: any) => d.events));
  return (
    <div>
      <div className="card mb-3">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="bold sm">Zeitraum</span>
          {[7, 30, 90, 365].map((d) => (
            <button key={d} className={`btn btn-sm ${days === d ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDays(d)}>
              {d === 365 ? 'Letztes Jahr' : `${d} Tage`}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="stat-label">Aktive Nutzer ({days}d)</div><div className="stat-value">{data.active_users} / {data.total_users}</div></div>
        <div className="stat"><div className="stat-label">Events gesamt</div><div className="stat-value">{data.total_events.toLocaleString('de-DE')}</div></div>
        <div className="stat"><div className="stat-label">Pro aktivem User</div><div className="stat-value">{data.active_users > 0 ? Math.round(data.total_events / data.active_users) : 0}</div></div>
        <div className="stat"><div className="stat-label">Top-Feature</div><div className="stat-value" style={{ fontSize: 18 }}>{data.top_features[0]?.event_name || '–'}</div></div>
      </div>

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Top Features (Klicks)</span></div>
          <div className="card-body">
            {data.top_features.length === 0 ? (
              <p className="muted sm">Noch keine Events erfasst.</p>
            ) : data.top_features.map((f: any, i: number) => {
              const max = data.top_features[0].count;
              return (
                <div key={f.event_name} style={{ marginBottom: 8 }}>
                  <div className="fb" style={{ marginBottom: 3, fontSize: 12 }}>
                    <span>{i + 1}. {f.event_name}</span>
                    <span className="bold">{f.count.toLocaleString('de-DE')}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${(f.count / max) * 100}%`, background: 'var(--primary)', borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Tägliche Aktivität</span></div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
              {data.daily_active.map((d: any) => (
                <div key={d.day} title={`${d.day}: ${d.users} Nutzer, ${d.events} Events`} style={{ flex: 1, background: 'var(--primary)', height: `${(d.events / maxDaily) * 100}%`, minHeight: 2, borderRadius: '2px 2px 0 0' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--ink3)' }}>
              <span>{data.daily_active[0]?.day || ''}</span>
              <span>{data.daily_active[data.daily_active.length - 1]?.day || ''}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><span className="card-title">Top-Nutzer</span></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>E-Mail</th><th>Rolle</th><th>Events</th><th>Zuletzt aktiv</th></tr></thead>
            <tbody>
              {data.top_users.map((u: any) => (
                <tr key={u.email}>
                  <td className="bold sm">{u.email}</td>
                  <td><Badge status={u.role === 'unternehmen' ? 'Aktiv' : u.role === 'steuerberater' ? 'Warm' : 'Lead'} text={u.role} /></td>
                  <td>{u.events.toLocaleString('de-DE')}</td>
                  <td className="muted sm">{new Date(u.last_seen).toLocaleString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><span className="card-title">Aktivität nach Rolle</span></div>
        <div className="card-body">
          {data.by_role.map((r: any) => (
            <div key={r.role} className="fb" style={{ padding: '8px 0', borderBottom: '1px dotted var(--border2)' }}>
              <span className="bold sm">{r.role}</span>
              <span className="muted sm">{r.users} Nutzer · {r.events.toLocaleString('de-DE')} Events</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Support-Tickets ──────────────────────────────────────────────────────────
function TicketsAdminTab() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('open');

  const load = () => api.get<any[]>('/tickets').then(setTickets).catch(() => setTickets([]));
  useEffect(() => { load(); }, []);

  const visible = tickets.filter((t) => filter === 'all' || (filter === 'open' ? t.status !== 'closed' : t.status === 'closed'));

  return (
    <div>
      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title">Support-Tickets ({visible.length})</span>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            {(['open', 'closed', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', background: filter === f ? 'var(--primary)' : 'transparent', color: filter === f ? '#fff' : 'var(--ink3)', fontSize: 12 }}>
                {f === 'open' ? 'Offen' : f === 'closed' ? 'Geschlossen' : 'Alle'}
              </button>
            ))}
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Datum</th><th>Nutzer</th><th>Rolle</th><th>Betreff</th><th>Kategorie</th><th>Priorität</th><th>Status</th></tr></thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => setSelected(t)}>
                  <td className="muted sm">{new Date(t.created_at).toLocaleString('de-DE')}</td>
                  <td className="bold sm">{t.user_email}</td>
                  <td className="sm">{t.role}</td>
                  <td className="bold sm">{t.subject}</td>
                  <td><span className="badge badge-neu">{t.category}</span></td>
                  <td>{t.priority === 'high' ? '🔴 Hoch' : t.priority === 'low' ? '🟢 Niedrig' : '🟡 Normal'}</td>
                  <td><Badge status={t.status === 'open' ? 'Offen' : t.status === 'in_progress' ? 'Warm' : 'Bezahlt'} text={t.status} /></td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={7} className="muted sm" style={{ textAlign: 'center', padding: 24 }}>Keine Tickets.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Modal title={`Ticket: ${selected.subject}`} large onClose={() => setSelected(null)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setSelected(null)}>Schließen</button>
            <button className="btn btn-primary" onClick={async () => {
              try {
                await api.put(`/tickets/${selected.id}`, {
                  status: selected.status,
                  admin_note: selected.admin_note,
                  priority: selected.priority,
                });
                load(); setSelected(null);
              } catch (e: any) { alert(e.message); }
            }}><Save size={13} />Speichern</button>
          </>}>
          <div className="muted sm" style={{ marginBottom: 14 }}>Von <strong>{selected.user_email}</strong> · {new Date(selected.created_at).toLocaleString('de-DE')}</div>
          <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--r)', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
            {selected.body}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={selected.status} onChange={(e) => setSelected({ ...selected, status: e.target.value })}>
                <option value="open">Offen</option>
                <option value="in_progress">In Bearbeitung</option>
                <option value="closed">Geschlossen</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priorität</label>
              <select className="form-select" value={selected.priority} onChange={(e) => setSelected({ ...selected, priority: e.target.value })}>
                <option value="low">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="high">Hoch</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Interne Notiz (für Admin-Team)</label>
            <textarea className="form-textarea" rows={3} value={selected.admin_note || ''} onChange={(e) => setSelected({ ...selected, admin_note: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
