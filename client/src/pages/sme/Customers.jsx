import { useState, useEffect } from 'react';
import { Plus, X, Search, Users, Phone, Mail, MapPin, Link, Paperclip, FileText } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api.js';
import { Badge, Modal, Empty } from '../../components/ui.jsx';

const STATUS_OPTS = ['Aktiv','Lead','Warm','Inaktiv'];
const TYPE_OPTS   = ['Kunde','Interessent','Partner','Lieferant','Inaktiv'];
const GROUP_OPTS  = ['Handel','Bau','IT','Beratung','Handwerk','Gesundheit','Sonstiges'];

function CustomerModal({ id, all, onClose, onNavigate }) {
  const [data, setData] = useState(null);
  const load = () => api.sme.customer(id).then(setData);
  useEffect(() => { load(); }, [id]);
  if (!data) return null;

  const c = data;
  const referredBy   = all.find(x => x.id === c.referred_by);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div className="modal-hd">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className="avatar" style={{fontSize:14,width:44,height:44}}>
              {c.name.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div className="modal-title">{c.name}</div>
              <div className="muted sm">{c.company} {c.city ? `· ${c.city}` : ''}</div>
            </div>
            <Badge status={c.type}/>
            <Badge status={c.status}/>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>

        <div style={{display:'flex',overflowX:'auto',borderBottom:'1px solid var(--border2)'}}>
          {['info','invoices','connections','files'].map(t => (
            <button key={t} className={`tab active-detail`} style={{borderBottom:'2px solid transparent'}} data-tab={t}
              onClick={e=>{document.querySelectorAll('.detail-tab').forEach(x=>x.classList.remove('active'));e.currentTarget.classList.add('active')}}>
              {({info:'Info',invoices:'Rechnungen',connections:'Verbindungen',files:'Dateien'})[t]}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {/* Info tab always shown — would use state in a fuller impl */}
          <div className="form-row">
            <div>
              {[
                ['📧 E-Mail', c.email],
                ['📞 Telefon', c.phone || c.mobile],
                ['🏠 Adresse', [c.address,c.plz,c.city].filter(Boolean).join(', ')],
                ['🎂 Geburtstag', fmtDate(c.birthday)],
                ['🔢 Steuernr.', c.tax_id],
                ['📅 Letzter Kontakt', fmtDate(c.last_contact)],
                ['✍️ Notizen', c.notes],
              ].map(([l,v]) => v ? (
                <div key={l} style={{display:'flex',gap:10,padding:'7px 0',borderBottom:'1px solid var(--border2)'}}>
                  <span className="muted sm" style={{width:130,flexShrink:0}}>{l}</span>
                  <span className="sm">{v}</span>
                </div>
              ) : null)}
              {referredBy && (
                <div style={{display:'flex',gap:10,padding:'7px 0',borderBottom:'1px solid var(--border2)'}}>
                  <span className="muted sm" style={{width:130,flexShrink:0}}>👥 Empfohlen von</span>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{onClose(); setTimeout(()=>onNavigate&&onNavigate('customers',referredBy.id),100);}}>
                    {referredBy.name} ({referredBy.company||'–'})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Rechnungen */}
          {data.invoices?.length > 0 && (
            <>
              <div className="divider"/>
              <div className="bold sm" style={{marginBottom:8}}>Rechnungen</div>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Nummer</th><th>Beschreibung</th><th>Brutto</th><th>Status</th></tr></thead>
                <tbody>
                  {data.invoices.map(i=>(
                    <tr key={i.id}><td className="bold sm">{i.invoice_number}</td><td className="sm">{i.description}</td><td>{fmt(i.gross)}</td><td><Badge status={i.status}/></td></tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}

          {/* Empfehlungen */}
          {data.referrals?.length > 0 && (
            <>
              <div className="divider"/>
              <div className="bold sm" style={{marginBottom:8}}>Hat empfohlen</div>
              {data.referrals.map(r=>(
                <div key={r.id} style={{padding:'6px 0',fontSize:13}}>→ {r.name} ({r.company||'–'})</div>
              ))}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

export default function Customers({ onNavigate }) {
  const [customers,setCustomers] = useState([]);
  const [search,setSearch]       = useState('');
  const [filter,setFilter]       = useState('');
  const [detail,setDetail]       = useState(null);
  const [showNew,setShowNew]     = useState(false);
  const [form,setForm]           = useState({
    name:'',company:'',email:'',phone:'',mobile:'',
    address:'',city:'',plz:'',birthday:'',tax_id:'',
    type:'Interessent',group_name:'',status:'Aktiv',
    notes:'',referred_by:'',
  });
  const [formErr,setFormErr] = useState('');

  const load = () => api.sme.customers().then(setCustomers);
  useEffect(() => { load(); }, []);

  const visible = customers.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || [c.name,c.company,c.email,c.city].some(v=>v?.toLowerCase().includes(q));
    const matchF = !filter || c.type === filter;
    return matchQ && matchF;
  });

  const save = async () => {
    setFormErr('');
    try {
      await api.sme.createCustomer(form);
      setShowNew(false);
      setForm({name:'',company:'',email:'',phone:'',mobile:'',address:'',city:'',plz:'',birthday:'',tax_id:'',type:'Interessent',group_name:'',status:'Aktiv',notes:'',referred_by:''});
      load();
    } catch(e) { setFormErr(e.message); }
  };

  const typeColor = {Kunde:'var(--ok)',Interessent:'var(--primary)',Partner:'var(--accent)',Lieferant:'var(--warn)',Inaktiv:'var(--ink3)'};

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Kunden ({visible.length})</span>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{position:'relative'}}>
              <Search size={13} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--ink3)'}}/>
              <input className="form-input" style={{paddingLeft:28,width:180}} placeholder="Suchen…"
                value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <select className="form-select" style={{width:130}} value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="">Alle Typen</option>
              {TYPE_OPTS.map(t=><option key={t}>{t}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)}><Plus size={13}/>Neuer Kunde</button>
          </div>
        </div>

        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Name</th><th>Unternehmen</th><th>Typ</th><th>Status</th><th>Stadt</th><th>Letzter Kontakt</th><th>Rechnungen</th></tr></thead>
            <tbody>
              {visible.map(c => (
                <tr key={c.id} className="clickable" onClick={()=>setDetail(c.id)}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:9}}>
                      <div className="avatar-sm" style={{background:typeColor[c.type]+'22',color:typeColor[c.type]}}>
                        {c.name.slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="bold sm">{c.name}</div>
                        {c.email && <div className="muted sm">{c.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="sm">{c.company||'–'}</td>
                  <td><Badge status={c.type}/></td>
                  <td><Badge status={c.status}/></td>
                  <td className="muted sm">{c.city||'–'}</td>
                  <td className="muted sm">{fmtDate(c.last_contact)}</td>
                  <td className="sm">–</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={7}><Empty icon={<Users size={32}/>} text="Keine Kunden gefunden" action={<button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)}><Plus size={13}/>Ersten Kunden anlegen</button>}/></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && <CustomerModal id={detail} all={customers} onClose={()=>setDetail(null)}/>}

      {showNew && (
        <Modal title="Neuer Kunde" onClose={()=>setShowNew(false)} large footer={<>
          <button className="btn btn-secondary" onClick={()=>setShowNew(false)}>Abbrechen</button>
          <button className="btn btn-primary" onClick={save}><Plus size={13}/>Anlegen</button>
        </>}>
          {formErr && <div className="notice err">{formErr}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus/></div>
            <div className="form-group"><label className="form-label">Unternehmen</label><input className="form-input" value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">E-Mail</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Telefon</label><input className="form-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Typ</label>
              <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {TYPE_OPTS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                {STATUS_OPTS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Adresse</label><input className="form-input" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Stadt</label><input className="form-input" value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">PLZ</label><input className="form-input" value={form.plz} onChange={e=>setForm(f=>({...f,plz:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Geburtstag</label><input className="form-input" type="date" value={form.birthday} onChange={e=>setForm(f=>({...f,birthday:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Gruppe / Branche</label>
              <select className="form-select" value={form.group_name} onChange={e=>setForm(f=>({...f,group_name:e.target.value}))}>
                <option value="">– Keine –</option>
                {GROUP_OPTS.map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Empfohlen von</label>
              <select className="form-select" value={form.referred_by} onChange={e=>setForm(f=>({...f,referred_by:e.target.value}))}>
                <option value="">– Niemanden –</option>
                {customers.filter(c=>c.name!==form.name).map(c=><option key={c.id} value={c.id}>{c.name} ({c.company||'–'})</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Notizen</label><textarea className="form-textarea" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}/></div>
        </Modal>
      )}
    </div>
  );
}
