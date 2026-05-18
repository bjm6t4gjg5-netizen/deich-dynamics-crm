import { useState, useEffect } from 'react';
import { Plus, Send, Bell, CheckCircle, X, Search, Eye, Download, Edit2, FileText } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api.js';
import { Badge, Modal } from '../../components/ui.jsx';

const STATUSES = ['Alle','Entwurf','Offen','Bezahlt','Überfällig','Storniert'];

function invoiceHtml(inv, sme) {
  const color = sme?.theme_color || '#1a5276';
  const iban  = sme?.iban ? `<p style="margin:3px 0"><b>IBAN:</b> ${sme.iban}${sme.bic?` &middot; BIC: ${sme.bic}`:''}</p>` : '';
  const ust   = sme?.ust_id ? `<p style="margin:2px 0;font-size:11px;color:#888">USt-IdNr.: ${sme.ust_id}</p>` : '';
  const logo  = sme?.logo_url ? `<img src="${window.location.origin}${sme.logo_url}" style="height:40px;object-fit:contain;margin-bottom:4px" alt="Logo"/>` : '';
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',sans-serif;color:#222;padding:40px;font-size:13px;line-height:1.6}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:18px;border-bottom:3px solid ${color}}.firm h1{font-size:20px;color:${color};font-weight:700}.inv-title{font-size:26px;font-weight:800;color:${color}}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}.meta-box{background:#f8f9fa;padding:12px;border-radius:6px}.meta-box h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#999;margin-bottom:6px}table{width:100%;border-collapse:collapse;margin-bottom:18px}th{padding:9px 12px;background:${color};color:#fff;text-align:left;font-size:11px;font-weight:600}td{padding:9px 12px;border-bottom:1px solid #f0f0f0}.total-section{display:flex;justify-content:flex-end;margin-bottom:24px}.total-box{width:240px;border:2px solid ${color};border-radius:6px;overflow:hidden}.total-row{display:flex;justify-content:space-between;padding:7px 12px;font-size:12px}.total-row.grand{background:${color};color:#fff;font-weight:700;font-size:14px;padding:10px 12px}.payment{background:#f8f9fa;border-radius:6px;padding:12px;margin-bottom:20px}.footer{border-top:1px solid #eee;padding-top:12px;font-size:10px;color:#aaa;text-align:center}</style>
</head><body>
<div class="header"><div class="firm">${logo}<h1>${sme?.firm_name||'Firmenname'}</h1><p style="color:#888;font-size:11px">${[sme?.address,sme?.plz,sme?.city].filter(Boolean).join(' &middot; ')}</p>${ust}</div><div style="text-align:right"><div class="inv-title">Rechnung</div><p style="color:#888;font-size:12px">${inv.invoice_number}</p><p style="color:#888;font-size:11px;margin-top:3px">Datum: ${fmtDate(inv.date)}</p></div></div>
<div class="meta-grid"><div class="meta-box"><h3>Rechnungsempf&auml;nger</h3><p style="font-weight:600">${inv.client_name}</p></div><div class="meta-box"><h3>Details</h3><p><b>Nummer:</b> ${inv.invoice_number}</p><p><b>Datum:</b> ${fmtDate(inv.date)}</p><p><b>F&auml;llig:</b> ${fmtDate(inv.due_date)}</p></div></div>
<table><thead><tr><th>Beschreibung</th><th style="text-align:right">Netto</th><th style="text-align:right">MwSt. (${inv.vat_rate}%)</th><th style="text-align:right">Brutto</th></tr></thead><tbody><tr><td>${inv.description||'Leistung'}</td><td style="text-align:right">&euro; ${Number(inv.net).toFixed(2).replace('.',',')}</td><td style="text-align:right">&euro; ${Number(inv.vat).toFixed(2).replace('.',',')}</td><td style="text-align:right"><b>&euro; ${Number(inv.gross).toFixed(2).replace('.',',')}</b></td></tr></tbody></table>
<div class="total-section"><div class="total-box"><div class="total-row"><span>Nettobetrag</span><span>&euro; ${Number(inv.net).toFixed(2).replace('.',',')}</span></div><div class="total-row"><span>MwSt. ${inv.vat_rate}%</span><span>&euro; ${Number(inv.vat).toFixed(2).replace('.',',')}</span></div><div class="total-row grand"><span>Gesamtbetrag</span><span>&euro; ${Number(inv.gross).toFixed(2).replace('.',',')}</span></div></div></div>
<div class="payment"><p style="font-weight:600;margin-bottom:5px">Zahlungshinweis</p><p>Bitte &uuml;berweisen Sie bis zum <b>${fmtDate(inv.due_date)}</b>.</p>${iban}<p style="margin-top:3px;font-size:11px;color:#888">Verwendungszweck: ${inv.invoice_number}</p></div>
<div class="footer">${sme?.firm_name||''} ${sme?.legal_form?'&middot; '+sme.legal_form:''} ${sme?.ust_id?'&middot; USt-IdNr.: '+sme.ust_id:''}</div>
</body></html>`;
}

function InvoiceModal({ inv, sme, onClose, onRefresh }) {
  const [tab,setTab]           = useState('preview');
  const [editForm,setEdit]     = useState({ client_name:inv.client_name, description:inv.description||'', notes:inv.notes||'' });
  const [sendEmail,setSendEmail] = useState('');
  const [sendType,setSendType] = useState('invoice');
  const [loading,setLoading]   = useState(false);
  const html = invoiceHtml(inv, sme);

  const downloadPdf = () => {
    const win = window.open('','_blank');
    if (!win) { alert('Pop-up blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
    win.document.write(html); win.document.close();
    setTimeout(() => win.print(), 600);
  };

  const markPaid = async () => {
    if (!confirm('Als bezahlt markieren?')) return;
    await api.sme.updateInvoice(inv.id, { status:'Bezahlt', paid_at:new Date().toISOString() });
    onRefresh(); onClose();
  };

  const doSend = async () => {
    if (!sendEmail) return;
    setLoading(true);
    try {
      if (sendType==='invoice') await api.sme.sendInvoice(inv.id, sendEmail);
      else await api.sme.sendReminder(inv.id, sendEmail);
      onRefresh(); onClose();
    } catch(e) { alert(e.message); setLoading(false); }
  };

  const saveEdit = async () => {
    setLoading(true);
    try { await api.sme.updateInvoice(inv.id, editForm); onRefresh(); onClose(); }
    catch(e) { alert(e.message); setLoading(false); }
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg" style={{maxWidth:860,maxHeight:'92vh',display:'flex',flexDirection:'column'}}>
        <div className="modal-hd" style={{flexShrink:0}}>
          <div>
            <div className="modal-title">{inv.invoice_number}</div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
              <span className="muted sm">{inv.client_name} · {fmt(inv.gross)}</span>
              <Badge status={inv.status}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-secondary btn-sm" onClick={downloadPdf} title="Als PDF drucken/speichern"><Download size={13}/>PDF</button>
            {inv.status!=='Bezahlt'&&inv.status!=='Storniert'&&(
              <button className="btn btn-primary btn-sm" onClick={markPaid}><CheckCircle size={13}/>Bezahlt</button>
            )}
            <button className="modal-close" onClick={onClose}><X size={18}/></button>
          </div>
        </div>
        <div style={{display:'flex',borderBottom:'1px solid var(--border2)',flexShrink:0}}>
          {[['preview','👁 Vorschau'],['send','✉️ Senden'],['edit','✏️ Bearbeiten']].map(([v,l])=>(
            <button key={v} className={`tab${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>
        <div style={{flex:1,overflow:'auto'}}>
          {tab==='preview' && (
            <iframe srcDoc={html} style={{width:'100%',minHeight:520,border:'none'}} title="Rechnungsvorschau"/>
          )}
          {tab==='send' && (
            <div className="modal-body">
              <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14,fontSize:13}}>
                <div className="bold">{inv.invoice_number} · {inv.client_name}</div>
                <div className="muted sm">{fmt(inv.gross)} · Fällig: {fmtDate(inv.due_date)}</div>
                {inv.reminder_count>0&&<div className="warn-c sm">Bereits {inv.reminder_count}× gemahnt</div>}
              </div>
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                {[['invoice','Rechnung'],['reminder','Mahnung']].map(([v,l])=>(
                  <button key={v} className={`btn ${sendType===v?'btn-primary':'btn-secondary'} btn-sm`} onClick={()=>setSendType(v)}>{l}</button>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">Empfänger E-Mail *</label>
                <input className="form-input" type="email" value={sendEmail} onChange={e=>setSendEmail(e.target.value)} placeholder="kunde@beispiel.de" autoFocus/>
              </div>
              <button className="btn btn-primary" onClick={doSend} disabled={!sendEmail||loading}>
                <Send size={13}/>{loading?'Sende…':sendType==='invoice'?'Rechnung senden':'Mahnung senden'}
              </button>
            </div>
          )}
          {tab==='edit' && (
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Empfänger / Kundenname</label><input className="form-input" value={editForm.client_name} onChange={e=>setEdit(f=>({...f,client_name:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Leistungsbeschreibung</label><textarea className="form-textarea" value={editForm.description} onChange={e=>setEdit(f=>({...f,description:e.target.value}))} rows={3}/></div>
              <div className="form-group"><label className="form-label">Interne Notiz</label><textarea className="form-textarea" value={editForm.notes} onChange={e=>setEdit(f=>({...f,notes:e.target.value}))} rows={2}/></div>
              <button className="btn btn-primary" onClick={saveEdit} disabled={loading}><CheckCircle size={13}/>{loading?'Speichert…':'Speichern'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Invoices() {
  const [invoices,setInvoices]   = useState([]);
  const [customers,setCustomers] = useState([]);
  const [sme,setSme]             = useState(null);
  const [filter,setFilter]       = useState('Alle');
  const [search,setSearch]       = useState('');
  const [showNew,setShowNew]     = useState(false);
  const [selected,setSelected]   = useState(null);
  const [form,setForm]           = useState({ customer_id:'',client_name:'',description:'',net:'',vat_rate:'19',due_date:'',notes:'' });
  const [formErr,setFormErr]     = useState('');

  const load = () => Promise.all([api.sme.invoices(),api.sme.customers(),api.sme.profile()]).then(([inv,c,p])=>{setInvoices(inv);setCustomers(c);setSme(p);});
  useEffect(()=>{load();},[]);

  const visible = invoices.filter(i=>{
    const q=search.toLowerCase();
    return (filter==='Alle'||i.status===filter)&&(!q||[i.invoice_number,i.client_name,i.description].some(v=>v?.toLowerCase().includes(q)));
  });

  const create = async () => {
    setFormErr('');
    try { await api.sme.createInvoice(form); setShowNew(false); setForm({customer_id:'',client_name:'',description:'',net:'',vat_rate:'19',due_date:'',notes:''}); load(); }
    catch(e) { setFormErr(e.message); }
  };

  const preview = form.net ? { net:parseFloat(form.net)||0, vat:(parseFloat(form.net)||0)*(parseInt(form.vat_rate)||19)/100 } : null;
  const statusBorder = { Bezahlt:'var(--ok)', Offen:'var(--primary)', Überfällig:'var(--danger)', Entwurf:'var(--border)', Storniert:'var(--ink4)' };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Rechnungen ({visible.length})</span>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <div style={{position:'relative'}}><Search size={13} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--ink3)'}}/>
              <input className="form-input" style={{paddingLeft:28,width:160}} placeholder="Suchen…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)}><Plus size={13}/>Neue Rechnung</button>
          </div>
        </div>

        <div style={{display:'flex',borderBottom:'1px solid var(--border2)',overflowX:'auto',padding:'0 18px'}}>
          {STATUSES.map(s=>(
            <button key={s} className={`tab${filter===s?' active':''}`} onClick={()=>setFilter(s)}>
              {s}{s!=='Alle'&&<span style={{marginLeft:4,background:'var(--border)',borderRadius:10,padding:'0 5px',fontSize:10}}>{invoices.filter(i=>i.status===s).length}</span>}
            </button>
          ))}
        </div>

        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nummer</th><th>Kunde</th><th>Leistung</th><th>Netto</th><th>Brutto</th><th>Fällig</th><th>Status</th><th>Aktionen</th></tr></thead>
            <tbody>
              {visible.map(i=>(
                <tr key={i.id} className="clickable" onClick={()=>setSelected(i)} style={{borderLeft:`3px solid ${statusBorder[i.status]||'transparent'}`}}>
                  <td><div style={{display:'flex',alignItems:'center',gap:7}}><FileText size={14} color="var(--ink3)"/><span className="bold sm">{i.invoice_number}</span></div></td>
                  <td className="sm">{i.client_name}</td>
                  <td className="muted sm" style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.description}</td>
                  <td className="sm">{fmt(i.net)}</td>
                  <td className="bold">{fmt(i.gross)}</td>
                  <td className="sm" style={{color:i.status==='Überfällig'?'var(--danger)':''}}>{fmtDate(i.due_date)}</td>
                  <td><Badge status={i.status}/></td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',gap:4}}>
                      <button title="Vorschau öffnen" className="btn btn-ghost btn-sm" onClick={()=>setSelected(i)}><Eye size={12}/></button>
                      {i.status==='Offen'&&<button title="Als bezahlt markieren" className="btn btn-ghost btn-sm" onClick={async()=>{if(confirm('Als bezahlt markieren?')){await api.sme.updateInvoice(i.id,{status:'Bezahlt',paid_at:new Date().toISOString()});load();}}}><CheckCircle size={12}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length===0&&<tr><td colSpan={8} style={{textAlign:'center',padding:32,color:'var(--ink3)',fontSize:13}}>Keine Rechnungen{filter!=='Alle'?` mit Status „${filter}"`:''}<button className="btn btn-primary btn-sm" style={{marginLeft:12}} onClick={()=>setShowNew(true)}><Plus size={12}/>Neue Rechnung</button></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected&&<InvoiceModal inv={selected} sme={sme} onClose={()=>setSelected(null)} onRefresh={load}/>}

      {showNew&&<Modal title="Neue Rechnung" onClose={()=>setShowNew(false)} footer={<><button className="btn btn-secondary" onClick={()=>setShowNew(false)}>Abbrechen</button><button className="btn btn-primary" onClick={create}><Plus size={13}/>Erstellen</button></>}>
        {formErr&&<div className="notice err">{formErr}</div>}
        <div className="form-group"><label className="form-label">Kunde auswählen</label>
          <select className="form-select" value={form.customer_id} onChange={e=>{const c=customers.find(x=>x.id===e.target.value);setForm(f=>({...f,customer_id:e.target.value,client_name:c?`${c.name}${c.company?' – '+c.company:''}`:f.client_name}));}}>
            <option value="">– Manuell eingeben –</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.company?' – '+c.company:''}</option>)}
          </select>
        </div>
        {!form.customer_id&&<div className="form-group"><label className="form-label">Kundenname *</label><input className="form-input" value={form.client_name} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))} placeholder="Muster GmbH"/></div>}
        <div className="form-group"><label className="form-label">Leistungsbeschreibung</label><input className="form-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="z.B. Beratungsleistung Mai 2025"/></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Netto (€) *</label><input className="form-input" type="number" step="0.01" value={form.net} onChange={e=>setForm(f=>({...f,net:e.target.value}))}/></div>
          <div className="form-group"><label className="form-label">MwSt. (%)</label><select className="form-select" value={form.vat_rate} onChange={e=>setForm(f=>({...f,vat_rate:e.target.value}))}>{['0','7','19'].map(r=><option key={r} value={r}>{r} %</option>)}</select></div>
        </div>
        {preview&&<div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',fontSize:13,marginBottom:12}}>Netto {fmt(preview.net)} + MwSt. {fmt(preview.vat)} = <strong>Brutto {fmt(preview.net+preview.vat)}</strong></div>}
        <div className="form-group"><label className="form-label">Zahlungsziel</label><input className="form-input" type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}/></div>
      </Modal>}
    </div>
  );
}
