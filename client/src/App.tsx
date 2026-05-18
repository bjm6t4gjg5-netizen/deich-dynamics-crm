import React, { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { useLang } from './context/LangContext';
import { TourButton } from './components/Tour';
import { BRAND } from './brand';
import Login from './pages/Login';

// Admin
import AdminPortal from './pages/admin/AdminPortal';

// StB
import StbPortal    from './pages/stb/StbPortal';
import StbSettings  from './pages/stb/StbSettings';

// SME
import Dashboard    from './pages/sme/Dashboard';
import Customers    from './pages/sme/Customers';
import Invoices     from './pages/sme/Invoices';
import Inventory    from './pages/sme/Inventory';
import Appearance   from './pages/sme/Appearance';
import Settings     from './pages/sme/Settings';
import Expenses from './pages/sme/Expenses';
import { Pipeline, AIChat } from './pages/sme/OtherPages';

import {
  LayoutDashboard, Users, TrendingUp, FileText, Receipt, Package, Zap,
  LogOut, Settings as SettingsIcon, Palette, Bell, Users2, Shield,
  BarChart3,
} from 'lucide-react';


const PAGE_TITLES = {
  dashboard:'Dashboard', customers:'Kunden', pipeline:'Pipeline',
  invoices:'Rechnungen', expenses:'Belege', inventory:'Inventar',
  ai:'KI-Assistent', appearance:'Erscheinungsbild', settings:'Einstellungen',
  admin:'Super-Admin', stb:'Mandanten', stbsettings:'Kanzlei-Einstellungen',
};

export default function App() {
  const { user, profile, loading, logout, theme, apiKey } = useApp();
  const { lang, setLang, t } = useLang();
  const [page, setPage] = useState('dashboard');

  useEffect(() => {
    if (!user) return;
    if (user.role === 'superadmin')    setPage('admin');
    else if (user.role === 'steuerberater') setPage('stb');
    else setPage('dashboard');
  }, [user?.id]);

  if (loading) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',
      fontFamily:'var(--font-display)',color:'var(--ink3)',gap:14}}>
      <div style={{width:48,height:48,borderRadius:12,background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:24,boxShadow:'0 4px 18px rgba(29,63,54,.3)'}}>D</div>
      <div style={{fontSize:18}}>{BRAND.product} wird geladen…</div>
    </div>
  );

  if (!user) return <Login/>;

  const role  = user.role;
  const isSme = role === 'unternehmen';
  const isStb = role === 'steuerberater';
  const isAdmin = role === 'superadmin';

  let modules = { contacts:true, pipeline:true, invoices:true, expenses:true, inventory:true, ai:true };
  if (isSme && profile?.modules) {
    try { modules = JSON.parse(profile.modules); } catch {}
  }

  // Build sidebar sections
  const navSections = [];
  if (isAdmin) {
    navSections.push({ label:'System', items: [
      { id:'admin', label:'Admin-Konsole', Icon:Shield },
    ]});
  }
  if (isStb) {
    navSections.push({ label:'Mandanten', items: [
      { id:'stb', label:'Mandanten', Icon:Users2 },
    ]});
    navSections.push({ label:'Kanzlei', items: [
      { id:'appearance',  label:'Erscheinungsbild', Icon:Palette },
      { id:'stbsettings', label:'Mail & Integrationen', Icon:SettingsIcon },
      { id:'settings',    label:'Einstellungen', Icon:SettingsIcon },
    ]});
  }
  if (isSme) {
    const main = [{ id:'dashboard', label:'Dashboard', Icon:LayoutDashboard }];
    if (modules.contacts)  main.push({ id:'customers',  label:'Kunden',        Icon:Users });
    if (modules.pipeline)  main.push({ id:'pipeline',   label:'Pipeline',      Icon:TrendingUp });
    if (modules.invoices)  main.push({ id:'invoices',   label:'Rechnungen',    Icon:FileText });
    if (modules.expenses)  main.push({ id:'expenses',   label:'Belege',        Icon:Receipt });
    if (modules.inventory) main.push({ id:'inventory',  label:'Inventar',      Icon:Package });
    if (modules.ai)        main.push({ id:'ai',         label:'KI-Assistent',  Icon:Zap });
    navSections.push({ label:'Verwaltung', items: main });
    navSections.push({ label:'Konto', items: [
      { id:'appearance', label:'Erscheinungsbild', Icon:Palette },
      { id:'settings',   label:'Einstellungen',    Icon:SettingsIcon },
    ]});
  }

  const renderPage = () => {
    if (isAdmin) return <AdminPortal/>;

    if (isStb) {
      if (page==='appearance')  return <Appearance role="steuerberater"/>;
      if (page==='stbsettings') return <StbSettings/>;
      if (page==='settings')    return <Settings/>;
      return <StbPortal/>;
    }

    // SME
    switch (page) {
      case 'customers':  return <Customers onNavigate={setPage}/>;
      case 'pipeline':   return <Pipeline onNavigate={setPage}/>;
      case 'invoices':   return <Invoices/>;
      case 'expenses':   return <Expenses/>;
      case 'inventory':  return <Inventory/>;
      case 'ai':         return <AIChat apiKey={apiKey} onGoSettings={()=>setPage('settings')}/>;
      case 'appearance': return <Appearance role="unternehmen"/>;
      case 'settings':   return <Settings/>;
      default:           return <Dashboard onNavigate={setPage}/>;
    }
  };

  const sbBg = theme.color;

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar" style={{background:sbBg}}>
        <div className="sb-logo">
          {theme.logo
            ? <img src={theme.logo} alt="Logo" style={{height:30,maxWidth:140,objectFit:'contain',filter:'brightness(0) invert(1)'}}/>
            : <div className="sb-mark">{BRAND.name}</div>
          }
          <div className="sb-sub">
            {isAdmin ? 'Platform Admin'
              : isStb ? profile?.firm_name || 'Steuerberater'
              : profile?.firm_name || 'Mein Unternehmen'}
          </div>
        </div>

        <div className="sb-badge">
          {isAdmin ? '🛡️ Super-Admin' : isStb ? '📊 Steuerberater' : '🏢 Unternehmen'}
        </div>

        <nav className="nav">
          {navSections.map(section => (
            <div key={section.label} className="nav-sect">
              <span className="nav-lbl">{section.label}</span>
              {section.items.map(({ id, label, Icon }) => (
                <button key={id} className={`nav-item${page===id?' active':''}`} onClick={()=>setPage(id)}>
                  <Icon size={15}/>{label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="sb-user">{user.email}</div>
          <button className="sb-logout" onClick={logout}><LogOut size={13}/>Abmelden</button>
        </div>
      </aside>

      {/* Main area */}
      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{PAGE_TITLES[page] || BRAND.product}</span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {isSme && !apiKey && (
              <button className="btn btn-ghost btn-sm" onClick={()=>setPage('settings')}>
                <Zap size={13}/>KI aktivieren
              </button>
            )}
            {isSme && apiKey && <span className="badge badge-ok" style={{fontSize:11}}>🤖 KI aktiv</span>}
            <button className="btn btn-ghost btn-sm" style={{width:32,padding:0,justifyContent:'center'}}>
              <Bell size={15}/>
            </button>
            <select value={lang} onChange={e=>setLang(e.target.value)} className="form-select" style={{width:'auto',fontSize:12,padding:'4px 8px',height:32}}>
              <option value="de">🇩🇪 DE</option>
              <option value="en">🇬🇧 EN</option>
            </select>
            <TourButton role={role} onNavigate={setPage}/>
          </div>
        </header>
        <main className="content">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
