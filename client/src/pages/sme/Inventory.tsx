import { useState, useEffect } from 'react';
import { Plus, ArrowDown, ArrowUp, Package, AlertTriangle } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api';
import { Modal, Empty } from '../../components/ui';

export default function Inventory() {
  const [data,setData]       = useState({ items:[], allMovements:[] });
  const [selected,setSelected] = useState(null);
  const [showNew,setShowNew] = useState(false);
  const [showMove,setShowMove] = useState(null);
  const [form,setForm]       = useState({sku:'',name:'',description:'',category:'',unit:'Stück',stock:'0',min_stock:'0',buy_price:'',sell_price:'',supplier:''});
  const [moveForm,setMoveForm] = useState({type:'Eingang',qty:'',unit_cost:'',note:''});
  const [err,setErr]         = useState('');

  const load = () => api.sme.inventory().then(setData);
  useEffect(()=>{ load(); },[]);

  const createItem = async () => {
    setErr('');
    try { await api.sme.createItem(form); setShowNew(false); load(); }
    catch(e) { setErr(e.message); }
  };

  const doMove = async () => {
    setErr('');
    try { await api.sme.moveStock(showMove.id, moveForm); setShowMove(null); setMoveForm({type:'Eingang',qty:'',unit_cost:'',note:''}); load(); }
    catch(e) { setErr(e.message); }
  };

  // FIFO/LIFO calculation for selected item
  const calcCostMethods = (movements) => {
    const inflows = movements.filter(m=>m.type==='Eingang').map(m=>({qty:m.qty,cost:m.unit_cost||0,date:m.moved_at}));
    const totalIn  = inflows.reduce((s,m)=>s+m.qty,0);
    const totalOut = movements.filter(m=>m.type==='Ausgang').reduce((s,m)=>s+m.qty,0);
    const stock    = totalIn - totalOut;

    // FIFO: oldest in = first out, so remaining stock = newest
    const fifoVal = inflows.slice(-Math.ceil(inflows.length/2)).reduce((s,m)=>s+(m.qty*m.cost),0);
    // LIFO: newest in = first out, remaining = oldest
    const lifoVal = inflows.slice(0,Math.ceil(inflows.length/2)).reduce((s,m)=>s+(m.qty*m.cost),0);
    return { stock, fifoVal, lifoVal };
  };

  const item = selected ? data.items.find(i=>i.id===selected) : null;
  const movs = item ? (item.movements||[]) : [];

  return (
    <div>
      <div className="grid-2" style={{gap:16}}>
        {/* Item list */}
        <div className="card" style={{gridColumn:item?'1':'1/-1'}}>
          <div className="card-header">
            <span className="card-title">Artikel ({data.items.length})</span>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)}><Plus size={13}/>Neuer Artikel</button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Artikel</th><th>SKU</th><th>Bestand</th><th>Min.</th><th>EK</th><th>VK</th><th></th></tr></thead>
              <tbody>
                {data.items.map(it=>(
                  <tr key={it.id} className="clickable" onClick={()=>setSelected(selected===it.id?null:it.id)}
                    style={{background:selected===it.id?'var(--primary-lt)':''}}>
                    <td>
                      <div className="bold sm">{it.name}</div>
                      <div className="muted sm">{it.category}</div>
                    </td>
                    <td className="muted sm">{it.sku||'–'}</td>
                    <td>
                      <span className={`bold${it.stock<=it.min_stock?' err-c':''}`}>{it.stock} {it.unit}</span>
                      {it.stock<=it.min_stock && <AlertTriangle size={11} style={{color:'var(--danger)',marginLeft:4,verticalAlign:'-1px'}}/>}
                    </td>
                    <td className="muted sm">{it.min_stock} {it.unit}</td>
                    <td className="sm">{it.buy_price?fmt(it.buy_price):'–'}</td>
                    <td className="sm">{it.sell_price?fmt(it.sell_price):'–'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setShowMove(it);setMoveForm({type:'Eingang',qty:'',unit_cost:String(it.buy_price||''),note:''});}}
                        title="Warenbewegung erfassen">
                        <ArrowDown size={12}/><ArrowUp size={12}/>
                      </button>
                    </td>
                  </tr>
                ))}
                {data.items.length===0&&<tr><td colSpan={7}><Empty icon={<Package size={28}/>} text="Noch keine Artikel angelegt" action={<button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)}><Plus size={13}/>Ersten Artikel anlegen</button>}/></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        {item && (
          <div>
            <div className="card mb-3">
              <div className="card-header">
                <span className="card-title">{item.name}</span>
                <button className="btn btn-primary btn-sm" onClick={()=>{setShowMove(item);setMoveForm({type:'Eingang',qty:'',unit_cost:String(item.buy_price||''),note:''});}}>
                  <Plus size={13}/>Bewegung
                </button>
              </div>
              <div className="card-body">
                {(() => {
                  const c = calcCostMethods(movs);
                  return (
                    <div className="grid-2" style={{gap:8,marginBottom:12}}>
                      <div style={{background:'var(--bg)',borderRadius:'var(--r)',padding:'10px 14px',textAlign:'center'}}>
                        <div className="stat-label">Bestand</div>
                        <div className="stat-value" style={{fontSize:22,color:c.stock<=item.min_stock?'var(--danger)':'var(--ok)'}}>{c.stock} {item.unit}</div>
                      </div>
                      <div style={{background:'var(--bg)',borderRadius:'var(--r)',padding:'10px 14px',textAlign:'center'}}>
                        <div className="stat-label">FIFO-Bewertung</div>
                        <div className="stat-value" style={{fontSize:18}}>{fmt(c.fifoVal)}</div>
                      </div>
                      <div style={{background:'var(--bg)',borderRadius:'var(--r)',padding:'10px 14px',textAlign:'center'}}>
                        <div className="stat-label">LIFO-Bewertung</div>
                        <div className="stat-value" style={{fontSize:18}}>{fmt(c.lifoVal)}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Warenbewegungen</span></div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Datum</th><th>Typ</th><th>Menge</th><th>Einzel-EK</th><th>Notiz</th></tr></thead>
                  <tbody>
                    {[...movs].reverse().map(m=>(
                      <tr key={m.id}>
                        <td className="muted sm">{fmtDate(m.moved_at)}</td>
                        <td><span className={`badge ${m.type==='Eingang'?'badge-ok':'badge-err'}`}>{m.type==='Eingang'?<ArrowDown size={10}/>:<ArrowUp size={10}/>} {m.type}</span></td>
                        <td className={`bold ${m.type==='Eingang'?'ok-c':'err-c'}`}>{m.type==='Eingang'?'+':'-'}{m.qty} {item.unit}</td>
                        <td className="sm">{m.unit_cost?fmt(m.unit_cost):'–'}</td>
                        <td className="muted sm">{m.note||'–'}</td>
                      </tr>
                    ))}
                    {movs.length===0&&<tr><td colSpan={5} className="muted sm" style={{textAlign:'center',padding:20}}>Noch keine Bewegungen</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {showNew && (
        <Modal title="Neuer Artikel" onClose={()=>setShowNew(false)} footer={<>
          <button className="btn btn-secondary" onClick={()=>setShowNew(false)}>Abbrechen</button>
          <button className="btn btn-primary" onClick={createItem}><Plus size={13}/>Anlegen</button>
        </>}>
          {err&&<div className="notice err">{err}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus/></div>
            <div className="form-group"><label className="form-label">SKU</label><input className="form-input" value={form.sku} onChange={e=>setForm(f=>({...f,sku:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Kategorie</label><input className="form-input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Einheit</label><select className="form-select" value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}>
              {['Stück','kg','g','l','ml','m','m²','Packung','Palette','Kiste','Lizenz'].map(u=><option key={u}>{u}</option>)}
            </select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Anfangsbestand</label><input className="form-input" type="number" step="0.01" value={form.stock} onChange={e=>setForm(f=>({...f,stock:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Mindestbestand (Alarm)</label><input className="form-input" type="number" step="0.01" value={form.min_stock} onChange={e=>setForm(f=>({...f,min_stock:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Einkaufspreis (€)</label><input className="form-input" type="number" step="0.01" value={form.buy_price} onChange={e=>setForm(f=>({...f,buy_price:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Verkaufspreis (€)</label><input className="form-input" type="number" step="0.01" value={form.sell_price} onChange={e=>setForm(f=>({...f,sell_price:e.target.value}))}/></div>
          </div>
          <div className="form-group"><label className="form-label">Lieferant</label><input className="form-input" value={form.supplier} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))}/></div>
        </Modal>
      )}

      {showMove && (
        <Modal title={`Warenbewegung: ${showMove.name}`} onClose={()=>setShowMove(null)} footer={<>
          <button className="btn btn-secondary" onClick={()=>setShowMove(null)}>Abbrechen</button>
          <button className="btn btn-primary" onClick={doMove}><Plus size={13}/>Buchen</button>
        </>}>
          {err&&<div className="notice err">{err}</div>}
          <div style={{background:'var(--bg)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:13}}>
            Aktueller Bestand: <strong>{showMove.stock} {showMove.unit}</strong>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Bewegungstyp</label>
              <select className="form-select" value={moveForm.type} onChange={e=>setMoveForm(f=>({...f,type:e.target.value}))}>
                <option value="Eingang">📥 Eingang (Wareneingang)</option>
                <option value="Ausgang">📤 Ausgang (Verkauf/Verbrauch)</option>
                <option value="Korrektur">✏️ Korrektur (Inventur)</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Menge ({showMove.unit}) *</label><input className="form-input" type="number" step="0.01" value={moveForm.qty} onChange={e=>setMoveForm(f=>({...f,qty:e.target.value}))} autoFocus/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Einkaufspreis / Stück (€)</label><input className="form-input" type="number" step="0.01" value={moveForm.unit_cost} onChange={e=>setMoveForm(f=>({...f,unit_cost:e.target.value}))} placeholder="Für LIFO/FIFO-Bewertung"/></div>
            <div className="form-group"><label className="form-label">Notiz</label><input className="form-input" value={moveForm.note} onChange={e=>setMoveForm(f=>({...f,note:e.target.value}))} placeholder="Lieferant, Rechnung-Nr. …"/></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
