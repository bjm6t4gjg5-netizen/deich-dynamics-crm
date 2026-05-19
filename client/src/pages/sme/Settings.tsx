import { useEffect, useState } from 'react';
import { Save, CheckCircle, Eye, EyeOff, Link, Mail, AlertTriangle, Check, Send, Bell, Globe, LifeBuoy, Plus, X } from 'lucide-react';
import { api, getLocaleSettings, setLocaleSettings, fmt } from '../../api';
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

  // Locale (display format for numbers, currency, dates) — saved in localStorage only.
  const [locale, setLocale] = useState(() => getLocaleSettings());
  const saveLocale = (next: typeof locale) => {
    setLocale(next);
    setLocaleSettings(next);
    // Hard refresh isn't necessary but components reading on every render will pick it up.
    // We dispatch a custom event so listeners can re-render if they want.
    try { window.dispatchEvent(new CustomEvent('dd-locale-changed', { detail: next })); } catch { /* ignore */ }
  };

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
  const [activeTab, setActiveTab] = useState<'company' | 'advisor' | 'mail' | 'ai' | 'dunning' | 'backup' | 'support' | 'help'>('company');

  return (
    <div style={{maxWidth:780}}>
      {/* Tab navigation */}
      <div className="tabs" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        {([
          ['company',  '🏢 Unternehmen'],
          ['advisor',  '👔 Steuerberater'],
          ['mail',     '✉️ Mail'],
          ['ai',       '🤖 KI-Assistent'],
          ['dunning',  '⚠️ Mahnstufen'],
          ['backup',   '💾 Backup'],
          ['support',  '🎫 Support'],
          ['help',     '❓ Hilfe & Sicherheit'],
        ] as const).filter(([v]) => isSme || ['company', 'advisor', 'help'].includes(v)).map(([v, l]) => (
          <button
            key={v}
            className={`tab${activeTab === v ? ' active' : ''}`}
            onClick={() => setActiveTab(v as any)}
            title={l}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Month-end export — only for Unternehmen */}
      {activeTab === 'advisor' && isSme && (
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
      {activeTab === 'ai' && (<div className="card mb-3">
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
      </div>)}

      {/* Company data */}
      {activeTab === 'company' && (isSme || user?.role === 'steuerberater') && (
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

      {/* Locale / Anzeige-Format */}
      {activeTab === 'company' && (<div className="card mb-3">
        <div className="card-header">
          <span className="card-title"><Globe size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Anzeige-Format</span>
        </div>
        <div className="card-body">
          <p className="muted sm" style={{ marginBottom: 14, lineHeight: 1.6 }}>
            Wie sollen Beträge, Datum und Währung angezeigt werden? Beispiel mit aktueller Einstellung: <strong>{fmt(1234567.89)}</strong>.
          </p>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Land / Format</label>
              <select className="form-select" value={locale.locale} onChange={(e) => saveLocale({ ...locale, locale: e.target.value })}>
                <option value="de-DE">🇩🇪 Deutschland (1.234,56 €)</option>
                <option value="de-AT">🇦🇹 Österreich (1.234,56 €)</option>
                <option value="de-CH">🇨🇭 Schweiz (1’234.56 CHF)</option>
                <option value="en-US">🇺🇸 USA (1,234.56 $)</option>
                <option value="en-GB">🇬🇧 Großbritannien (1,234.56 £)</option>
                <option value="fr-FR">🇫🇷 Frankreich (1 234,56 €)</option>
                <option value="es-ES">🇪🇸 Spanien (1.234,56 €)</option>
                <option value="nl-NL">🇳🇱 Niederlande (1.234,56 €)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Währung</label>
              <select className="form-select" value={locale.currency} onChange={(e) => saveLocale({ ...locale, currency: e.target.value })}>
                <option value="EUR">EUR — Euro</option>
                <option value="CHF">CHF — Schweizer Franken</option>
                <option value="USD">USD — US-Dollar</option>
                <option value="GBP">GBP — Britisches Pfund</option>
                <option value="DKK">DKK — Dänische Krone</option>
                <option value="SEK">SEK — Schwedische Krone</option>
              </select>
            </div>
          </div>
          <p className="form-hint">Die Einstellung gilt für die gesamte App — alle Beträge, Margen und Daten werden in diesem Format angezeigt.</p>
        </div>
      </div>)}

      {/* Connect StB */}
      {activeTab === 'advisor' && isSme && (
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

      {/* Mail postbox */}
      {activeTab === 'mail' && isSme && <MailSettingsCard/>}

      {/* StB push */}
      {activeTab === 'advisor' && isSme && profile?.stb_firm && <StbPushCard stbFirm={profile.stb_firm}/>}

      {/* Mahnstufen */}
      {activeTab === 'dunning' && isSme && <DunningSettingsCard/>}

      {/* Datensicherung */}
      {activeTab === 'backup' && isSme && <BackupCard/>}

      {/* Help & Tour */}
      {activeTab === 'help' && (
        <>
          <div className="card mb-3">
            <div className="card-header"><span className="card-title">Hilfe & Tour</span></div>
            <div className="card-body">
              <button className="btn btn-secondary" onClick={restartTour}>❓ Einführungstour neu starten</button>
              <p className="form-hint" style={{marginTop:8}}>Die interaktive Tour führt Sie durch alle wichtigen Funktionen.</p>
            </div>
          </div>
          {isSme && (
            <div className="card mb-3">
              <div className="card-header"><span className="card-title">🧪 Demo-Daten</span></div>
              <div className="card-body">
                <p className="muted sm" style={{ marginBottom: 12, lineHeight: 1.6 }}>
                  Setzt alle <strong>Geschäftsdaten</strong> (Kunden, Rechnungen, Belege, Inventar, Deals, Angebote, Abos, Monatsabschlüsse) zurück und spielt einen frischen Satz Testdaten ein. <strong>Achtung:</strong> Diese Aktion ist nicht rückgängig zu machen — vorher ein <em>.meind</em>-Backup ziehen, falls du nichts verlieren willst.
                </p>
                <button
                  className="btn btn-secondary"
                  style={{ color: 'var(--danger)' }}
                  onClick={async () => {
                    if (!confirm('Alle Geschäftsdaten (Kunden, Rechnungen, Belege, Inventar, Deals, Abos, Monatsabschlüsse) jetzt LÖSCHEN und durch frische Demo-Daten ersetzen?\n\nDein Account, Pipeline-Spalten, Mahnstufen und Mail-Einstellungen bleiben erhalten.')) return;
                    if (prompt('Tippe RESET zur Bestätigung:') !== 'RESET') { alert('Abgebrochen.'); return; }
                    try {
                      const r = await api.post<{ ok: boolean; wiped: number; seeded: any }>('/sme/reset-demo-data', { confirm: 'RESET' });
                      alert(`✓ ${r.wiped} alte Datensätze gelöscht. Frisch eingespielt:\n${Object.entries(r.seeded).map(([k, v]) => `  ${v} ${k}`).join('\n')}\n\nDie Seite wird neu geladen.`);
                      window.location.reload();
                    } catch (e: any) { alert(e.message); }
                  }}
                  title="Alle Test-/Geschäftsdaten löschen und durch frische Demo-Daten ersetzen"
                >
                  🗑️ Alle Daten zurücksetzen & Demo neu einspielen
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Support Tickets */}
      {activeTab === 'support' && <SupportTicketsCard />}


      {/* Security */}
      {activeTab === 'help' && (<div className="card">
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
      </div>)}
    </div>
  );
}

// ── Datensicherung ──────────────────────────────────────────────────────
const TABLE_LABELS: Record<string, string> = {
  unternehmen: 'Unternehmen',
  customers: 'Kunden', customer_groups: 'Branchen-Gruppen', customer_files: 'Kunden-Dateien',
  invoices: 'Rechnungen', expenses: 'Belege',
  inventory_items: 'Inventar-Artikel', inventory_movements: 'Bestandsbewegungen',
  deals: 'Pipeline-Deals', pipeline_stages: 'Pipeline-Spalten', campaigns: 'Marketing-Kampagnen',
  quotes: 'Angebote', recurring_invoices: 'Abos', dunning_levels: 'Mahnstufen',
  activities: 'Aktivitäts-Log', client_notes: 'Kunden-Notizen', email_log: 'Mail-Log',
  monthly_closings: 'Monatsabschlüsse',
};

function BackupCard() {
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const doExport = async () => {
    setBusy('export'); setResult(null);
    try {
      const token = localStorage.getItem('dd_token');
      const r = await fetch('/api/sme/backup/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('Export fehlgeschlagen');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `mein-dynamics-backup-${new Date().toISOString().slice(0,10)}.meind`; a.click();
      URL.revokeObjectURL(url);
      setResult('✓ Backup erfolgreich heruntergeladen');
    } catch (e: any) { setResult('⚠️ ' + e.message); }
    finally { setBusy(null); }
  };

  const startRestore = async (file: File) => {
    setRestoreFile(file); setPreview(null); setPreviewing(true); setResult(null);
    try {
      const token = localStorage.getItem('dd_token');
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/sme/backup/restore/preview', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Vorschau fehlgeschlagen');
      setPreview(d);
    } catch (e: any) {
      setResult('⚠️ ' + e.message);
      setRestoreFile(null);
    } finally { setPreviewing(false); }
  };

  const confirmRestore = async () => {
    if (!restoreFile) return;
    setBusy('restore'); setResult(null);
    try {
      const token = localStorage.getItem('dd_token');
      const fd = new FormData();
      fd.append('file', restoreFile);
      const r = await fetch('/api/sme/backup/restore', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Restore fehlgeschlagen');
      setResult(`✓ Wiederherstellung: ${d.inserted} Datensätze eingespielt, ${d.skipped} übersprungen`);
      setRestoreFile(null); setPreview(null);
    } catch (e: any) { setResult('⚠️ ' + e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="card mb-3">
      <div className="card-header"><span className="card-title">💾 Datensicherung</span></div>
      <div className="card-body">
        <p className="muted sm" style={{marginBottom:14,lineHeight:1.7}}>
          Speichere alle deine Daten — Kunden, Rechnungen, Belege, Inventar, Mahnstufen,
          Bilder — in einer einzelnen <code>.meind</code>-Datei. Dieses Format ist
          auf einen USB-Stick portabel und nur mit deinem Account wieder einzuspielen.
        </p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <button className="btn btn-primary" onClick={doExport} disabled={busy !== null}>
            💾 {busy === 'export' ? 'Erstelle…' : 'Backup herunterladen (.meind)'}
          </button>
          <label className="btn btn-secondary" style={{cursor:'pointer'}} title="Wähle eine .meind-Datei für die Vorschau">
            📂 {previewing ? 'Lade Vorschau…' : 'Backup einspielen…'}
            <input type="file" accept=".meind,application/octet-stream" style={{display:'none'}}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) startRestore(f); e.target.value = ''; }}
              disabled={busy !== null || previewing}
            />
          </label>
        </div>
        {result && <div style={{marginTop:12,padding:10,background:'var(--bg)',borderRadius:'var(--r)',fontSize:13}}>{result}</div>}
        <p className="form-hint" style={{marginTop:10,lineHeight:1.6}}>
          Hinweis: Auf Cloud-Hosting (Render Free, Fly Hobby) sind hochgeladene Bilder und Belege NICHT zwischen Deploys persistent — das Backup ist hier die einzige verlässliche Speicherung. Lokal entwickelt: alles liegt in <code>server/uploads/</code>.
        </p>
      </div>

      {/* Restore Wizard */}
      {preview && restoreFile && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="modal modal-lg">
            <div className="modal-hd">
              <span className="modal-title">Backup einspielen — Vorschau</span>
              <button className="modal-close" onClick={() => { setPreview(null); setRestoreFile(null); }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--r)', marginBottom: 14, fontSize: 13 }}>
                <div className="bold">{restoreFile.name}</div>
                <div className="muted sm">
                  Backup-Format <code>{preview.manifest.format}</code> · erstellt am{' '}
                  <strong>{new Date(preview.manifest.exported_at).toLocaleString('de-DE')}</strong>
                </div>
              </div>

              {preview.different_tenant && (
                <div style={{ padding: 12, background: 'rgba(220,38,38,.08)', border: '1px solid var(--danger)', borderRadius: 'var(--r)', marginBottom: 14, fontSize: 13, color: 'var(--danger)' }}>
                  <strong>⚠️ Achtung:</strong> Dieses Backup stammt von einem anderen Unternehmen. Der Restore wird die Daten auf <em>deinen</em> Account umschreiben — dabei können bestehende IDs kollidieren.
                </div>
              )}

              <div className="bold sm" style={{ marginBottom: 8, color: 'var(--primary)' }}>Inhalt des Backups</div>
              <div className="tbl-wrap" style={{ marginBottom: 14 }}>
                <table>
                  <thead><tr><th>Tabelle</th><th style={{ textAlign: 'right' }}>Im Backup</th><th style={{ textAlign: 'right' }}>Aktuell bei dir</th><th style={{ textAlign: 'right' }}>Differenz</th></tr></thead>
                  <tbody>
                    {Object.entries(preview.manifest.table_counts || {}).map(([t, cnt]) => {
                      const current = preview.current_counts?.[t] ?? 0;
                      const c = cnt as number;
                      const diff = c - current;
                      return (
                        <tr key={t}>
                          <td className="sm">{TABLE_LABELS[t] || t}</td>
                          <td className="bold" style={{ textAlign: 'right' }}>{c}</td>
                          <td className="muted sm" style={{ textAlign: 'right' }}>{current}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: diff > 0 ? 'var(--ok)' : diff < 0 ? 'var(--warn)' : 'var(--ink3)' }}>
                            {diff > 0 ? '+' + diff : diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {preview.total_upload_files > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="bold sm" style={{ marginBottom: 6, color: 'var(--primary)' }}>Dateien</div>
                  <div className="muted sm">{preview.total_upload_files} hochgeladene Dateien (Logos, Belege, Bilder) — werden ebenfalls eingespielt.</div>
                </div>
              )}

              <div style={{ padding: 12, background: 'rgba(217,119,6,.08)', border: '1px solid var(--warn)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--warn)', lineHeight: 1.6 }}>
                <strong>Was passiert beim Einspielen:</strong>
                <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                  <li>Datensätze mit derselben ID werden <strong>nicht überschrieben</strong> (INSERT OR IGNORE).</li>
                  <li>Neue Datensätze werden hinzugefügt.</li>
                  <li>Hochgeladene Dateien überschreiben existierende mit identischem Namen.</li>
                  <li>Bestehende Daten, die nicht im Backup sind, bleiben unverändert erhalten.</li>
                </ul>
                Tipp: Vor dem Einspielen einen aktuellen <strong>Export</strong> machen, um den jetzigen Stand zu sichern.
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => { setPreview(null); setRestoreFile(null); }}>Abbrechen</button>
              <button className="btn btn-primary" onClick={confirmRestore} disabled={busy === 'restore'}>
                {busy === 'restore' ? 'Spiele ein…' : '📂 Jetzt einspielen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mahnstufen-Settings ─────────────────────────────────────────────────
function DunningSettingsCard() {
  const [levels, setLevels] = useState<any[]>([]);
  const [dirty, setDirty]   = useState<Set<string>>(new Set());

  const load = () => api.get<any[]>('/sme/dunning').then(setLevels).catch(()=>setLevels([]));
  useEffect(()=>{ load(); }, []);

  const update = (id: string, patch: any) => {
    setLevels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDirty((d) => new Set([...Array.from(d), id]));
  };

  const save = async (l: any) => {
    try {
      await api.put(`/sme/dunning/${l.id}`, l);
      setDirty((d) => { const n = new Set(d); n.delete(l.id); return n; });
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="card mb-3">
      <div className="card-header">
        <span className="card-title">⏰ Mahnstufen</span>
      </div>
      <div className="card-body">
        <p className="muted sm" style={{marginBottom:14,lineHeight:1.7}}>
          Konfiguriere deine Mahnstufen — wie viele Tage nach Fälligkeit, welche Gebühr, welcher Text. Die Mahnungs-Vorschau bei jeder Rechnung nutzt diese Werte.
        </p>
        {levels.map((l) => (
          <div key={l.id} style={{padding:14,background:'var(--bg)',borderRadius:'var(--r)',marginBottom:10,border:'1px solid var(--border)'}}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Stufe {l.level} — Name</label>
                <input className="form-input" value={l.name} onChange={(e)=>update(l.id,{name:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Tage nach Fälligkeit</label>
                <input className="form-input" type="number" value={l.days_after_due} onChange={(e)=>update(l.id,{days_after_due:+e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Gebühr (€)</label>
                <input className="form-input" type="number" step="0.01" value={l.fee} onChange={(e)=>update(l.id,{fee:+e.target.value})}/>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Standard-Text</label>
              <textarea className="form-textarea" rows={2} value={l.text_template||''} onChange={(e)=>update(l.id,{text_template:e.target.value})}/>
            </div>
            {dirty.has(l.id) && (
              <button className="btn btn-primary btn-sm" onClick={()=>save(l)}>
                <Save size={12}/>Speichern
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Push to Steuerberater ───────────────────────────────────────────────
function StbPushCard({ stbFirm }: { stbFirm: string }) {
  const [sending, setSending] = useState(false);

  const push = async () => {
    if (!confirm(`Alles für den aktuellen Monat an ${stbFirm} übertragen?\n\nDas erzeugt einen ZIP-Export und eine Notiz für deinen Steuerberater.`)) return;
    setSending(true);
    try {
      await api.post('/sme/handover');
      alert(`✓ Übergabe an ${stbFirm} erfolgt`);
    } catch (e: any) { alert(e.message); }
    finally { setSending(false); }
  };

  return (
    <div className="card mb-3">
      <div className="card-header"><span className="card-title">📤 Übergabe an Steuerberater</span></div>
      <div className="card-body">
        <p className="muted sm" style={{marginBottom:14,lineHeight:1.7}}>
          Mit einem Klick alle Rechnungen, Belege und Kunden des aktuellen Monats an <strong>{stbFirm}</strong> übergeben.
          Eine Notiz wird im Kanzlei-Portal hinterlegt; falls Mail konfiguriert, geht zusätzlich eine Benachrichtigung raus.
        </p>
        <button className="btn btn-primary" onClick={push} disabled={sending}>
          <Send size={14}/>{sending ? 'Übergebe…' : `Jetzt an ${stbFirm} übergeben`}
        </button>
      </div>
    </div>
  );
}

// ── Mail-Postfach (IMAP + SMTP) ─────────────────────────────────────────
// Provider presets save users from hunting for the right host/port. We only
// auto-fill the protocol fields — credentials always need the user's input.
const MAIL_PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; helpUrl?: string; needsAppPassword?: boolean }> = {
  gmail: {
    imapHost: 'imap.gmail.com', imapPort: 993,
    smtpHost: 'smtp.gmail.com', smtpPort: 587,
    helpUrl: 'https://support.google.com/accounts/answer/185833',
    needsAppPassword: true,
  },
  outlook: {
    imapHost: 'outlook.office365.com', imapPort: 993,
    smtpHost: 'smtp.office365.com', smtpPort: 587,
    helpUrl: 'https://support.microsoft.com/en-us/account-billing/how-to-get-and-use-app-passwords-5896ed9b-4263-e681-128a-a6f2979a7944',
    needsAppPassword: true,
  },
  icloud: {
    imapHost: 'imap.mail.me.com', imapPort: 993,
    smtpHost: 'smtp.mail.me.com', smtpPort: 587,
    helpUrl: 'https://support.apple.com/en-us/HT204397',
    needsAppPassword: true,
  },
  webde: {
    imapHost: 'imap.web.de', imapPort: 993,
    smtpHost: 'smtp.web.de', smtpPort: 587,
  },
  gmx: {
    imapHost: 'imap.gmx.net', imapPort: 993,
    smtpHost: 'mail.gmx.net', smtpPort: 587,
  },
};

function MailSettingsCard() {
  const [status, setStatus] = useState<any>(null);
  const [preset, setPreset] = useState('');
  const [form, setForm]     = useState({
    mail_address: '', mail_display_name: '',
    imap_host: '', imap_port: 993, imap_user: '', imap_pass: '', imap_tls: true,
    smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', smtp_tls: true,
  });
  const [showImapPw, setShowImapPw] = useState(false);
  const [showSmtpPw, setShowSmtpPw] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState<any>(null);

  const loadStatus = () => api.get<any>('/sme/mail/status').then(setStatus).catch(() => setStatus(null));
  useEffect(() => { loadStatus(); }, []);

  const applyPreset = (p: string) => {
    setPreset(p);
    const cfg = MAIL_PRESETS[p];
    if (!cfg) return;
    setForm((f) => ({
      ...f,
      imap_host: cfg.imapHost, imap_port: cfg.imapPort,
      smtp_host: cfg.smtpHost, smtp_port: cfg.smtpPort,
    }));
  };

  const save = async () => {
    try {
      await api.put('/sme/mail/config', form);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      // Clear plaintext passwords from state — they're persisted now.
      setForm((f) => ({ ...f, imap_pass: '', smtp_pass: '' }));
      loadStatus();
    } catch (e: any) { alert(e.message); }
  };

  const runTest = async () => {
    setTesting(true); setTestRes(null);
    try {
      const r = await api.post('/sme/mail/test');
      setTestRes(r);
    } catch (e: any) { setTestRes({ error: e.message }); }
    finally { setTesting(false); }
  };

  const presetCfg = preset ? MAIL_PRESETS[preset] : null;

  return (
    <div className="card mb-3">
      <div className="card-header">
        <span className="card-title"><Mail size={14} style={{verticalAlign:'-2px',marginRight:6}}/>Postfach (IMAP + SMTP)</span>
        {status?.imapConfigured && status?.smtpConfigured
          ? <span className="badge badge-ok">✓ Konfiguriert</span>
          : <span className="badge badge-neu">Nicht konfiguriert</span>
        }
      </div>
      <div className="card-body">
        <p className="muted sm" style={{marginBottom:14, lineHeight:1.7}}>
          Hinterlege dein Mail-Konto, um eingehende Post in der App zu sehen und Rechnungen/Mahnungen direkt von deinem Account zu senden.
          Passwörter werden mit AES-256 verschlüsselt gespeichert.
        </p>

        <div className="form-group">
          <label className="form-label">Schnell-Setup für deinen Provider</label>
          <select className="form-select" value={preset} onChange={(e)=>applyPreset(e.target.value)}>
            <option value="">– Manuell konfigurieren –</option>
            <option value="gmail">Gmail / Google Workspace</option>
            <option value="outlook">Outlook / Microsoft 365</option>
            <option value="icloud">iCloud Mail</option>
            <option value="webde">Web.de</option>
            <option value="gmx">GMX</option>
          </select>
        </div>

        {presetCfg?.needsAppPassword && (
          <div style={{background:'var(--warn-bg)',border:'1px solid var(--warn)',borderRadius:'var(--r)',padding:'10px 14px',fontSize:12,color:'var(--warn)',marginBottom:14,lineHeight:1.7}}>
            <AlertTriangle size={13} style={{verticalAlign:'-2px',marginRight:6}}/>
            <strong>App-Passwort erforderlich:</strong> Bei {preset === 'gmail' ? 'Gmail' : preset === 'outlook' ? 'Outlook' : 'iCloud'} musst du ein „App-Passwort" generieren (NICHT dein normales Passwort) — sonst lehnt der Server die Verbindung ab.{' '}
            {presetCfg.helpUrl && <a href={presetCfg.helpUrl} target="_blank" rel="noreferrer" style={{color:'var(--warn)',textDecoration:'underline'}}>Anleitung →</a>}
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">E-Mail-Adresse *</label>
            <input className="form-input" type="email" value={form.mail_address} onChange={(e)=>setForm(f=>({...f,mail_address:e.target.value, imap_user: f.imap_user||e.target.value, smtp_user: f.smtp_user||e.target.value}))} placeholder="z.B. info@deine-firma.de"/>
          </div>
          <div className="form-group">
            <label className="form-label">Anzeigename</label>
            <input className="form-input" value={form.mail_display_name} onChange={(e)=>setForm(f=>({...f,mail_display_name:e.target.value}))} placeholder="z.B. Bauer Elektrotechnik GmbH"/>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:8}}>
          {/* IMAP */}
          <div style={{padding:'12px 14px',background:'var(--bg)',borderRadius:'var(--r)',border:'1px solid var(--border)'}}>
            <div className="bold sm" style={{marginBottom:10}}>📥 IMAP (Empfang)</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Host</label>
                <input className="form-input" value={form.imap_host} onChange={(e)=>setForm(f=>({...f,imap_host:e.target.value}))} placeholder="imap.provider.de"/>
              </div>
              <div className="form-group">
                <label className="form-label">Port</label>
                <input className="form-input" type="number" value={form.imap_port} onChange={(e)=>setForm(f=>({...f,imap_port:+e.target.value}))}/>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Benutzer</label>
              <input className="form-input" value={form.imap_user} onChange={(e)=>setForm(f=>({...f,imap_user:e.target.value}))}/>
            </div>
            <div className="form-group">
              <label className="form-label">Passwort {status?.imapConfigured && <span className="muted" style={{fontSize:11}}>(leer = unverändert)</span>}</label>
              <div style={{position:'relative'}}>
                <input className="form-input" type={showImapPw?'text':'password'} value={form.imap_pass} onChange={(e)=>setForm(f=>({...f,imap_pass:e.target.value}))} style={{paddingRight:36}}/>
                <button type="button" onClick={()=>setShowImapPw(v=>!v)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ink3)',display:'flex'}}>
                  {showImapPw?<EyeOff size={13}/>:<Eye size={13}/>}
                </button>
              </div>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--ink2)'}}>
              <input type="checkbox" checked={form.imap_tls} onChange={(e)=>setForm(f=>({...f,imap_tls:e.target.checked}))}/>
              SSL/TLS verwenden
            </label>
          </div>

          {/* SMTP */}
          <div style={{padding:'12px 14px',background:'var(--bg)',borderRadius:'var(--r)',border:'1px solid var(--border)'}}>
            <div className="bold sm" style={{marginBottom:10}}>📤 SMTP (Versand)</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Host</label>
                <input className="form-input" value={form.smtp_host} onChange={(e)=>setForm(f=>({...f,smtp_host:e.target.value}))} placeholder="smtp.provider.de"/>
              </div>
              <div className="form-group">
                <label className="form-label">Port</label>
                <input className="form-input" type="number" value={form.smtp_port} onChange={(e)=>setForm(f=>({...f,smtp_port:+e.target.value}))}/>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Benutzer</label>
              <input className="form-input" value={form.smtp_user} onChange={(e)=>setForm(f=>({...f,smtp_user:e.target.value}))}/>
            </div>
            <div className="form-group">
              <label className="form-label">Passwort {status?.smtpConfigured && <span className="muted" style={{fontSize:11}}>(leer = unverändert)</span>}</label>
              <div style={{position:'relative'}}>
                <input className="form-input" type={showSmtpPw?'text':'password'} value={form.smtp_pass} onChange={(e)=>setForm(f=>({...f,smtp_pass:e.target.value}))} style={{paddingRight:36}}/>
                <button type="button" onClick={()=>setShowSmtpPw(v=>!v)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ink3)',display:'flex'}}>
                  {showSmtpPw?<EyeOff size={13}/>:<Eye size={13}/>}
                </button>
              </div>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--ink2)'}}>
              <input type="checkbox" checked={form.smtp_tls} onChange={(e)=>setForm(f=>({...f,smtp_tls:e.target.checked}))}/>
              STARTTLS verwenden
            </label>
          </div>
        </div>

        <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
          <button className="btn btn-primary" onClick={save}>
            {saved?<><CheckCircle size={14}/>Gespeichert</>:<><Save size={14}/>Postfach speichern</>}
          </button>
          {(status?.imapConfigured || status?.smtpConfigured) && (
            <button className="btn btn-secondary" onClick={runTest} disabled={testing}>
              <Check size={14}/>{testing?'Teste…':'Verbindung testen'}
            </button>
          )}
        </div>

        {testRes && (
          <div style={{marginTop:14,padding:'12px 14px',background:'var(--bg)',borderRadius:'var(--r)',border:'1px solid var(--border)',fontSize:13}}>
            {testRes.error
              ? <div className="err-c">⚠️ {testRes.error}</div>
              : <>
                  <div style={{color:testRes.imap?.ok?'var(--ok)':'var(--danger)'}}>
                    {testRes.imap?.ok ? '✓' : '✗'} IMAP — {testRes.imap?.ok ? `${testRes.imap.exists} Mails im Posteingang` : testRes.imap?.error}
                  </div>
                  <div style={{color:testRes.smtp?.ok?'var(--ok)':'var(--danger)',marginTop:4}}>
                    {testRes.smtp?.ok ? '✓' : '✗'} SMTP — {testRes.smtp?.ok ? 'Verbindung erfolgreich' : testRes.smtp?.error}
                  </div>
                </>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── Support-Tickets-Card ─────────────────────────────────────────────────────
function SupportTicketsCard() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '', category: 'support', priority: 'normal' });
  const [busy, setBusy] = useState(false);

  const load = () => api.get<any[]>('/tickets').then(setTickets).catch(() => setTickets([]));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.subject.trim() || !form.body.trim()) { alert('Betreff und Beschreibung erforderlich.'); return; }
    setBusy(true);
    try {
      await api.post('/tickets', form);
      setShowNew(false);
      setForm({ subject: '', body: '', category: 'support', priority: 'normal' });
      load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const open = tickets.filter((t) => t.status !== 'closed');
  const closed = tickets.filter((t) => t.status === 'closed');

  return (
    <div className="card mb-3">
      <div className="card-header">
        <span className="card-title"><LifeBuoy size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Support & Feature-Wünsche</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={13} />Neues Ticket</button>
      </div>
      <div className="card-body">
        {tickets.length === 0 ? (
          <p className="muted sm">
            Brauchst du Hilfe oder hast einen Funktionswunsch? Erstelle ein Ticket — wir antworten direkt im System.
          </p>
        ) : (
          <>
            {open.length > 0 && (
              <>
                <div className="bold sm" style={{ marginBottom: 8 }}>Offen ({open.length})</div>
                {open.map((t) => (
                  <div key={t.id} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r)', marginBottom: 8, borderLeft: `3px solid ${t.priority === 'high' ? 'var(--danger)' : t.priority === 'low' ? 'var(--ink4)' : 'var(--warn)'}` }}>
                    <div className="fb">
                      <span className="bold sm">{t.subject}</span>
                      <span className="muted" style={{ fontSize: 11 }}>{new Date(t.created_at).toLocaleString('de-DE')}</span>
                    </div>
                    <div className="muted sm" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{t.body}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <span className="badge badge-info">{t.status === 'in_progress' ? 'In Bearbeitung' : 'Offen'}</span>
                      <span className="badge badge-neu">{t.category}</span>
                    </div>
                    {t.admin_note && (
                      <div style={{ marginTop: 8, padding: 8, background: 'rgba(99,102,241,.08)', borderRadius: 'var(--r)', fontSize: 12 }}>
                        <strong>Antwort vom Team:</strong> {t.admin_note}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            {closed.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary className="muted sm" style={{ cursor: 'pointer' }}>Abgeschlossene Tickets ({closed.length})</summary>
                {closed.slice(0, 5).map((t) => (
                  <div key={t.id} style={{ padding: 8, marginTop: 6, fontSize: 12 }}>
                    <span className="bold">{t.subject}</span> · <span className="muted">{new Date(t.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                ))}
              </details>
            )}
          </>
        )}
      </div>

      {showNew && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal">
            <div className="modal-hd">
              <span className="modal-title">Neues Ticket</span>
              <button className="modal-close" onClick={() => setShowNew(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Kategorie</label>
                  <select className="form-select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                    <option value="support">Hilfe / Problem</option>
                    <option value="feature">Feature-Wunsch</option>
                    <option value="bug">Bug-Report</option>
                    <option value="billing">Abrechnung</option>
                    <option value="other">Sonstiges</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Priorität</label>
                  <select className="form-select" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                    <option value="low">Niedrig</option>
                    <option value="normal">Normal</option>
                    <option value="high">Hoch / Blocker</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Betreff *</label>
                <input className="form-input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Kurze Zusammenfassung" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Beschreibung *</label>
                <textarea className="form-textarea" rows={6} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Was läuft schief? Was möchtest du? Je konkreter, desto schneller können wir helfen." />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                <Send size={13} />{busy ? 'Sende…' : 'Ticket absenden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
