import { useState } from 'react';
import { Save, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';

export default function StbSettings() {
  const { profile, refreshProfile } = useApp();
  const [tab,setTab] = useState('mail');
  const [saved,setSaved] = useState(false);
  const [showPass,setShowPass] = useState(false);

  const [mail,setMail] = useState({
    mail_provider: profile?.mail_provider||'smtp',
    mail_host:     profile?.mail_host||'',
    mail_port:     profile?.mail_port||587,
    mail_user:     profile?.mail_user||'',
    mail_pass:     '',
    mail_from:     profile?.mail_from||'',
    sendgrid_key:  '',
    resend_key:    '',
  });

  const save = async () => {
    try {
      await api.stb.updateProfile(mail);
      await refreshProfile();
      setSaved(true); setTimeout(()=>setSaved(false),2500);
    } catch(e) { alert(e.message); }
  };

  return (
    <div style={{maxWidth:580}}>
      <div className="tabs" style={{marginBottom:18}}>
        {[['mail','E-Mail-Server'],['datev','DATEV'],['elster','ELSTER'],['sepa','SEPA']].map(([v,l])=>(
          <button key={v} className={`tab${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
        ))}
      </div>

      {tab==='mail' && (
        <div className="card">
          <div className="card-header"><span className="card-title">E-Mail-Konfiguration</span></div>
          <div className="card-body">
            <div className="form-group"><label className="form-label">E-Mail-Provider</label>
              <select className="form-select" value={mail.mail_provider} onChange={e=>setMail(m=>({...m,mail_provider:e.target.value}))}>
                <option value="smtp">SMTP (eigener Server)</option>
                <option value="sendgrid">SendGrid</option>
                <option value="resend">Resend</option>
              </select>
            </div>

            {mail.mail_provider==='smtp' && <>
              <div className="form-row">
                <div className="form-group"><label className="form-label">SMTP Host</label><input className="form-input" value={mail.mail_host} onChange={e=>setMail(m=>({...m,mail_host:e.target.value}))} placeholder="smtp.gmail.com"/></div>
                <div className="form-group"><label className="form-label">Port</label><input className="form-input" type="number" value={mail.mail_port} onChange={e=>setMail(m=>({...m,mail_port:e.target.value}))}/></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Benutzername</label><input className="form-input" value={mail.mail_user} onChange={e=>setMail(m=>({...m,mail_user:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Passwort</label>
                  <div style={{position:'relative'}}>
                    <input className="form-input" type={showPass?'text':'password'} value={mail.mail_pass} onChange={e=>setMail(m=>({...m,mail_pass:e.target.value}))} placeholder="Leer = unverändert" style={{paddingRight:36}}/>
                    <button onClick={()=>setShowPass(s=>!s)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ink3)',display:'flex'}}>
                      {showPass?<EyeOff size={14}/>:<Eye size={14}/>}
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Absenderadresse (From)</label><input className="form-input" type="email" value={mail.mail_from} onChange={e=>setMail(m=>({...m,mail_from:e.target.value}))} placeholder="buchhaltung@kanzlei.de"/></div>
            </>}

            {mail.mail_provider==='sendgrid' && (
              <div className="form-group"><label className="form-label">SendGrid API-Key</label><input className="form-input" type="password" value={mail.sendgrid_key} onChange={e=>setMail(m=>({...m,sendgrid_key:e.target.value}))} placeholder="SG.xxxx"/></div>
            )}
            {mail.mail_provider==='resend' && (
              <div className="form-group"><label className="form-label">Resend API-Key</label><input className="form-input" type="password" value={mail.resend_key} onChange={e=>setMail(m=>({...m,resend_key:e.target.value}))} placeholder="re_xxxx"/></div>
            )}

            <button className="btn btn-primary" onClick={save}>
              {saved?<><CheckCircle size={14}/>Gespeichert</>:<><Save size={14}/>Speichern</>}
            </button>
          </div>
        </div>
      )}

      {tab==='datev' && (
        <div className="card"><div className="card-body">
          <div className="ok-box" style={{marginBottom:14}}>DATEV-Export ist verfügbar. Buchungsdaten können als DATEV-konformes CSV exportiert werden.</div>
          <div style={{padding:'10px 0',borderBottom:'1px solid var(--border2)',fontSize:13}}>
            <div className="bold">DATEV Buchungsstapel Export</div>
            <div className="muted sm">Exportiert alle Buchungen als DATEV CSV (Format 510)</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:8}}>Export herunterladen</button>
          </div>
          <div style={{padding:'10px 0',borderBottom:'1px solid var(--border2)',fontSize:13}}>
            <div className="bold">ZUGFeRD 2.0 / XRechnung</div>
            <div className="muted sm">Rechnungen als maschinenlesbare XML-Datei (Pflicht für B2G ab 2025)</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:8}}>In Vorbereitung</button>
          </div>
        </div></div>
      )}

      {tab==='elster' && (
        <div className="card"><div className="card-body">
          <div style={{background:'var(--info-bg)',border:'1px solid var(--info)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:16,fontSize:13,color:'var(--info)'}}>
            <strong>ELSTER-Integration</strong> — Voranmeldungen und Jahreserklärungen direkt aus der App
          </div>
          {[
            ['Umsatzsteuer-Voranmeldung (UStVA)','Monatlich oder quartalsweise, Frist: 10. des Folgemonats','In Vorbereitung'],
            ['Körperschaftsteuer-Erklärung','Jährliche Steuererklärung für GmbH/AG','Geplant Q3 2025'],
            ['Lohnsteuer-Anmeldung','Monatliche Abführung der Lohnsteuer','Geplant Q4 2025'],
          ].map(([t,d,s])=>(
            <div key={t} style={{padding:'12px 0',borderBottom:'1px solid var(--border2)'}}>
              <div className="bold sm">{t}</div>
              <div className="muted sm" style={{marginBottom:6}}>{d}</div>
              <span className="badge badge-info">{s}</span>
            </div>
          ))}
          <div style={{marginTop:16,fontSize:12,color:'var(--ink3)'}}>Für sofortige ELSTER-Nutzung empfehlen wir die Übergabe an Ihren Steuerberater über die integrierte DATEV-Schnittstelle.</div>
        </div></div>
      )}

      {tab==='sepa' && (
        <div className="card"><div className="card-body">
          <div style={{background:'var(--info-bg)',border:'1px solid var(--info)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:16,fontSize:13,color:'var(--info)'}}>
            <strong>SEPA-Zahlungsverkehr</strong> — Lastschriften und Überweisungen
          </div>
          {[
            ['SEPA-Lastschrift (CORE)','Einzugsermächtigung für Mandanten, automatischer Einzug offener Rechnungen','In Vorbereitung'],
            ['SEPA-Überweisung (SCT)','Auszahlungen an Lieferanten direkt aus der App','Geplant Q3 2025'],
            ['SEPA XML-Export','pain.001 / pain.008 Dateien für den Bankupload','Verfügbar'],
          ].map(([t,d,s])=>(
            <div key={t} style={{padding:'12px 0',borderBottom:'1px solid var(--border2)'}}>
              <div className="bold sm">{t}</div>
              <div className="muted sm" style={{marginBottom:6}}>{d}</div>
              <span className={`badge ${s==='Verfügbar'?'badge-ok':'badge-info'}`}>{s}</span>
            </div>
          ))}
        </div></div>
      )}
    </div>
  );
}
