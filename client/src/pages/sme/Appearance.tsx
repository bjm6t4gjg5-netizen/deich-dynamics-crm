import { useState, useRef } from 'react';
import { Save, CheckCircle, Upload, Sun, Moon } from 'lucide-react';
import { api, STORAGE } from '../../api';
import { useApp } from '../../context/AppContext';
import { BRAND } from '../../brand';

const PRESETS = [
  // Deich Dynamics — house defaults
  { name:'Nordsee',    color:'#1d3f36', accent:'#a8c5b4', dark:false },
  { name:'Deich',      color:'#14302a', accent:'#7fb29a', dark:false },
  // Dark/professional
  { name:'Navy',       color:'#1a5276', accent:'#2e86ab', dark:false },
  { name:'Slate',      color:'#2c3e50', accent:'#e67e22', dark:false },
  { name:'Anthrazit',  color:'#2f3640', accent:'#2980b9', dark:false },
  { name:'Schwarz',    color:'#111827', accent:'#3b82f6', dark:false },
  // Green
  { name:'Smaragd',    color:'#065f46', accent:'#10b981', dark:false },
  { name:'Waldgrün',   color:'#1a6b3c', accent:'#27ae60', dark:false },
  { name:'Salbei',     color:'#4d7c5f', accent:'#86efac', dark:false },
  // Warm/bright
  { name:'Terracotta', color:'#9a3412', accent:'#f97316', dark:false },
  { name:'Bordeaux',   color:'#7c2d12', accent:'#c0392b', dark:false },
  { name:'Koralle',    color:'#dc2626', accent:'#fb923c', dark:false },
  // Purple
  { name:'Violett',    color:'#4c1d95', accent:'#8b5cf6', dark:false },
  { name:'Pflaume',    color:'#6b21a8', accent:'#a78bfa', dark:false },
  // Bright/fresh — light backgrounds
  { name:'Sky',        color:'#0369a1', accent:'#38bdf8', dark:false },
  { name:'Ozean',      color:'#0e4d6b', accent:'#17a589', dark:false },
  { name:'Petrol',     color:'#0f766e', accent:'#2dd4bf', dark:false },
  { name:'Indigo',     color:'#3730a3', accent:'#818cf8', dark:false },
  // Friendly/light
  { name:'Sonnengelb', color:'#92400e', accent:'#fbbf24', dark:false },
  { name:'Rosa',       color:'#9d174d', accent:'#f472b6', dark:false },
  { name:'Minze',      color:'#064e3b', accent:'#6ee7b7', dark:false },
  { name:'Lavender',   color:'#4338ca', accent:'#c4b5fd', dark:false },
  // Light/soft
  { name:'Wolke',      color:'#374151', accent:'#60a5fa', dark:false },
  { name:'Sand',       color:'#78350f', accent:'#fcd34d', dark:false },
  { name:'Frühlng',    color:'#166534', accent:'#86efac', dark:false },
  { name:'Ozean Hell', color:'#075985', accent:'#7dd3fc', dark:false },
];

