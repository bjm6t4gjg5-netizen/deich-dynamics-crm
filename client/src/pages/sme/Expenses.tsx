import { useState, useEffect, useRef } from 'react';
import { Plus, Upload, Camera, Zap, Check, X, Eye } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api';
import { Badge, Modal, Empty } from '../../components/ui';
import { useLang } from '../../context/LangContext';
import { useApp } from '../../context/AppContext';

const CATS_DE = ['Büromaterial','Fahrtkosten','Telekommunikation','Marketing','Miete','Versicherung','Software','Personal','Sonstiges'];
const CATS_EN = ['Office supplies','Travel','Telecommunications','Marketing','Rent','Insurance','Software','Personnel','Other'];

function ReceiptUploadModal({ expense, onClose, onDone, apiKey, lang }) {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned]   = useState(null);
  const fileRef = useRef(null);

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const aiScan = async () => {
    if (!file || !apiKey) return;
    setScanning(true);
    try {
      // Convert image to base64 for Claude
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });

      const isImage = file.type.startsWith('image/');
      if (!isImage) { alert(lang==='en'?'AI scan only works with images (JPG, PNG, WebP).':'KI-Scan funktioniert nur mit Fotos (JPG, PNG, WebP).'); setScanning(false); return; }

      const prompt = lang==='en'
        ? 'This is a receipt/invoice photo. Extract: supplier name, description of goods/services, date (YYYY-MM-DD), net amount (without VAT), VAT rate (%), gross amount. Respond with JSON only: {"supplier":"","description":"","expense_date":"","net":"","vat_rate":"19","gross":""}'
        : 'Das ist ein Foto eines Kassenbelegs oder einer Rechnung. Extrahiere: Lieferantenname, Beschreibung der Waren/Dienstleistungen, Datum (YYYY-MM-DD), Nettobetrag (ohne MwSt.), Steuersatz (%), Bruttobetrag. Antworte nur mit JSON: {"supplier":"","description":"","expense_date":"","net":"","vat_rate":"19","gross":""}';

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } },
              { type: 'text', text: prompt },
            ]
          }]
        }),
      });
      const d = await res.json();
      const text = d.content?.[0]?.text || '{}';
      const json = JSON.parse(text.replace(/```json\n?|```/g, '').trim());
      setScanned(json);
    } catch(e) {
      alert((lang==='en'?'AI scan failed: ':'KI-Scan fehlgeschlagen: ') + e.message);
    }
    setScanning(false);
  };

  const upload = async (applyScanned = false) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('receipt', file);
      const token = localStorage.getItem('dd_token') || localStorage.getItem('k_token');
      const r = await fetch(`/api/sme/expenses/${expense.id}/receipt`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      onDone(applyScanned ? scanned : null);
    } catch(e) { alert(e.message); }
    finally { setUploading(false); }
  };

  const isImg = file?.type.startsWith('image/');

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <span className="modal-title">{lang==='en'?'Upload receipt':'Beleg hochladen'}</span>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{display:'none'}} onChange={pickFile}/>

          {!file ? (
            <div style={{border:'2px dashed var(--border)',borderRadius:'var(--r-lg)',padding:32,textAlign:'center',cursor:'pointer',background:'var(--bg)'}}
              onClick={()=>fileRef.current?.click()}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){setFile(f);const r=new FileReader();r.onload=ev=>setPreview(ev.target.result);r.readAsDataURL(f);}}}>
              <Camera size={32} color="var(--ink3)" style={{marginBottom:10}}/>
              <div className="bold sm" style={{marginBottom:4}}>{lang==='en'?'Click or drag photo/PDF here':'Foto oder PDF hier klicken oder hineinziehen'}</div>
              <div className="muted sm">JPG, PNG, WebP, PDF · max. 8 MB</div>
              <button className="btn btn-primary btn-sm" style={{marginTop:12}}>
                <Upload size={13}/>{lang==='en'?'Choose file':'Datei wählen'}
              </button>
            </div>
          ) : (
            <div>
              {/* Preview */}
              {preview && isImg && (
                <div style={{textAlign:'center',marginBottom:14}}>
                  <img src={preview} alt="Receipt" style={{maxHeight:220,maxWidth:'100%',borderRadius:'var(--r)',border:'1px solid var(--border)',objectFit:'contain'}}/>
                </div>
              )}
              {!isImg && (
                <div style={{background:'var(--bg)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14,fontSize:13,textAlign:'center'}}>
                  📄 {file.name} ({(file.size/1024).toFixed(0)} KB)
                </div>
              )}

              {/* AI Scan button */}
              {isImg && apiKey && !scanned && (
                <button className="btn btn-primary" style={{width:'100%',justifyContent:'center',marginBottom:12}} onClick={aiScan} disabled={scanning}>
                  <Zap size={14}/>{scanning ? (lang==='en'?'Scanning…':'KI analysiert…') : (lang==='en'?'🤖 AI Scan — auto-fill fields':'🤖 KI-Scan — Felder automatisch ausfüllen')}
                </button>
              )}

              {/* AI not active hint */}
              {isImg && !apiKey && (
                <div style={{background:'var(--warn-bg)',border:'1px solid var(--warn)',borderRadius:'var(--r)',padding:'9px 12px',fontSize:12,color:'var(--warn)',marginBottom:12}}>
                  💡 {lang==='en'?'AI not active — fields will need to be filled manually after upload.':'KI nicht aktiv — Felder nach dem Upload bitte manuell ausfüllen.'}
                </div>
              )}

              {/* Scanned result */}
              {scanned && (
                <div style={{background:'var(--ok-bg)',border:'1px solid var(--ok)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:12,fontSize:13}}>
                  <div className="bold ok-c" style={{marginBottom:8}}>✓ {lang==='en'?'AI extracted:':'KI hat extrahiert:'}</div>
                  {[
                    [lang==='en'?'Supplier':'Lieferant', scanned.supplier],
                    [lang==='en'?'Description':'Beschreibung', scanned.description],
                    [lang==='en'?'Date':'Datum', scanned.expense_date],
                    ['Netto', scanned.net ? `€ ${scanned.net}` : '–'],
                    ['Brutto', scanned.gross ? `€ ${scanned.gross}` : '–'],
                  ].map(([l,v])=>v&&<div key={l} style={{display:'flex',gap:8}}><span className="muted sm" style={{width:100}}>{l}</span><span className="sm bold">{v}</span></div>)}
                </div>
              )}

              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={()=>{setFile(null);setPreview(null);setScanned(null);}}>
                  {lang==='en'?'Different file':'Andere Datei'}
                </button>
                <button className="btn btn-primary" style={{flex:1,justifyContent:'center'}} onClick={()=>upload(!!scanned)} disabled={uploading}>
                  <Check size={14}/>{uploading?(lang==='en'?'Uploading…':'Hochladen…'):(scanned?(lang==='en'?'Upload & apply AI data':'Hochladen & KI-Daten übernehmen'):(lang==='en'?'Upload receipt':'Beleg hochladen'))}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Expenses() {
  const { t, lang } = useLang();
  const { apiKey }  = useApp();
  const CATS = lang === 'en' ? CATS_EN : CATS_DE;

  const [expenses,setExpenses] = useState([]);
  const [showNew,setShowNew]   = useState(false);
  const [uploadFor,setUploadFor] = useState(null); // expense to upload receipt for
  const [form,setForm]         = useState({ supplier:'', description:'', category:'', net:'', vat_rate:'19', expense_date:'', has_receipt:false });
  const [err,setErr]           = useState('');

  const load = () => api.sme.expenses().then(setExpenses);
  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({ supplier:'', description:'', category:'', net:'', vat_rate:'19', expense_date:'', has_receipt:false });

  const create = async () => {
    setErr('');
    try {
      await api.sme.createExpense({ ...form, category: form.category || CATS[0] });
      setShowNew(false); resetForm(); load();
    } catch(e) { setErr(e.message); }
  };

  // After receipt upload with AI data — update expense fields
  const onReceiptDone = async (scannedData) => {
    if (scannedData && uploadFor) {
      try {
        await api.sme.updateExpense(uploadFor.id, {
          status: uploadFor.status,
          has_receipt: 1,
          supplier:  scannedData.supplier     || uploadFor.supplier,
          description: scannedData.description || uploadFor.description,
          expense_date: scannedData.expense_date || uploadFor.expense_date,
        });
      } catch {}
    }
    setUploadFor(null);
    load();
  };

  const total   = expenses.reduce((s,e) => s + e.gross, 0);
  const missing = expenses.filter(e => !e.has_receipt).length;

  const netPreview  = parseFloat(form.net) || 0;
  const vatPreview  = netPreview * (parseInt(form.vat_rate) || 19) / 100;
  const grossPreview = netPreview + vatPreview;

  return (
    <div>
      {missing > 0 && (
        <div className="notice" style={{cursor:'default'}}>
          ⚠️ <strong>{missing} {lang==='en'?'receipt(s)':'Beleg(e)'}</strong> {t('missing_receipts')} — {lang==='en'?'please upload for GoBD-compliant accounting':'für GoBD-konforme Buchführung bitte nachreichen'}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">{t('expenses_title')} ({expenses.length}) · {fmt(total)}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={13}/>{t('new_expense')}</button>
        </div>

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('supplier')}</th>
                <th>{t('description')}</th>
                <th>{t('category')}</th>
                <th>{t('date')}</th>
                <th>{t('net')}</th>
                <th>{t('gross')}</th>
                <th>{t('receipt')}</th>
                <th>{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td className="bold sm">{e.supplier}</td>
                  <td className="muted sm">{e.description}</td>
                  <td><span className="badge badge-neu">{e.category}</span></td>
                  <td className="muted sm">{fmtDate(e.expense_date)}</td>
                  <td>{fmt(e.net)}</td>
                  <td className="bold">{fmt(e.gross)}</td>
                  <td>
                    {e.has_receipt ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span className="ok-c sm">✓ {t('receipt_present')}</span>
                        {e.receipt_url && (
                          <a href={e.receipt_url} target="_blank" rel="noreferrer">
                            <Eye size={12} color="var(--primary)"/>
                          </a>
                        )}
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)',gap:4}} onClick={() => setUploadFor(e)}>
                        <Upload size={12}/>{t('receipt_missing')}
                      </button>
                    )}
                  </td>
                  <td><Badge status={e.status}/></td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={8}>
                  <Empty icon={<Upload size={28}/>} text={lang==='en'?'No receipts yet':'Noch keine Belege'}
                    action={<button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={13}/>{t('new_expense')}</button>}/>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New expense modal */}
      {showNew && (
        <Modal title={t('new_expense')} onClose={() => { setShowNew(false); resetForm(); }} footer={<>
          <button className="btn btn-secondary" onClick={() => { setShowNew(false); resetForm(); }}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={create}><Plus size={13}/>{t('save')}</button>
        </>}>
          {err && <div className="notice err">{err}</div>}

          {/* AI scan hint */}
          {apiKey ? (
            <div style={{background:'var(--ok-bg)',border:'1px solid var(--ok)',borderRadius:'var(--r)',padding:'9px 12px',fontSize:12,color:'var(--ok)',marginBottom:14,lineHeight:1.6}}>
              <strong>🤖 {t('ai_scan')}:</strong> {t('ai_scan_hint')} {lang==='en'?'Upload a photo after saving.':'Laden Sie nach dem Speichern ein Foto hoch.'}
            </div>
          ) : (
            <div style={{background:'var(--warn-bg)',border:'1px solid var(--warn)',borderRadius:'var(--r)',padding:'9px 12px',fontSize:12,color:'var(--warn)',marginBottom:14}}>
              💡 {t('ai_not_active')}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('supplier')} *</label>
              <input className="form-input" value={form.supplier} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))} autoFocus/>
            </div>
            <div className="form-group">
              <label className="form-label">{t('category')}</label>
              <select className="form-select" value={form.category||CATS[0]} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {CATS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('description')}</label>
            <input className="form-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('net')} (€) *</label>
              <input className="form-input" type="number" step="0.01" value={form.net} onChange={e=>setForm(f=>({...f,net:e.target.value}))}/>
            </div>
            <div className="form-group">
              <label className="form-label">{t('vat')} (%)</label>
              <select className="form-select" value={form.vat_rate} onChange={e=>setForm(f=>({...f,vat_rate:e.target.value}))}>
                {['0','7','19'].map(r=><option key={r} value={r}>{r} %</option>)}
              </select>
            </div>
          </div>
          {netPreview > 0 && (
            <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'9px 12px',fontSize:13,marginBottom:12}}>
              {fmt(netPreview)} + {fmt(vatPreview)} = <strong>{fmt(grossPreview)}</strong>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('date')}</label>
              <input className="form-input" type="date" value={form.expense_date} onChange={e=>setForm(f=>({...f,expense_date:e.target.value}))}/>
            </div>
            <div className="form-group" style={{display:'flex',alignItems:'flex-end',paddingBottom:4}}>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                <input type="checkbox" checked={form.has_receipt} onChange={e=>setForm(f=>({...f,has_receipt:e.target.checked}))} style={{width:16,height:16}}/>
                {lang==='en'?'Receipt already available (upload later)':'Beleg vorhanden (Foto später hochladen)'}
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Receipt upload modal */}
      {uploadFor && (
        <ReceiptUploadModal
          expense={uploadFor}
          apiKey={apiKey}
          lang={lang}
          onClose={() => setUploadFor(null)}
          onDone={onReceiptDone}
        />
      )}
    </div>
  );
}
