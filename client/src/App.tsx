import { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { useLang } from './context/LangContext';
import { track } from './api';
import { TourButton } from './components/Tour';
import { NotificationBell } from './components/NotificationDrawer';
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
import Marketing from './pages/sme/Marketing';
import Finance from './pages/sme/Finance';
import Mailbox from './pages/sme/Mailbox';
import Quotes from './pages/sme/Quotes';
import Recurring from './pages/sme/Recurring';
import { Pipeline, AIChat } from './pages/sme/OtherPages';
import { CommandPalette } from './components/CommandPalette';
import { OnboardingWizard } from './components/OnboardingWizard';

import {
  LayoutDashboard, Users, TrendingUp, FileText, Receipt, Package, Zap,
  LogOut, Settings as SettingsIcon, Palette, Users2, Shield,
  Megaphone, Banknote, Inbox, FileSignature, Repeat, Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard', customers: 'Kunden', pipeline: 'Pipeline',
  invoices: 'Rechnungen', expenses: 'Belege', inventory: 'Inventar',
  ai: 'KI-Assistent', appearance: 'Erscheinungsbild', settings: 'Einstellungen',
  admin: 'Super-Admin', stb: 'Mandanten', stbsettings: 'DATEV & Integrationen',
  marketing: 'Marketing & Kampagnen', finance: 'Finanzen', mailbox: 'Postfach',
  quotes: 'Angebote', recurring: 'Abos',
};

interface NavItem { id: string; label: string; Icon: LucideIcon }
interface NavSection { label: string; items: NavItem[] }

// localStorage key for the user's custom sidebar ordering.
const NAV_ORDER_KEY = 'dd_nav_order_v1';

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveOrder(order: string[]): void {
  try { localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}

/** Sort a section's items by the user's saved order. Items not in the saved
 *  order list keep their original position (appended at the end of the known
 *  ones). This way new features added later don't disappear because the saved
 *  order doesn't know about them yet. */
function applyOrder(items: NavItem[], order: string[]): NavItem[] {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const ordered: NavItem[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) { ordered.push(item); byId.delete(id); }
  }
  // anything not in saved order keeps its declared position
  for (const it of items) {
    if (byId.has(it.id)) ordered.push(it);
  }
  return ordered;
}

export default function App() {
  const { user, profile, loading, logout, theme, apiKey, refreshProfile } = useApp() as any;
  const { lang, setLang, t } = useLang();
  const [page, setPage] = useState('dashboard');
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Per-section drag-and-drop reorder state
  const [order, setOrder] = useState<string[]>(() => loadOrder());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Cross-page navigation hint — e.g. dashboard stat clicks pass a desired
  // filter for the target page. Pages can read this and reset their own state.
  const [navHint, setNavHint] = useState<unknown>(null);
  const navigate = (target: string, hint?: unknown) => {
    setNavHint(hint ?? null);
    setPage(target);
    try { track(`page:${target}`, 'page'); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!user) return;
    if (user.role === 'superadmin')         setPage('admin');
    else if (user.role === 'steuerberater') setPage('stb');
    else                                    setPage('dashboard');
  }, [user?.id]);

  if (loading) return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'var(--font-display)', color: 'var(--ink3)', gap: 14,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, background: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 24, boxShadow: '0 4px 18px rgba(29,63,54,.3)',
      }}>M</div>
      <div style={{ fontSize: 18 }}>{BRAND.product} wird geladen…</div>
    </div>
  );

  if (!user) return <Login />;

  const role    = user.role;
  const isSme   = role === 'unternehmen';
  const isStb   = role === 'steuerberater';
  const isAdmin = role === 'superadmin';

  let modules: Record<string, boolean> = {
    contacts: true, pipeline: true, invoices: true, expenses: true, inventory: true, ai: true,
  };
  if (isSme && profile?.modules) {
    try { modules = JSON.parse(profile.modules); } catch { /* keep defaults */ }
  }

  // ── Build sidebar sections by role ──────────────────────────────────────
  const navSections: NavSection[] = [];

  if (isAdmin) {
    navSections.push({
      label: t('nav_system'),
      items: [{ id: 'admin', label: t('admin_console'), Icon: Shield }],
    });
  }

  if (isStb) {
    navSections.push({
      label: t('nav_clients_section'),
      items: [{ id: 'stb', label: t('clients'), Icon: Users2 }],
    });
    navSections.push({
      label: t('nav_firm'),
      items: [
        { id: 'appearance',  label: t('appearance'),         Icon: Palette },
        { id: 'stbsettings', label: t('datev_integrations'), Icon: SettingsIcon },
        { id: 'settings',    label: t('settings'),           Icon: SettingsIcon },
      ],
    });
  }

  if (isSme) {
    navSections.push({
      label: t('nav_overview'),
      items: [
        { id: 'dashboard', label: t('dashboard'), Icon: LayoutDashboard },
        { id: 'mailbox',   label: t('mailbox'),   Icon: Inbox },
      ],
    });

    const vertrieb: NavItem[] = [];
    if (modules.contacts)  vertrieb.push({ id: 'customers', label: t('customers'), Icon: Users });
    if (modules.pipeline)  vertrieb.push({ id: 'pipeline',  label: t('pipeline'),  Icon: TrendingUp });
    vertrieb.push({ id: 'marketing', label: t('marketing'), Icon: Megaphone });
    if (vertrieb.length) navSections.push({ label: t('nav_sales'), items: vertrieb });

    const buchhaltung: NavItem[] = [];
    if (modules.invoices) {
      buchhaltung.push({ id: 'invoices',  label: t('invoices'),  Icon: FileText });
      buchhaltung.push({ id: 'quotes',    label: t('quotes'),    Icon: FileSignature });
      buchhaltung.push({ id: 'recurring', label: t('recurring'), Icon: Repeat });
    }
    if (modules.expenses)  buchhaltung.push({ id: 'expenses', label: t('expenses'), Icon: Receipt });
    buchhaltung.push({ id: 'finance', label: t('finance'), Icon: Banknote });
    if (modules.inventory) buchhaltung.push({ id: 'inventory', label: t('inventory'), Icon: Package });
    if (buchhaltung.length) navSections.push({ label: t('nav_accounting'), items: buchhaltung });

    if (modules.ai) {
      navSections.push({
        label: t('nav_assistants'),
        items: [{ id: 'ai', label: t('ai_assistant'), Icon: Zap }],
      });
    }

    navSections.push({
      label: t('nav_account'),
      items: [
        { id: 'appearance', label: t('appearance'), Icon: Palette },
        { id: 'settings',   label: t('settings'),   Icon: SettingsIcon },
      ],
    });
  }

  // Apply saved ordering inside each section
  const orderedSections = navSections.map((sec) => ({
    ...sec,
    items: applyOrder(sec.items, order),
  }));

  // ── Drag handlers ───────────────────────────────────────────────────────
  const onDragStart = (id: string) => setDragId(id);
  const onDragEnd = () => { setDragId(null); setDragOverId(null); };
  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (overId !== dragOverId) setDragOverId(overId);
  };
  const onDrop = (overId: string) => {
    if (!dragId || dragId === overId) { onDragEnd(); return; }
    // Build a new order from the union of current ordering + section items
    // (so unknown items get a stable position too).
    const allIds = orderedSections.flatMap((s) => s.items.map((i) => i.id));
    const filtered = allIds.filter((id) => id !== dragId);
    const overIdx = filtered.indexOf(overId);
    const newOrder = [
      ...filtered.slice(0, overIdx),
      dragId,
      ...filtered.slice(overIdx),
    ];
    setOrder(newOrder);
    saveOrder(newOrder);
    onDragEnd();
  };

  // ── Page renderer ───────────────────────────────────────────────────────
  const renderPage = () => {
    if (isAdmin) return <AdminPortal />;

    if (isStb) {
      if (page === 'appearance')  return <Appearance role="steuerberater" />;
      if (page === 'stbsettings') return <StbSettings />;
      if (page === 'settings')    return <Settings />;
      return <StbPortal />;
    }

    switch (page) {
      case 'customers':  return <Customers onNavigate={navigate} />;
      case 'pipeline':   return <Pipeline   onNavigate={navigate} />;
      case 'invoices':   return <Invoices initialFilter={typeof navHint === 'string' ? navHint : undefined} initialPrefill={typeof navHint === 'object' ? navHint : undefined} onNavigate={navigate} />;
      case 'expenses':   return <Expenses />;
      case 'inventory':  return <Inventory />;
      case 'marketing':  return <Marketing />;
      case 'finance':    return <Finance onNavigate={navigate} />;
      case 'mailbox':    return <Mailbox />;
      case 'quotes':     return <Quotes onNavigate={navigate} />;
      case 'recurring':  return <Recurring onNavigate={navigate} />;
      case 'ai':         return <AIChat apiKey={apiKey} onGoSettings={() => setPage('settings')} />;
      case 'appearance': return <Appearance role="unternehmen" />;
      case 'settings':   return <Settings />;
      default:           return <Dashboard onNavigate={navigate} />;
    }
  };

  const sbBg = theme.color;

  return (
    <div className="app">
      <aside className="sidebar" style={{ background: sbBg }}>
        <div className="sb-logo">
          {theme.logo
            ? <img src={theme.logo} alt="Logo" style={{ height: 30, maxWidth: 140, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            : <div className="sb-mark">{BRAND.name}</div>
          }
          <div className="sb-sub">
            {isAdmin ? 'Platform Admin'
              : isStb  ? profile?.firm_name || 'Steuerberater'
              :          profile?.firm_name || 'Mein Unternehmen'}
          </div>
        </div>

        <div className="sb-badge">
          {isAdmin ? '🛡️ Super-Admin' : isStb ? '📊 Steuerberater' : '🏢 Unternehmen'}
        </div>

        <nav className="nav">
          {orderedSections.map((section) => (
            <div key={section.label} className="nav-sect">
              <span className="nav-lbl">{section.label}</span>
              {section.items.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={[
                    'nav-item',
                    page === id ? 'active' : '',
                    dragId === id ? 'dragging' : '',
                    dragOverId === id ? 'drag-over' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => navigate(id)}
                  draggable
                  onDragStart={() => onDragStart(id)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => onDragOver(e, id)}
                  onDrop={() => onDrop(id)}
                  title="Ziehen zum Umordnen"
                >
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="sb-user">{user.email}</div>
          <button className="sb-logout" onClick={logout}><LogOut size={13} />Abmelden</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{PAGE_TITLES[page] || BRAND.product}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isSme && !apiKey && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPage('settings')}>
                <Zap size={13} />KI aktivieren
              </button>
            )}
            {isSme && apiKey && <span className="badge badge-ok" style={{ fontSize: 11 }}>🤖 KI aktiv</span>}
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              title="Globale Suche (Cmd+K)"
            >
              <Search size={13} />
              <kbd style={{ fontSize: 10, color: 'var(--ink3)', padding: '1px 4px', background: 'var(--bg2)', borderRadius: 3 }}>⌘K</kbd>
            </button>
            <NotificationBell enabled={isSme} onNavigate={setPage} />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as 'de' | 'en')}
              className="form-select"
              style={{ width: 'auto', fontSize: 12, padding: '4px 8px', height: 32 }}
            >
              <option value="de">🇩🇪 DE</option>
              <option value="en">🇬🇧 EN</option>
            </select>
            <TourButton role={role} onNavigate={setPage} />
          </div>
        </header>
        <main className="content">
          {renderPage()}
        </main>
      </div>
      <CommandPalette onNavigate={setPage} role={role} />
      {/* First-time onboarding: only for SME accounts without firm_name */}
      {isSme && profile && !profile.firm_name && !onboardingDismissed && (
        <OnboardingWizard
          profile={profile}
          onComplete={async () => {
            try { await refreshProfile?.(); } catch { /* ignore */ }
            setOnboardingDismissed(true);
          }}
        />
      )}
    </div>
  );
}
