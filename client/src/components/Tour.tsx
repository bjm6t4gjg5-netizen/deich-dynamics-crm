import { useState, useEffect, useRef } from 'react';
import { X, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { BRAND } from '../brand';

/**
 * Tour — interactive walkthrough with element highlighting.
 *
 * Each step can name a CSS selector (`target`); when set, we find that element
 * in the DOM, render a transparent cut-out around it (via a 4-strip overlay)
 * and position the tour card next to it. Without `target`, the card centers
 * on screen as a regular modal.
 *
 * Steps are role-specific — unternehmen, steuerberater, superadmin each get
 * their own narrative tailored to what's on screen for that role.
 */

interface Step {
  icon: string;
  title: string;
  body: string;
  tip?: string | null;
  page?: string | null;
  target?: string;
}

const TOURS: Record<string, Step[]> = {
  unternehmen: [
    { icon: '👋', title: `Willkommen bei ${BRAND.name}!`,
      body: 'Dein Buchhaltungs- und CRM-Tool für Deutschland. Diese Tour zeigt dir die wichtigsten Funktionen — du kannst sie jederzeit abbrechen oder später erneut starten.', page: null },
    { icon: '📊', title: 'Dein Dashboard',
      body: 'Alle wichtigen Kennzahlen auf einen Blick: Umsatz, offene Beträge, überfällige Rechnungen, Pipeline-Wert. Klicke auf eine Kachel um direkt zur gefilterten Liste zu springen.',
      tip: '💡 Die roten Zahlen zeigen Handlungsbedarf.', page: 'dashboard', target: '.stats-grid' },
    { icon: '🔔', title: 'Benachrichtigungen',
      body: 'Die Glocke oben rechts zeigt dir offene Mahnungen, fehlende Belege und Lager-Warnungen mit einem Klick.', page: 'dashboard', target: '.topbar' },
    { icon: '⌘K', title: 'Globale Suche',
      body: 'Mit Cmd+K (Mac) oder Strg+K (Windows) öffnest du die globale Suche — findet alles: Kunden, Rechnungen, Belege, Seiten.', page: 'dashboard' },
    { icon: '👥', title: 'Kunden verwalten',
      body: 'Lege Kunden mit allen Daten an — Adresse, Steuer-ID, Notizen. Beim Anlegen kannst du sie einer Gruppe zuordnen, die du im Gruppen-Manager selbst definierst.',
      tip: '💡 Klicke auf eine Kundenzeile für die Detail-Ansicht mit Tabs.', page: 'customers', target: '.card' },
    { icon: '🎯', title: 'Pipeline',
      body: 'Deine Verkaufschancen als Kanban-Board. Spalten frei konfigurierbar. Wenn ein Deal auf „Gewonnen" gezogen wird, kannst du direkt eine Rechnung erstellen — mit allen Daten vorausgefüllt.', page: 'pipeline', target: '.board' },
    { icon: '📄', title: 'Rechnungen',
      body: 'Rechnungen mit mehreren Positionen anlegen — jede Position aus dem Inventar oder als Sonderposten. Jede Position kann eine eigene MwSt haben. Versand direkt per Mail aus der Vorschau.', page: 'invoices' },
    { icon: '⏰', title: 'Mahnstufen',
      body: 'Bei jeder offenen Rechnung findest du den Tab „Mahnungen" mit Vorschau aller Mahnstufen. Die Stufen-Konfiguration findest du in den Einstellungen.', page: 'invoices' },
    { icon: '🧾', title: 'Belege & Inventar',
      body: 'Belege erfassen, optional mit Foto + KI-Scan. Inventar-Artikel werden bei jeder bezahlten Rechnung automatisch abgezogen — außer bei unlimited Items (Lizenzen, Dienstleistungen).', page: 'expenses' },
    { icon: '📧', title: 'Postfach & Mail',
      body: 'IMAP-Postfach pro Unternehmen — Mahnungen und Rechnungen gehen über deinen eigenen Account raus, nicht über uns. Konfiguration unter Einstellungen → Postfach.', page: 'mailbox' },
    { icon: '🚀', title: 'Du bist startklar!',
      body: 'Die Tour startest du jederzeit über den ❓-Button in der Topbar erneut. Bei Fragen: Einstellungen → Hilfe, oder schreib uns direkt.' },
  ],
  steuerberater: [
    { icon: '👋', title: `Willkommen, Steuerberater!`,
      body: `${BRAND.product} ist deine zentrale Plattform für die Mandantenverwaltung. Du legst Mandanten an, steuerst deren Modul-Zugriff und siehst deren Aktivität.`, page: null },
    { icon: '👥', title: 'Mandanten',
      body: 'Neuer Mandant: über „Mandant anlegen". Klicke auf eine Mandanten-Zeile für Detail-View mit Tabs (Übersicht, Rechnungen, Belege, Module, Notizen, KI-Analyse).', page: 'stb', target: '.card' },
    { icon: '📝', title: 'Notizen pro Mandant',
      body: 'Im Mandanten-Detail findest du den Tab „Notizen" — interne Notizen, nur für die Kanzlei sichtbar. Ideal für Mandantengespräche und To-Dos.', page: 'stb' },
    { icon: '🎨', title: 'Kanzlei-Branding',
      body: 'Unter „Erscheinungsbild" lädst du dein Logo hoch und wählst Farben — deine Mandanten sehen dein Branding in ihrem Portal und auf Rechnungen.', page: 'appearance' },
    { icon: '🧾', title: 'DATEV & Integrationen',
      body: 'DATEV-Buchungsstapel-Export, ELSTER-Vorbereitung, SEPA. Mail-Versand wird vom Mandanten selbst konfiguriert (jeder hat sein eigenes Postfach).', page: 'stbsettings' },
    { icon: '💰', title: 'Provisionen',
      body: 'Du erhältst automatisch Provision auf alle bezahlten Rechnungen deiner Mandanten — Standard 25%, konfigurierbar pro StB durch den Plattform-Admin.', page: 'stb' },
  ],
  superadmin: [
    { icon: '🛡️', title: 'Super-Admin-Konsole',
      body: 'Du hast Vollzugriff auf die Plattform: alle Steuerberater, alle Unternehmen, Provisionsabrechnung, Audit-Log.', page: 'admin' },
    { icon: '👤', title: 'Steuerberater anlegen',
      body: 'Unter „Steuerberater" → Neuer StB. Provisionssatz pro StB einstellbar (Default 25%). StBs können sich nicht selbst registrieren — sie kommen über dich.', page: 'admin' },
    { icon: '⚙️', title: 'Features & Module',
      body: 'Pro StB konfigurierbar: KI-Modul, DATEV, Provisionsübersicht. Pro Unternehmen: welche Module verfügbar sind (Inventar, Pipeline, Belege, etc.).', page: 'admin' },
    { icon: '📋', title: 'Audit-Log',
      body: 'Der Tab „Audit-Log" zeigt alle sicherheitsrelevanten Aktionen: Logins, Registrierungen, Passwort-Änderungen. Mit Filter und Suche.', page: 'admin' },
  ],
};

const STORAGE_KEY = 'dd_tour_v3';

export function TourButton({ role, onNavigate }: { role: string; onNavigate?: (page: string) => void }) {
  const [open, setOpen] = useState(false);
  const roleKey = role || 'unternehmen';

  useEffect(() => {
    try {
      const legacy = localStorage.getItem('kontorly_tour_v2') || localStorage.getItem('dd_tour_v2');
      if (legacy && !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, legacy);
      }
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Hilfe-Tour starten">
        ❓ Tour
      </button>
      {open && <Tour role={roleKey} onClose={close} onNavigate={onNavigate} />}
    </>
  );
}

function Tour({ role, onClose, onNavigate }: { role: string; onClose: () => void; onNavigate?: (page: string) => void }) {
  const steps: Step[] = TOURS[role] || TOURS.unternehmen;
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const current = steps[step];
  const isLast = step === steps.length - 1;

  // Navigate to the step's page *before* trying to find the target element,
  // so the DOM reflects the new view by the time we measure.
  useEffect(() => {
    if (current.page && onNavigate) onNavigate(current.page);
  }, [step]);

  // Locate target element after a tick for layout to settle.
  useEffect(() => {
    if (!current.target) { setTargetRect(null); return; }
    const measure = () => {
      const el = document.querySelector(current.target!);
      if (el) setTargetRect(el.getBoundingClientRect());
      else setTargetRect(null);
    };
    const t = setTimeout(measure, 100);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [step, current.target]);

  const roleMeta = ({
    unternehmen:   { label: '🏢 Unternehmen',   bg: '#1d3f36' },
    steuerberater: { label: '📊 Steuerberater', bg: '#14302a' },
    superadmin:    { label: '🛡️ Super-Admin',   bg: '#7b0d1e' },
  } as any)[role] || { label: '', bg: '#1d3f36' };

  const next = () => {
    if (isLast) { onClose(); return; }
    setStep((s) => s + 1);
  };

  // Position card so it never overlaps the highlighted element. Try positions
  // in priority order: right → left → below → above. Fall back to centered
  // if nothing fits.
  const cardStyle: React.CSSProperties = (() => {
    if (!targetRect) {
      return {
        position: 'fixed',
        left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(500px, 92vw)',
      };
    }
    const margin = 20;
    const cardW = 400;
    const cardH = 340; // approx; the card auto-fits content
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const fitsRight  = targetRect.right + cardW + margin < winW;
    const fitsLeft   = targetRect.left - cardW - margin > 0;
    const fitsBelow  = targetRect.bottom + cardH + margin < winH;
    const fitsAbove  = targetRect.top - cardH - margin > 0;

    if (fitsRight) {
      const top = Math.min(Math.max(margin, targetRect.top), winH - cardH - margin);
      return { position: 'fixed', left: targetRect.right + margin, top, width: cardW };
    }
    if (fitsLeft) {
      const top = Math.min(Math.max(margin, targetRect.top), winH - cardH - margin);
      return { position: 'fixed', left: targetRect.left - cardW - margin, top, width: cardW };
    }
    if (fitsBelow) {
      const left = Math.min(Math.max(margin, targetRect.left), winW - cardW - margin);
      return { position: 'fixed', top: targetRect.bottom + margin, left, width: cardW };
    }
    if (fitsAbove) {
      const left = Math.min(Math.max(margin, targetRect.left), winW - cardW - margin);
      return { position: 'fixed', top: targetRect.top - cardH - margin, left, width: cardW };
    }
    // Last-ditch: anchor bottom-right where there's most likely room.
    return { position: 'fixed', right: margin, bottom: margin, width: cardW };
  })();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none' }}>
      {/* Overlay strips around the target — leaves the target itself clear. */}
      {targetRect ? (
        <>
          {[
            { top: 0, left: 0, width: '100vw', height: targetRect.top },
            { top: targetRect.top, left: 0, width: targetRect.left, height: targetRect.height },
            { top: targetRect.top, left: targetRect.right, width: window.innerWidth - targetRect.right, height: targetRect.height },
            { top: targetRect.bottom, left: 0, width: '100vw', height: window.innerHeight - targetRect.bottom },
          ].map((s, i) => (
            <div key={i} style={{ position: 'fixed', background: 'rgba(15,17,23,0.55)', pointerEvents: 'auto', ...s as any }} onClick={onClose} />
          ))}
          {/* Highlight ring around the target */}
          <div style={{
            position: 'fixed',
            top: targetRect.top - 4, left: targetRect.left - 4,
            width: targetRect.width + 8, height: targetRect.height + 8,
            border: '3px solid var(--accent)',
            borderRadius: 12,
            boxShadow: '0 0 0 4px rgba(168,197,180,.25), 0 8px 32px rgba(0,0,0,.25)',
            pointerEvents: 'none',
          }} />
        </>
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,23,0.45)', pointerEvents: 'auto' }} onClick={onClose} />
      )}

      {/* The tour card */}
      <div style={{
        ...cardStyle,
        background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow-xl)',
        padding: '22px 24px', pointerEvents: 'auto', zIndex: 1001,
        animation: 'tourPop .25s cubic-bezier(.16,1,.3,1)',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 10, right: 10, background: 'none',
          border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex',
          padding: 4, borderRadius: 6,
        }}><X size={16} /></button>

        <span style={{
          display: 'inline-flex', alignItems: 'center', background: roleMeta.bg,
          color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.8px',
          textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20, marginBottom: 12,
        }}>
          {roleMeta.label}
        </span>

        <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              height: 4, flex: 1, borderRadius: 2, cursor: 'pointer',
              background: i < step ? 'var(--primary)' : i === step ? 'var(--accent)' : 'var(--border)',
              transition: 'background .2s',
            }} />
          ))}
        </div>

        <div style={{ fontSize: 32, marginBottom: 8, lineHeight: 1 }}>{current.icon}</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          {current.title}
        </h2>
        <p style={{ color: 'var(--ink2)', fontSize: 13.5, lineHeight: 1.7, marginBottom: current.tip ? 12 : 20 }}>
          {current.body}
        </p>

        {current.tip && (
          <div style={{
            background: 'var(--primary-lt)', borderRadius: 'var(--r)',
            padding: '9px 12px', fontSize: 12.5, color: 'var(--primary)',
            marginBottom: 18, lineHeight: 1.6, borderLeft: '3px solid var(--primary)',
          }}>
            {current.tip}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ color: 'var(--ink4)', fontSize: 12 }}>
            Überspringen
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--ink4)', marginRight: 4 }}>{step + 1}/{steps.length}</span>
            {step > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft size={12} /> Zurück
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={next}>
              {isLast ? <><CheckCircle size={13} /> Los geht's!</> : <>Weiter <ArrowRight size={13} /></>}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes tourPop{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
