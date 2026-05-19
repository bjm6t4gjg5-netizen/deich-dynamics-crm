import { useState, useEffect } from 'react';
import { Plus, ArrowDown, ArrowUp, Package, AlertTriangle, Trash2, Image as ImageIcon } from 'lucide-react';
import { api, fmt, fmtDate, STORAGE } from '../../api';
import { Modal, Empty } from '../../components/ui';
import { ImageCropModal } from '../../components/InventoryPicker';

export default function Inventory() {
  const [data,setData]       = useState<any>({ items:[], allMovements:[] });
  const [selected,setSelected] = useState<string | null>(null);
  const [imageFor, setImageFor] = useState<any>(null);
  const [showNew,setShowNew] = useState(false);
  const [showMove,setShowMove] = useState(null);
  const [form,setForm]       = useState<any>({sku:'',name:'',description:'',category:'',unit:'Stück',stock:'0',min_stock:'0',buy_price:'',sell_price:'',supplier:'',is_unlimited:false});
  const [moveForm,setMoveForm] = useState({type:'Eingang',qty:'',unit_cost:'',note:''});
  const [err,setErr]         = useState('');

  const load = () => api.sme.inventory().then(setData);
  useEffect(()=>{ load(); },[]);

  const createItem = async () => {
    setErr('');
    try {
      // Strip the local-only preview fields before POST.
      const { _image_preview, _image_blob, ...payload } = form;
      const r = await api.sme.createItem(payload) as any;
      // If user attached an image, upload it now against the freshly-created item.
      if (_image_blob && r?.id) {
        const fd = new FormData();
        fd.append('image', _image_blob, 'item.jpg');
        const token = localStorage.getItem(STORAGE.TOKEN_KEY);
        await fetch(`/api/sme/inventory/${r.id}/image`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      }
      setShowNew(false);
      setForm({sku:'',name:'',description:'',category:'',unit:'Stück',stock:'0',min_stock:'0',buy_price:'',sell_price:'',supplier:'',is_unlimited:false,_image_preview:null,_image_blob:null});
      load();
    } catch(e:any) { setErr(e.message); }
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
      {/* Fixed 2-column layout — left list, right preview. Right column stays
          mounted even when no item is selected so the layout doesn't jump. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'flex-start' }}>
        {/* Item list */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Artikel ({data.items.length})</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={13} />Neuer Artikel</button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Artikel</th><th>SKU</th><th>Bestand</th><th>Min.</th><th>EK</th><th>VK</th><th></th></tr></thead>
              <tbody>
                {data.items.map((it) => (
                  <tr
                    key={it.id}
                    className="clickable"
                    onClick={() => setSelected(selected === it.id ? null : it.id)}
                    style={{ background: selected === it.id ? 'var(--primary-lt)' : '' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {it.image_url
                            ? <img src={it.image_url} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <Package size={16} color="var(--ink4)" />
                          }
                        </div>
                        <div>
                          <div className="bold sm">{it.name}</div>
                          <div className="muted sm">{it.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="muted sm">{it.sku || '–'}</td>
                    <td>
                      {it.is_unlimited ? (
                        <span className="bold ok-c">♾️ Unbegrenzt</span>
                      ) : (
                        <>
                          <span className={`bold${(!it.is_unlimited && it.stock <= (it.min_stock || 0)) ? ' err-c' : ''}`}>{it.stock} {it.unit}</span>
                          {!it.is_unlimited && it.stock <= (it.min_stock || 0) && it.min_stock > 0 && <AlertTriangle size={11} style={{ color: 'var(--danger)', marginLeft: 4, verticalAlign: '-1px' }} />}
                        </>
                      )}
                    </td>
                    <td className="muted sm">{it.is_unlimited ? '–' : `${it.min_stock} ${it.unit}`}</td>
                    <td className="sm">{it.buy_price ? fmt(it.buy_price) : '–'}</td>
                    <td className="sm">{it.sell_price ? fmt(it.sell_price) : '–'}</td>
                    <td>
                      {!it.is_unlimited && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => { e.stopPropagation(); setShowMove(it); setMoveForm({ type: 'Eingang', qty: '', unit_cost: String(it.buy_price || ''), note: '' }); }}
                          title="Warenbewegung erfassen"
                        >
                          <ArrowDown size={12} /><ArrowUp size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <Empty
                        icon={<Package size={28} />}
                        text="Noch keine Artikel angelegt"
                        action={<button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={13} />Ersten Artikel anlegen</button>}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel — ALWAYS rendered, content depends on selection. */}
        <div>
          {item ? (
            <>
              {item.image_url && (
                <div className="card mb-3" style={{ overflow: 'hidden' }}>
                  <img src={item.image_url} alt={item.name} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} />
                </div>
              )}
              <div className="card mb-3">
                <div className="card-header">
                  <span className="card-title">{item.name}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Bild hochladen / ändern"
                      onClick={() => setImageFor(item)}
                    >
                      <ImageIcon size={13} />{item.image_url ? 'Bild ändern' : 'Bild hinzufügen'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Auf Unbegrenzt umstellen"
                      onClick={async () => {
                        const target = item.is_unlimited ? 0 : 1;
                        const msg = target
                          ? `„${item.name}" auf unbegrenzten Bestand umstellen?\nLager-Abzug bei Verkäufen wird deaktiviert.`
                          : `„${item.name}" auf begrenzten Bestand zurückstellen?\nBestand wird auf 0 gesetzt, du musst manuell Eingänge buchen.`;
                        if (!confirm(msg)) return;
                        try {
                          await api.put(`/sme/inventory/${item.id}`, { is_unlimited: target === 1 });
                          await load();
                        } catch (e: any) { alert(e.message); }
                      }}
                    >
                      {item.is_unlimited ? '↩︎ Begrenzt' : '♾️ Unbegrenzt'}
                    </button>
                    {!item.is_unlimited && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => { setShowMove(item); setMoveForm({ type: 'Eingang', qty: '', unit_cost: String(item.buy_price || ''), note: '' }); }}
                      >
                        <Plus size={13} />Bewegung
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                      title="Artikel löschen"
                      onClick={async () => {
                        if (!confirm(`Artikel „${item.name}" endgültig löschen?`)) return;
                        try { await api.delete(`/sme/inventory/${item.id}`); setSelected(null); await load(); }
                        catch (e: any) { alert(e.message); }
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  {item.is_unlimited ? (
                    <div style={{ background: 'var(--ok-bg)', borderRadius: 'var(--r)', padding: '14px 18px', textAlign: 'center', color: 'var(--ok)' }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>♾️</div>
                      <div className="bold">Unbegrenzter Bestand</div>
                      <div className="sm" style={{ marginTop: 4 }}>
                        {item.sell_price ? `Verkaufspreis: ${fmt(item.sell_price)}` : 'Kein Verkaufspreis hinterlegt'}
                      </div>
                      <div className="muted sm" style={{ marginTop: 6 }}>
                        Wird bei jeder Rechnung nicht vom Lager abgezogen — ideal für Lizenzen, Software, Dienstleistungen.
                      </div>
                    </div>
                  ) : (() => {
                    const c = calcCostMethods(movs);
                    return (
                      <div className="grid-2" style={{ gap: 8, marginBottom: 12 }}>
                        <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 14px', textAlign: 'center' }}>
                          <div className="stat-label">Bestand</div>
                          <div className="stat-value" style={{ fontSize: 22, color: c.stock <= item.min_stock ? 'var(--danger)' : 'var(--ok)' }}>{c.stock} {item.unit}</div>
                        </div>
                        <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 14px', textAlign: 'center' }}>
                          <div className="stat-label">FIFO-Bewertung</div>
                          <div className="stat-value" style={{ fontSize: 18 }}>{fmt(c.fifoVal)}</div>
                        </div>
                        <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 14px', textAlign: 'center' }}>
                          <div className="stat-label">LIFO-Bewertung</div>
                          <div className="stat-value" style={{ fontSize: 18 }}>{fmt(c.lifoVal)}</div>
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
                      {[...movs].reverse().map((m) => (
                        <tr key={m.id}>
                          <td className="muted sm">{fmtDate(m.moved_at)}</td>
                          <td><span className={`badge ${m.type === 'Eingang' ? 'badge-ok' : 'badge-err'}`}>{m.type === 'Eingang' ? <ArrowDown size={10} /> : <ArrowUp size={10} />} {m.type}</span></td>
                          <td className={`bold ${m.type === 'Eingang' ? 'ok-c' : 'err-c'}`}>{m.type === 'Eingang' ? '+' : '-'}{m.qty} {item.unit}</td>
                          <td className="sm">{m.unit_cost ? fmt(m.unit_cost) : '–'}</td>
                          <td className="muted sm">{m.note || '–'}</td>
                        </tr>
                      ))}
                      {movs.length === 0 && <tr><td colSpan={5} className="muted sm" style={{ textAlign: 'center', padding: 20 }}>Noch keine Bewegungen</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <div className="card-header"><span className="card-title">Vorschau</span></div>
              <div className="card-body" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ink3)' }}>
                <Package size={40} style={{ opacity: .3, marginBottom: 14 }} />
                <div className="bold sm" style={{ color: 'var(--ink2)', marginBottom: 6 }}>Keine Vorschau verfügbar</div>
                <div className="sm">Klicke auf einen Artikel in der Liste, um Bestand, FIFO/LIFO-Bewertung und Warenbewegungen zu sehen.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {imageFor && (
        <ImageCropModal
          onClose={() => setImageFor(null)}
          onUpload={async (blob) => {
            const fd = new FormData();
            fd.append('image', blob, 'item.jpg');
            const token = localStorage.getItem(STORAGE.TOKEN_KEY);
            const r = await fetch(`/api/sme/inventory/${imageFor.id}/image`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: fd,
            });
            if (!r.ok) throw new Error('Upload fehlgeschlagen');
            await load();
          }}
        />
      )}

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
          {!form.is_unlimited && (
            <div className="form-row">
              <div className="form-group"><label className="form-label">Anfangsbestand</label><input className="form-input" type="number" step="0.01" value={form.stock} onChange={e=>setForm((f:any)=>({...f,stock:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Mindestbestand (Alarm)</label><input className="form-input" type="number" step="0.01" value={form.min_stock} onChange={e=>setForm((f:any)=>({...f,min_stock:e.target.value}))}/></div>
            </div>
          )}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Einkaufspreis (€)</label><input className="form-input" type="number" step="0.01" value={form.buy_price} onChange={e=>setForm(f=>({...f,buy_price:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Verkaufspreis (€)</label><input className="form-input" type="number" step="0.01" value={form.sell_price} onChange={e=>setForm(f=>({...f,sell_price:e.target.value}))}/></div>
          </div>
          <div className="form-group"><label className="form-label">Lieferant</label><input className="form-input" value={form.supplier} onChange={e=>setForm((f:any)=>({...f,supplier:e.target.value}))}/></div>
          <div className="form-group">
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'var(--ink2)'}}>
              <input type="checkbox" checked={!!form.is_unlimited} onChange={(e)=>setForm((f:any)=>({...f,is_unlimited:e.target.checked}))}/>
              <span>♾️ Unbegrenzter Bestand <span className="muted">(z.B. Lizenzen, Software, Dienstleistungen — kein Stock-Abzug bei Verkauf)</span></span>
            </label>
          </div>
          <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px dashed var(--border)' }}>
            {form._image_preview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={form._image_preview} style={{ width: 80, height: 60, borderRadius: 'var(--r)', objectFit: 'cover', border: '1px solid var(--border)' }} alt="Vorschau" />
                <div className="sm">Produktbild ausgewählt. Wird nach „Anlegen" mit dem Artikel verknüpft. Beschneiden + Drehen geht über „Bild ändern" im Detail-Panel.</div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f:any)=>({...f, _image_preview: null, _image_blob: null }))}>Entfernen</button>
              </div>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--ink2)' }}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setForm((fm: any) => ({ ...fm, _image_preview: ev.target?.result, _image_blob: f }));
                    reader.readAsDataURL(f);
                  }}
                />
                <span className="btn btn-secondary btn-sm" style={{ display: 'inline-flex' }}>📷 Produktbild hinzufügen</span>
                <span className="muted sm">Optional · JPG/PNG/WebP · später beschneiden möglich</span>
              </label>
            )}
          </div>
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
