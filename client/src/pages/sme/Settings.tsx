import { useState } from 'react';
import { Save, CheckCircle, Eye, EyeOff, Link, Download } from 'lucide-react';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { MonthExportButton } from '../../components/MonthExport';

export default function Settings() {
  const { apiKey, setApiKey, user, profile, refreshProfile } = useApp();
  const [key, setKey]           = useState(apiKey || '');
  const [showKey, setShowKey]   = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [stbCode, setStbCode]   = useState('');
  const [stbMsg, setStbMsg]     = useState('');

  const [form, setForm] = useState({
    firm_name:    profile?.firm_name || '',
    legal_form:   profile?.legal_form || 'GmbH',
    address:      profile?.address || '',
    city:         profile?.city || '',
    plz:          profile?.plz || '',
    phone:        profile?.phone || '',
    email:        profile?.email || '',
    ust_id:       profile?.ust_id || '',
    steuernummer: profile?.steuernummer || '',
    iban:         profile?.iban || '',
    bic:          profile?.bic || '',
  });
  const [formSaved, setFormSaved] = useState(false);

  const saveKey = () => {
    setApiKey(key.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
  };

  const saveForm = async () => {
    try {
      if (user.role === 'steuerberater') await api.stb.updateProfile(form);
      else await api.sme.updateProfile(form);
      await refreshProfile();
      setFormSaved(true);
      setTimeout(() => setFormSaved(false), 2500);
    } catch(e) { alert(e.message); }
  };

  const connectStb = async () => {
    if (!stbCode.trim()) return;
    try {
      const r = await api.auth.connectStb(stbCode.trim());
      setStbMsg(`✓ Verbunden mit: ${r.stb_firm}`);
      await refreshProfile();
    } catch(e) { setStbMsg(`Fehler: ${e.message}`); }
  };

  const restartTour = () => {
    try { localStorage.removeItem('dd_tour_v2'); } catch { /* ignore */ }
    window.location.reload();
  };

  const isSme = user?.role === 'unternehmen';

  return (
    <div style={{maxWidth:560}}>

      {/* Month-end export — only for Unternehmen */}
      {isSme && (
        <div className="card mb-3">
          <div className="card-header"><span className="card-title">📤 Monatsabschluss an Steuerberater</span></div>
          <div className="card-body">
            <p className="sm muted" style={{marginBottom:12,lineHeight:1.7}}>
              Erstellen Sie am Monatsende einen geordneten ZIP-Export mit allen Rechnungen, Belegen und Kundendaten — inkl. CSV und HTML-Zusammenfassung.
              Ihr Steuerberater erhält damit alles was er für die Buchführung benötigt.
            </p>
            <MonthExportButton/>
          </div>
        </div>
      )}

      {/* API Key — info only, admin sets it */}
      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title">KI-Assistent (Claude)</span>
          {apiKey ? <span className="badge badge-ok">✓ Aktiv</span> : <span className="badge badge-neu">Inaktiv</span>}
        </div>
        <div className="card-body">
          {isSme ? (
            <div style={{background:'var(--info-bg)',border:'1px solid var(--info)',borderRadius:'var(--r)',padding:'10px 14px',fontSize:13,color:'var(--info)'}}>
              Der KI-Assistent wird von Ihrem Administrator oder Steuerberater aktiviert. Falls noch nicht aktiv, wenden Sie sich an Ihren Deich-Dynamics-Ansprechpartner.
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Claude API-Key</label>
                <div style={{position:'relative'}}>
                  <input className="form-input" type={showKey?'text':'password'} value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-ant-api03-…" style={{paddingRight:40}}/>
                  <button onClick={()=>setShowKey(s=>!s)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ink3)',display:'flex'}}>
                    {showKey?<EyeOff size={15}/>:<Eye size={15}/>}
                  </button>
                </div>
              </div>
              <button className="btn btn-primary" onClick={saveKey}>
                {keySaved?<><CheckCircle size={14}/>Gespeichert</>:<><Save size={14}/>Speichern</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Company data */}
      {(isSme || user?.role === 'steuerberater') && (
        <div className="card mb-3">
          <div className="card-header"><span className="card-title">Unternehmensdaten</span></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{user.role==='steuerberater'?'Kanzleiname':'Firmenname'} *</label>
                <input className="form-input" value={form.firm_name} onChange={e=>setForm(f=>({...f,firm_name:e.target.value}))}/>
              </div>
              {isSme && <div className="form-group">
                <label className="form-label">Rechtsform</label>
                <select className="form-select" value={form.legal_form} onChange={e=>setForm(f=>({...f,legal_form:e.target.value}))}>
                  {['GmbH','UG','KG','GbR','Einzelunternehmen','AG','GmbH & Co. KG'].map(l=><option key={l}>{l}</option>)}
                </select>
              </div>}
            </div>
            <div className="form-group">
              <label className="form-label">Adresse</label>
              <input className="form-input" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">PLZ</label><input className="form-input" value={form.plz} onChange={e=>setForm(f=>({...f,plz:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Stadt</label><input className="form-input" value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Telefon</label><input className="form-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">E-Mail</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
            </div>
            {isSme && <>
              <div className="form-row">
                <div className="form-group"><label className="form-label">USt-IdNr.</label><input className="form-input" value={form.ust_id} onChange={e=>setForm(f=>({...f,ust_id:e.target.value}))} placeholder="DE 123 456 789"/></div>
                <div className="form-group"><label className="form-label">Steuernummer</label><input className="form-input" value={form.steuernummer} onChange={e=>setForm(f=>({...f,steuernummer:e.target.value}))}/></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">IBAN</label><input className="form-input" value={form.iban} onChange={e=>setForm(f=>({...f,iban:e.target.value}))} placeholder="DE89 3704 0044…"/></div>
                <div className="form-group"><label className="form-label">BIC</label><input className="form-input" value={form.bic} onChange={e=>setForm(f=>({...f,bic:e.target.value}))}/></div>
              </div>
            </>}
            <button className="btn btn-primary" onClick={saveForm}>
              {formSaved?<><CheckCircle size={14}/>Gespeichert</>:<><Save size={14}/>Speichern</>}
            </button>
          </div>
        </div>
      )}

      {/* Connect StB */}
      {isSme && (
        <div className="card mb-3">
          <div className="card-header">
            <span className="card-title">Mein Steuerberater</span>
            {profile?.stb_firm && <span className="badge badge-ok">{profile.stb_firm}</span>}
          </div>
          <div className="card-body">
            {profile?.stb_firm
              ? <p className="sm muted">Verbunden mit <strong>{profile.stb_firm}</strong>.</p>
              : <p className="sm muted">Noch kein Steuerberater verbunden:</p>
            }
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <input className="form-input" value={stbCode} onChange={e=>setStbCode(e.target.value)} placeholder="Steuerberater-ID"/>
              <button className="btn btn-secondary" onClick={connectStb}><Link size={13}/>Verbinden</button>
            </div>
            {stbMsg && <p style={{fontSize:12,marginTop:8,color:stbMsg.startsWith('✓')?'var(--ok)':'var(--danger)'}}>{stbMsg}</p>}
          </div>
        </div>
      )}

      {/* Help & Tour */}
      <div className="card mb-3">
        <div className="card-header"><span className="card-title">Hilfe & Tour</span></div>
        <div className="card-body">
          <button className="btn btn-secondary" onClick={restartTour}>❓ Einführungstour neu starten</button>
          <p className="form-hint" style={{marginTop:8}}>Die interaktive Tour führt Sie durch alle wichtigen Funktionen.</p>
        </div>
      </div>

      {/* Security */}
      <div className="card">
        <div className="card-header"><span className="card-title">Sicherheit & Compliance</span></div>
        <div className="card-body">
          {[
            ['✓','Passwörter bcrypt-gehasht (cost=12) — Industriestandard'],
            ['✓','JWT-Authentifizierung — 7 Tage gültig'],
            ['✓','DSGVO-konform — Hosting in Deutschland'],
            ['✓','GoBD-konforme Buchführung'],
            ['✓','ZUGFeRD 2.0 / XRechnung bereit (B2G Pflicht)'],
            ['✓','SEPA XML-Export (pain.001)'],
          ].map(([ic,t])=>(
            <div key={t} style={{padding:'7px 0',borderBottom:'1px solid var(--border2)',fontSize:13,color:'var(--ok)'}}>
              <span style={{marginRight:8}}>{ic}</span>{t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
