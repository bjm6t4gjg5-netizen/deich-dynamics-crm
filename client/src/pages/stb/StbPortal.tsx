import { useState, useEffect } from 'react';
import { Plus, X, Zap, CheckCircle, ToggleLeft, ToggleRight, AlertTriangle, Trash2, MessageSquare } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api';
import { Badge, Modal, AIPanel, KeyNotice } from '../../components/ui';
import { useApp } from '../../context/AppContext';

const MODULES = [
  {key:'contacts',label:'Kunden & CRM'},
  {key:'pipeline',label:'Sales Pipeline'},
  {key:'invoices',label:'Rechnungen'},
  {key:'expenses',label:'Belege'},
  {key:'inventory',label:'Inventar'},
  {key:'ai',label:'KI-Assistent'},
];

function ClientModal({client,onClose,apiKey}: any) {
  const [tab,setTab]         = useState<'overview'|'invoices'|'expenses'|'modules'|'notes'|'ai'>('overview');
  const [detail,setDetail]   = useState<any>(null);
  const [mods,setMods]       = useState(() => { try { return JSON.parse(client.modules||'{}'); } catch { return {}; } });
  const [aiResult,setAiResult] = useState('');
  const [aiLoading,setAiLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const reload = () => api.stb.client(client.id).then(setDetail);
  useEffect(() => { reload(); }, [client.id]);

  const addNote = async () => {
    if (!noteDraft.trim()) return;
    try {
      await api.post(`/stb/clients/${client.id}/notes`, { text: noteDraft.trim() });
      setNoteDraft('');
      reload();
    } catch (e: any) { alert(e.message); }
  };
  const removeNote = async (noteId: string) => {
    if (!confirm('Notiz löschen?')) return;
    try { await api.delete(`/stb/clients/${client.id}/notes/${noteId}`); reload(); }
    catch (e: any) { alert(e.message); }
  };

  const saveMods = async () => {
    try { await api.stb.setModules(client.id, mods); alert('Gespeichert!'); }
    catch(e) { alert(e.message); }
  };

  const analyze = async () => {
    setAiLoading(true); setAiResult('');
    const r = await api.claude(
      `Steuerberater-KI: Analysiere Mandant ${client.firm_name}\nBuchungen: ${client.invoice_count}\nOffene Beträge: ${fmt(client.open_amount)}\nFehlende Belege: ${client.missing_receipts}\n\n1) Dringlichste Aufgabe 2) Risiken 3) Empfehlung Mandantengespräch`,
      apiKey
    );
    setAiResult(r); setAiLoading(false);
  };

  const health = client.missing_receipts > 5 ? 'danger' : client.missing_receipts > 0 ? 'warn' : 'ok';
  const hColor = {ok:'var(--ok)',warn:'var(--warn)',danger:'var(--danger)'}[health];

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div className="modal-hd">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className="avatar" style={{background:hColor,fontSize:13}}>
              {client.firm_name.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div className="modal-title">{client.firm_name}</div>
              <div className="muted sm">{client.legal_form} · {client.city}</div>
            </div>
            <Badge status={health==='ok'?'Aktiv':health==='warn'?'Warm':'Überfällig'}/>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>

        <div style={{display:'flex',overflowX:'auto',borderBottom:'1px solid var(--border2)'}}>
          {(['overview','invoices','expenses','modules','notes','ai'] as const).map(t=>(
            <button key={t} className={`tab${tab===t?' active':''}`} onClick={()=>setTab(t)}>
              {({overview:'Übersicht',invoices:'Rechnungen',expenses:'Belege',modules:'Module',notes:`Notizen${detail?.notes?.length?` (${detail.notes.length})`:''}`,ai:'KI-Analyse'} as any)[t]}
            </button>
          ))}
        </div>

        {tab==='overview' && (
          <div className="modal-body">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
              <div className="stat" style={{cursor:'default'}}><div className="stat-label">Buchungen</div><div className="stat-value" style={{fontSize:20}}>{client.invoice_count}</div></div>
              <div className="stat" style={{cursor:'default'}}><div className="stat-label">Offen</div><div className="stat-value" style={{fontSize:20,color:client.open_amount>0?'var(--primary)':'var(--ok)'}}>{fmt(client.open_amount)}</div></div>
              <div className="stat" style={{cursor:'default'}}><div className="stat-label">Belege fehlen</div><div className="stat-value" style={{fontSize:20,color:client.missing_receipts>0?'var(--danger)':'var(--ok)'}}>{client.missing_receipts}</div></div>
            </div>
            {[['E-Mail',client.email],['Login',client.user_name],['Stadt',client.city||'–'],['USt-IdNr.',client.ust_id||'–'],['IBAN',client.iban||'–']].map(([l,v])=>(
              <div key={l} style={{display:'flex',gap:12,padding:'8px 0',borderBottom:'1px solid var(--border2)'}}>
                <span className="muted sm" style={{width:110,flexShrink:0}}>{l}</span>
                <span className="sm">{v}</span>
              </div>
            ))}
          </div>
        )}

        {tab==='invoices' && detail && (
          <div className="modal-body" style={{padding:0}}>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Nummer</th><th>Beschreibung</th><th>Brutto</th><th>Fällig</th><th>Status</th></tr></thead>
              <tbody>
                {detail.invoices.map(i=>(
                  <tr key={i.id}><td className="bold sm">{i.invoice_number}</td><td className="sm">{i.description}</td><td className="bold">{fmt(i.gross)}</td><td className="muted sm">{fmtDate(i.due_date)}</td><td><Badge status={i.status}/></td></tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}

        {tab==='expenses' && detail && (
          <div className="modal-body" style={{padding:0}}>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Lieferant</th><th>Kategorie</th><th>Brutto</th><th>Beleg</th></tr></thead>
              <tbody>
                {detail.expenses.map(e=>(
                  <tr key={e.id}><td className="sm">{e.supplier}</td><td><span className="badge badge-neu">{e.category}</span></td><td>{fmt(e.gross)}</td>
                    <td>{e.has_receipt ? <span className="ok-c sm">✓</span> : <span className="badge badge-err">Fehlt</span>}</td></tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}

        {tab==='modules' && (
          <div className="modal-body">
            <p className="sm muted" style={{marginBottom:12}}>Legen Sie fest welche Module dieser Mandant nutzen darf:</p>
            {MODULES.map(m=>(
              <div key={m.key} className="fb" style={{padding:'10px 0',borderBottom:'1px solid var(--border2)'}}>
                <span className="bold sm">{m.label}</span>
                <button onClick={()=>setMods(p=>({...p,[m.key]:!p[m.key]}))}
                  style={{background:'none',border:'none',cursor:'pointer',color:mods[m.key]?'var(--ok)':'var(--ink3)',display:'flex',alignItems:'center',gap:4,fontSize:12}}>
                  {mods[m.key]?<><ToggleRight size={20}/>Aktiv</>:<><ToggleLeft size={20}/>Aus</>}
                </button>
              </div>
            ))}
            <button className="btn btn-primary mt-2" onClick={saveMods}><CheckCircle size={13}/>Speichern</button>
          </div>
        )}

        {tab==='notes' && (
          <div className="modal-body">
            <p className="sm muted" style={{marginBottom:14,lineHeight:1.7}}>
              Interne Notizen zu diesem Mandanten — nur für die Kanzlei sichtbar. Ideal für Mandantengespräche, Termine, To-Dos.
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
              {detail?.notes?.length === 0 && (
                <p className="muted sm" style={{padding:'12px 0'}}>Noch keine Notizen.</p>
              )}
              {(detail?.notes || []).map((n: any) => (
                <div key={n.id} style={{
                  background:'var(--bg)',border:'1px solid var(--border)',
                  borderRadius:'var(--r)',padding:'10px 14px',
                  display:'flex',gap:10,alignItems:'flex-start',
                }}>
                  <MessageSquare size={14} color="var(--ink3)" style={{marginTop:2,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div className="sm" style={{whiteSpace:'pre-wrap',lineHeight:1.6}}>{n.text}</div>
                    <div className="muted" style={{fontSize:11,marginTop:6}}>
                      {n.author_email} · {fmtDate(n.created_at)}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={() => removeNote(n.id)}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <textarea
                className="form-textarea"
                rows={2}
                style={{flex:1}}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Neue Notiz — z.B. „Letztes Gespräch am 12.5., Mandant möchte für Q3 quartalsweise abrechnen"
                onKeyDown={(e) => (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) && addNote()}
              />
              <button className="btn btn-primary" onClick={addNote} disabled={!noteDraft.trim()} style={{alignSelf:'flex-end'}}>
                <Plus size={13}/>Hinzufügen
              </button>
            </div>
            <p className="form-hint" style={{marginTop:6}}>Tipp: Cmd/Ctrl+Enter speichert</p>
          </div>
        )}

        {tab==='ai' && (
          <div className="modal-body">
            <AIPanel title={`KI-Analyse: ${client.firm_name}`} result={aiResult} loading={aiLoading}/>
            <button className="btn btn-primary" onClick={analyze} disabled={aiLoading}><Zap size={13}/>Analysieren</button>
          </div>
        )}

        <div className="modal-foot"><button className="btn btn-secondary" onClick={onClose}>Schließen</button></div>
      </div>
    </div>
  );
}

export default function StbPortal() {
  const { apiKey } = useApp();
  const [clients,setClients] = useState([]);
  const [stats,setStats]     = useState(null);
  const [tab,setTab]         = useState('clients');
  const [detail,setDetail]   = useState(null);
  const [showCreate,setShowCreate] = useState(false);
  const [coms,setComs]       = useState([]);
  const [form,setForm]       = useState({email:'',name:'',password:'',firm_name:'',legal_form:'GmbH',city:'',plz:''});
  const [formErr,setFormErr] = useState('');

  const load = async () => {
    const [c,s] = await Promise.all([api.stb.clients(), api.stb.stats()]);
    setClients(c); setStats(s);
  };
  const loadComs = async () => { setComs(await api.stb.commissions()); };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab==='commissions') loadComs(); }, [tab]);

  const createClient = async () => {
    setFormErr('');
    try { await api.stb.createClient(form); setShowCreate(false); setForm({email:'',name:'',password:'',firm_name:'',legal_form:'GmbH',city:'',plz:''}); load(); }
    catch(e) { setFormErr(e.message); }
  };

  const healthColor = (c) => c.missing_receipts > 5 ? 'var(--danger)' : c.missing_receipts > 0 ? 'var(--warn)' : 'var(--ok)';

  return (
    <div>
      {!apiKey && <KeyNotice onGo={()=>{}}/>}
      {stats && (
        <div className="stats-grid">
          <div className="stat"><div className="stat-label">Mandanten</div><div className="stat-value">{stats.clientCount}</div></div>
          <div className="stat"><div className="stat-label">Provision Mai</div><div className="stat-value">{fmt(stats.commission)}</div><div className="stat-sub">Wächst mit jedem Mandanten</div></div>
          <div className="stat"><div className="stat-label">Fehlende Belege</div><div className="stat-value" style={{color:stats.missingReceipts>0?'var(--danger)':'var(--ok)'}}>{stats.missingReceipts}</div></div>
        </div>
      )}

      <div className="tabs">
        {[['clients','Mandanten'],['commissions','Provisionen']].map(([v,l])=>(
          <button key={v} className={`tab${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
        ))}
      </div>

      {tab==='clients' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Mandanten ({clients.length})</span>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowCreate(true)}><Plus size={13}/>Mandant anlegen</button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Firma</th><th>E-Mail</th><th>Buchungen</th><th>Offen</th><th>Belege fehlen</th><th>Login</th></tr></thead>
              <tbody>
                {clients.map(c=>(
                  <tr key={c.id} className="clickable" onClick={()=>setDetail(c)}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div className="avatar-sm" style={{background:healthColor(c)+'33',color:healthColor(c)}}>
                          {c.firm_name.slice(0,2).toUpperCase()}
                        </div>
                        <div><div className="bold">{c.firm_name}</div><div className="muted sm">{c.legal_form} · {c.city}</div></div>
                      </div>
                    </td>
                    <td className="muted sm">{c.email}</td>
                    <td>{c.invoice_count}</td>
                    <td className={c.open_amount>0?'bold warn-c':''}>{fmt(c.open_amount)}</td>
                    <td>{c.missing_receipts > 0 ? <span className="badge badge-err"><AlertTriangle size={10}/> {c.missing_receipts}</span> : <span className="ok-c">✓</span>}</td>
                    <td className="muted sm">{c.last_login?.slice(0,10)||'Noch nie'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='commissions' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Provisionsdetails</span></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Mandant</th><th>Bezahltes Volumen</th><th>Provision (25%)</th></tr></thead>
              <tbody>
                {coms.map(c=>(
                  <tr key={c.id}><td><div className="bold">{c.firm_name}</div><div className="muted sm">{c.email}</div></td><td>{fmt(c.paid_vol)}</td><td className="bold ok-c">{fmt(c.commission)}</td></tr>
                ))}
                <tr style={{background:'var(--bg)',fontWeight:700}}><td>Gesamt</td><td>{fmt(coms.reduce((s,c)=>s+c.paid_vol,0))}</td><td className="ok-c">{fmt(coms.reduce((s,c)=>s+c.commission,0))}</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{padding:'10px 18px',fontSize:12,color:'var(--ink3)',borderTop:'1px solid var(--border2)'}}>
            Provisionen werden am 1. des Folgemonats per SEPA ausgezahlt.
          </div>
        </div>
      )}

      {detail && <ClientModal client={detail} onClose={()=>setDetail(null)} apiKey={apiKey}/>}

      {showCreate && (
        <Modal title="Neuen Mandanten anlegen" onClose={()=>setShowCreate(false)} footer={<>
          <button className="btn btn-secondary" onClick={()=>setShowCreate(false)}>Abbrechen</button>
          <button className="btn btn-primary" onClick={createClient}><Plus size={13}/>Anlegen</button>
        </>}>
          {formErr && <div className="notice err">{formErr}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Ansprechpartner *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Maria Bauer"/></div>
            <div className="form-group"><label className="form-label">Firmenname *</label><input className="form-input" value={form.firm_name} onChange={e=>setForm(f=>({...f,firm_name:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">E-Mail *</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Passwort *</label><input className="form-input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Rechtsform</label>
              <select className="form-select" value={form.legal_form} onChange={e=>setForm(f=>({...f,legal_form:e.target.value}))}>
                {['GmbH','UG','KG','GbR','Einzelunternehmen','AG'].map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Stadt</label><input className="form-input" value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