export default function Appearance({ role }) {
  const { profile, theme, patchProfile, refreshProfile } = useApp();
  const [color,  setColorRaw]  = useState(theme.color);
  const [accent, setAccentRaw] = useState(theme.accent);
  const [mode,   setModeRaw]   = useState(theme.mode || 'light');
  const [firm,   setFirm]      = useState(profile?.firm_name || '');
  const [saved,  setSaved]     = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoUrl,     setLogoUrl]     = useState(profile?.logo_url || null);
  const fileRef = useRef(null);

  const setColor  = (v) => { setColorRaw(v);  patchProfile({ theme_color: v }); };
  const setAccent = (v) => { setAccentRaw(v); patchProfile({ theme_accent: v }); };
  const setMode   = (v) => { setModeRaw(v);   patchProfile({ theme_mode: v }); };

  const save = async () => {
    const data = { theme_color: color, theme_accent: accent, theme_mode: mode, firm_name: firm };
    try {
      if (role === 'steuerberater') await api.stb.updateProfile(data);
      else await api.sme.updateProfile(data);
      await refreshProfile();
      setSaved(true); setTimeout(()=>setSaved(false), 2500);
    } catch(e) { alert(e.message); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoLoading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const endpoint = role === 'steuerberater' ? '/api/stb/logo' : '/api/sme/logo';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem(STORAGE.TOKEN_KEY)}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setLogoUrl(d.url);
      patchProfile({ logo_url: d.url });
      await refreshProfile();
    } catch(e) { alert(e.message); }
    finally { setLogoLoading(false); }
  };

  const lightAccent = `${color}33`;

  return (
    <div style={{maxWidth:600}}>
      {/* Logo */}
      <div className="card mb-3">
        <div className="card-header"><span className="card-title">Logo & Branding</span></div>
        <div className="card-body">
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:14}}>
            <div style={{width:80,height:80,borderRadius:'var(--r-lg)',background:`${color}22`,border:`1px solid ${color}44`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" style={{width:'100%',height:'100%',objectFit:'contain',padding:6}}/>
                : <span style={{fontFamily:'var(--font-display)',fontSize:22,color:color,fontWeight:700}}>{(firm||'K').slice(0,2).toUpperCase()}</span>
              }
            </div>
            <div>
              <div className="bold sm" style={{marginBottom:4}}>Firmenlogo</div>
              <div className="muted sm" style={{marginBottom:8}}>Erscheint in Sidebar, Rechnungen & E-Mails. PNG, JPG, SVG, WebP · max. 2 MB</div>
              <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>uploadLogo(e.target.files[0])}/>
              <button className="btn btn-secondary btn-sm" onClick={()=>fileRef.current?.click()} disabled={logoLoading}>
                <Upload size={13}/>{logoLoading?'Hochladen…':'Logo hochladen'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="card mb-3">
        <div className="card-header"><span className="card-title">Erscheinungsbild</span></div>
        <div className="card-body">
          {/* Mode */}
          <div className="form-group">
            <label className="form-label">Modus</label>
            <div style={{display:'flex',gap:8}}>
              {[['light','☀️ Hell'],['dark','🌙 Dunkel']].map(([v,l])=>(
                <button key={v} className={`btn ${mode===v?'btn-primary':'btn-secondary'}`}
                  style={{flex:1,justifyContent:'center'}} onClick={()=>setMode(v)}>{l}</button>
              ))}
            </div>
          </div>

          {/* Presets */}
          <div className="form-group">
            <label className="form-label">Farbpalette — {PRESETS.length} Designs</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6}}>
              {PRESETS.map(p=>(
                <button key={p.name} onClick={()=>{setColor(p.color);setAccent(p.accent);}}
                  title={p.name}
                  style={{
                    padding:'7px 4px',borderRadius:'var(--r)',cursor:'pointer',
                    border:`2px solid ${color===p.color?p.color:'var(--border)'}`,
                    background:'var(--surface)',display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                    transform:color===p.color?'scale(1.05)':'',boxShadow:color===p.color?`0 0 0 2px ${p.color}44`:'',
                    transition:'all .15s',
                  }}>
                  <div style={{display:'flex',gap:2}}>
                    <div style={{width:13,height:13,borderRadius:'50%',background:p.color}}/>
                    <div style={{width:13,height:13,borderRadius:'50%',background:p.accent}}/>
                  </div>
                  <span style={{fontSize:9,color:'var(--ink3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:40}}>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Primärfarbe (Sidebar)</label>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="color" value={color} onChange={e=>setColor(e.target.value)}
                  style={{width:42,height:36,borderRadius:'var(--r)',border:'1px solid var(--border)',cursor:'pointer',padding:2,flexShrink:0}}/>
                <input className="form-input" value={color} onChange={e=>setColor(e.target.value)} style={{fontFamily:'monospace',fontSize:12}}/>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Akzentfarbe (Buttons)</label>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="color" value={accent} onChange={e=>setAccent(e.target.value)}
                  style={{width:42,height:36,borderRadius:'var(--r)',border:'1px solid var(--border)',cursor:'pointer',padding:2,flexShrink:0}}/>
                <input className="form-input" value={accent} onChange={e=>setAccent(e.target.value)} style={{fontFamily:'monospace',fontSize:12}}/>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div style={{borderRadius:'var(--r-xl)',overflow:'hidden',border:'1px solid var(--border)',marginBottom:16}}>
            <div style={{background:color,padding:'14px 18px',display:'flex',alignItems:'center',gap:12}}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" style={{height:26,objectFit:'contain',filter:'brightness(0) invert(1)'}}/>
                : <span style={{fontFamily:'var(--font-display)',fontSize:18,color:'#fff',fontWeight:700}}>{BRAND.name}</span>
              }
              <div style={{background:'rgba(255,255,255,.15)',borderRadius:6,padding:'3px 10px',fontSize:11,color:'rgba(255,255,255,.8)'}}>{firm||'Ihr Unternehmen'}</div>
            </div>
            <div style={{background:lightAccent,padding:'8px 18px',display:'flex',gap:8,flexWrap:'wrap'}}>
              {['Dashboard','Kunden','Rechnungen','Inventar'].map(l=>(
                <div key={l} style={{fontSize:11,color:color,fontWeight:500,padding:'3px 8px',borderRadius:4,background:'rgba(255,255,255,.5)'}}>{l}</div>
              ))}
            </div>
            <div style={{padding:'14px 18px',background:'var(--surface)'}}>
              <div className="bold sm" style={{marginBottom:6}}>Dashboard Vorschau</div>
              <div style={{display:'flex',gap:8}}>
                {['Umsatz','Offen','Kunden'].map(l=>(
                  <div key={l} style={{flex:1,background:lightAccent,borderRadius:'var(--r)',padding:'10px',textAlign:'center'}}>
                    <div style={{fontSize:10,color:color,marginBottom:3}}>{l}</div>
                    <div style={{fontWeight:700,color:color,fontSize:14}}>–</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {role !== 'superadmin' && (
            <div className="form-group">
              <label className="form-label">{role==='steuerberater'?'Kanzleiname':'Firmenname'}</label>
              <input className="form-input" value={firm} onChange={e=>setFirm(e.target.value)}/>
            </div>
          )}

          <button className="btn btn-primary" onClick={save}>
            {saved?<><CheckCircle size={14}/>Gespeichert!</>:<><Save size={14}/>Speichern</>}
          </button>
          <p className="form-hint" style={{marginTop:8}}>
            Änderungen werden sofort als Vorschau angezeigt — auch Sidebar und Buttons ändern sich live. Klicken Sie „Speichern" um dauerhaft zu übernehmen.
          </p>
        </div>
      </div>
    </div>
  );
}
