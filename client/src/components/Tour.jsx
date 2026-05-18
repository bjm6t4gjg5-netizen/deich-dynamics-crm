import { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { BRAND } from '../brand.js';

const TOURS = {

  // ── 🏢 Unternehmen ────────────────────────────────────────────────────────────
  unternehmen: [
    {
      icon: '👋', page: null,
      title: `Willkommen bei ${BRAND.name}!`,
      body: 'Ihr persönliches CRM & Buchhaltungstool — gemacht für Deutschland. Diese Tour zeigt Ihnen in 9 Schritten alles Wichtige. Dauert ca. 2 Minuten.',
      tip: null,
    },
    {
      icon: '📊', page: 'dashboard',
      title: 'Dashboard — Ihr Überblick',
      body: 'Alle wichtigen Kennzahlen auf einen Blick: offene Rechnungen, Umsatz, Pipeline-Wert und Lageralarme. Klicken Sie auf jede Kachel um direkt zur jeweiligen Seite zu springen.',
      tip: '💡 Rote Zahlen = Handlungsbedarf. Grün = alles in Ordnung.',
    },
    {
      icon: '👥', page: 'customers',
      title: 'Kunden verwalten',
      body: 'Legen Sie Kunden mit allen wichtigen Daten an: Adresse, Geburtstag, Steuer-ID und Notizen. Jeder Kunde hat eine eigene Seite mit Rechnungshistorie. Verbinden Sie Kunden über Empfehlungen — wer hat wen gebracht?',
      tip: '💡 Klicken Sie auf einen Kunden-Eintrag um alle Details zu öffnen.',
    },
    {
      icon: '📄', page: 'invoices',
      title: 'Rechnungen erstellen & versenden',
      body: 'Rechnung in Sekunden erstellen, als PDF drucken oder per E-Mail direkt an den Kunden senden. Mahnungen (1., 2., 3. Stufe) ebenfalls aus der App. Status wird automatisch aktualisiert.',
      tip: '💡 Klicken Sie auf eine Rechnungszeile für Vorschau, Senden und Bearbeiten.',
    },
    {
      icon: '🧾', page: 'expenses',
      title: 'Belege & Ausgaben',
      body: 'Erfassen Sie alle Ausgaben und laden Sie ein Foto des Belegs hoch. Falls KI aktiv ist: Foto hochladen → Felder werden automatisch ausgefüllt. Fehlende Belege werden rot markiert — wichtig für GoBD-konforme Buchführung.',
      tip: '💡 Roter „Fehlt"-Button in der Tabelle = Foto fehlt. Einfach anklicken.',
    },
    {
      icon: '🎯', page: 'pipeline',
      title: 'Sales Pipeline',
      body: 'Verfolgen Sie alle Angebote als Kanban-Board. Deals per Drag & Drop verschieben. Wenn ein Deal auf „Gewonnen" landet, können Sie sofort eine Rechnung erstellen.',
      tip: '💡 Klicken Sie auf eine Deal-Karte um Details zu bearbeiten und Wahrscheinlichkeit anzupassen.',
    },
    {
      icon: '📦', page: 'inventory',
      title: 'Inventar & Lager',
      body: 'Artikel anlegen, Wareneingänge und -ausgänge buchen. Das System berechnet LIFO und FIFO-Bewertung für Ihren Jahresabschluss. Bei bezahlter Rechnung wird das Lager automatisch abgezogen.',
      tip: '💡 Klicken Sie auf einen Artikel für die komplette Bewegungshistorie.',
    },
    {
      icon: '📤', page: 'settings',
      title: 'Monatsabschluss an Steuerberater',
      body: 'Unter Einstellungen → Monat auswählen → ZIP herunterladen. Darin: alle Rechnungen und Belege als CSV und HTML-Zusammenfassung. Ihr Steuerberater bekommt damit alles was er braucht.',
      tip: '💡 Steuerberater-ID in Einstellungen eintragen um direkt verbunden zu sein.',
    },
    {
      icon: '🚀', page: null,
      title: 'Sie sind startklar!',
      body: 'Das war die Tour. Der KI-Assistent beantwortet Steuerfragen — auch ohne KI-Key steht das Steuer-FAQ jederzeit zur Verfügung. Tour jederzeit über Einstellungen → „Tour neu starten" erneut aufrufen.',
      tip: null,
    },
  ],

  // ── 📊 Steuerberater ──────────────────────────────────────────────────────────
  steuerberater: [
    {
      icon: '👋', page: null,
      title: 'Willkommen, Steuerberater!',
      body: `${BRAND.product} ist Ihre zentrale Plattform für die Mandantenverwaltung. Sie legen Mandanten an, steuern deren Modulzugriff und erhalten automatisch Provisionen auf alle bezahlten Rechnungen.`,
      tip: null,
    },
    {
      icon: '👥', page: 'stb',
      title: 'Mandanten anlegen',
      body: 'Über „Mandant anlegen" erstellen Sie einen neuen Unternehmens-Account mit eigenem Login. Der Mandant sieht sein Portal sofort — in Ihren Kanzleifarben und mit Ihrem Logo.',
      tip: '💡 Roter Beleg-Indikator bei einem Mandanten = fehlende Belege → sofort im Blick.',
    },
    {
      icon: '🔍', page: 'stb',
      title: 'Mandanten-Details einsehen',
      body: 'Klicken Sie auf einen Mandanten: Sie sehen alle Rechnungen, Belege, offene Beträge und fehlende Dokumente. Unter dem Tab „Module" können Sie einzelne Funktionen für diesen Mandanten freischalten oder sperren.',
      tip: '💡 Tabs: Übersicht · Rechnungen · Belege · Module · KI-Analyse',
    },
    {
      icon: '⚙️', page: 'stb',
      title: 'Module pro Mandant steuern',
      body: 'Für jeden Mandanten individuell: CRM, Rechnungen, Belege, Inventar, Pipeline und KI-Assistent ein- oder ausschalten. Mandanten sehen nur die freigeschalteten Bereiche in ihrem Portal.',
      tip: '💡 Als Steuerberater haben Sie jederzeit die vollständige Kontrolle.',
    },
    {
      icon: '💰', page: 'stb',
      title: 'Ihre Provisionen',
      body: 'Sie erhalten automatisch Provision auf alle bezahlten Rechnungen Ihrer Mandanten. Standard: 25% (vom Plattform-Betreiber konfigurierbar pro StB). Unter „Provisionen" sehen Sie die Aufschlüsselung pro Mandant.',
      tip: '💡 Nur Rechnungen mit Status „Bezahlt" zählen zur Provisionsbasis.',
    },
    {
      icon: '🤖', page: 'stb',
      title: 'KI-Analyse pro Mandant',
      body: 'Klicken Sie auf einen Mandanten → Tab „KI-Analyse": Claude analysiert automatisch Buchungsstand, offene Beträge und fehlende Belege — und gibt Empfehlungen für das nächste Mandantengespräch.',
      tip: '💡 KI-Key wird vom Plattform-Admin für Ihr Konto aktiviert.',
    },
    {
      icon: '✉️', page: 'stbsettings',
      title: 'E-Mail & Integrationen',
      body: `Damit Rechnungen und Mahnungen Ihrer Mandanten direkt aus ${BRAND.product} versendet werden können, konfigurieren Sie hier Ihren Mailserver (SMTP, SendGrid oder Resend) sowie DATEV-Export und SEPA-Optionen.`,
      tip: '💡 Ohne Mailkonfiguration können Ihre Mandanten keine E-Mails versenden.',
    },
    {
      icon: '🎨', page: 'appearance',
      title: 'Ihr Kanzlei-Branding',
      body: 'Laden Sie Ihr Kanzlei-Logo hoch und wählen Sie Ihre Farben aus 24 Paletten. Alle Mandanten sehen Ihr Branding — in der Sidebar, auf Rechnungen und in E-Mails. Änderungen wirken sofort.',
      tip: '💡 Jeder Mandant kann zusätzlich sein eigenes Logo hinterlegen.',
    },
    {
      icon: '🚀', page: 'stb',
      title: 'Bereit!',
      body: 'Legen Sie jetzt Ihren ersten Mandanten an. Die Tour können Sie jederzeit über das ❓-Symbol in der Topbar erneut aufrufen.',
      tip: null,
    },
  ],

  // ── 🛡️ Super-Admin ────────────────────────────────────────────────────────────
  superadmin: [
    {
      icon: '🛡️', page: null,
      title: 'Willkommen, Super-Admin!',
      body: `Sie haben vollen Zugriff auf die gesamte ${BRAND.product}-Plattform. Hier verwalten Sie alle Steuerberater, deren Mandanten, die Modulrechte und die Provisionsabrechnung.`,
      tip: null,
    },
    {
      icon: '📊', page: 'admin',
      title: 'Plattform-Übersicht',
      body: 'Das Admin-Dashboard zeigt in Echtzeit: Anzahl Steuerberater, Unternehmen, Gesamtrechnungsvolumen und die kumulierten Plattform-Provisionen über alle Steuerberater.',
      tip: null,
    },
    {
      icon: '👤', page: 'admin',
      title: 'Steuerberater anlegen',
      body: 'Unter „Steuerberater" → „Neuer StB": Name, E-Mail, Passwort, Kanzleiname und Provisionssatz eingeben. Der Account ist sofort aktiv. Steuerberater können sich NICHT selbst registrieren — sie kommen immer über Sie.',
      tip: '💡 Provisionssatz ist pro Steuerberater individuell einstellbar (Standard: 25%).',
    },
    {
      icon: '⚙️', page: 'admin',
      title: 'Features & Module steuern',
      body: 'Per Klick auf das Edit-Symbol können Sie für jeden Steuerberater festlegen welche Features freigeschaltet sind (KI, DATEV, Provisionsübersicht) und für jedes Unternehmen welche Module aktiv sind.',
      tip: '💡 KI-Key pro Unternehmen: Admin → Unternehmen → Edit-Icon.',
    },
    {
      icon: '💰', page: 'admin',
      title: 'Provisionsabrechnung',
      body: 'Unter „Provisionen" sehen Sie für jeden Steuerberater: Mandantenanzahl, bezahltes Rechnungsvolumen und die daraus resultierende Provision in Euro. Dies ist die Basis für die monatliche Auszahlung an die Steuerberater.',
      tip: '💡 Nur Rechnungen mit Status „Bezahlt" zählen zur Provisionsbasis.',
    },
    {
      icon: '🏢', page: 'admin',
      title: 'Unternehmen direkt verwalten',
      body: 'Unter „Unternehmen" sehen Sie alle registrierten Firmen, deren Steuerberater-Zuordnung, Rechnungsvolumen und letzten Login. Sie können Accounts einem anderen Steuerberater zuweisen oder Module direkt anpassen.',
      tip: null,
    },
    {
      icon: '🚀', page: 'admin',
      title: 'Plattform bereit!',
      body: 'Starten Sie jetzt mit dem ersten Steuerberater. Die Tour können Sie jederzeit über das ❓-Symbol in der Topbar erneut aufrufen.',
      tip: null,
    },
  ],
};

const STORAGE_KEY = 'dd_tour_v2';

export function TourButton({ role, onNavigate }) {
  const [open, setOpen] = useState(false);
  const roleKey = role || 'unternehmen';

  useEffect(() => {
    try {
      // Legacy migration — pre-rebrand key
      const legacy = localStorage.getItem('kontorly_tour_v2');
      if (legacy && !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem('kontorly_tour_v2');
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

function Tour({ role, onClose, onNavigate }) {
  const steps   = TOURS[role] || TOURS.unternehmen;
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast  = step === steps.length - 1;

  const roleMeta = {
    unternehmen:   { label: '🏢 Unternehmen',    bg: '#1d3f36' },
    steuerberater: { label: '📊 Steuerberater',  bg: '#14302a' },
    superadmin:    { label: '🛡️ Super-Admin',    bg: '#7b0d1e' },
  }[role] || { label: '', bg: '#1d3f36' };

  const next = () => {
    if (current.page && onNavigate) onNavigate(current.page);
    if (isLast) { onClose(); return; }
    setStep(s => s + 1);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 16px 28px',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-xl)', width: '100%', maxWidth: 500,
        padding: '24px 26px', position: 'relative',
        animation: 'tourUp .3s cubic-bezier(.16,1,.3,1)',
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 12, background: 'none',
          border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex',
          padding: 4, borderRadius: 6,
        }}><X size={16} /></button>

        {/* Role badge */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', background: roleMeta.bg,
          color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.8px',
          textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20, marginBottom: 14,
        }}>
          {roleMeta.label}
        </span>

        {/* Progress bar — clickable */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              height: 4, flex: 1, borderRadius: 2, cursor: 'pointer',
              background: i < step ? 'var(--primary)' : i === step ? 'var(--accent)' : 'var(--border)',
              transition: 'background .2s',
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ fontSize: 38, marginBottom: 8, lineHeight: 1 }}>{current.icon}</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, marginBottom: 8 }}>
          {current.title}
        </h2>
        <p style={{ color: 'var(--ink2)', fontSize: 13.5, lineHeight: 1.75, marginBottom: current.tip ? 12 : 22 }}>
          {current.body}
        </p>

        {/* Tip */}
        {current.tip && (
          <div style={{
            background: 'var(--primary-lt)', borderRadius: 'var(--r)',
            padding: '9px 12px', fontSize: 13, color: 'var(--primary)',
            marginBottom: 20, lineHeight: 1.6, borderLeft: '3px solid var(--primary)',
          }}>
            {current.tip}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ color: 'var(--ink4)', fontSize: 12 }}>
            Überspringen
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--ink4)', marginRight: 4 }}>{step + 1}/{steps.length}</span>
            {step > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(s => s - 1)}>
                <ArrowLeft size={12} /> Zurück
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={next}>
              {isLast ? <><CheckCircle size={13} /> Los geht's!</> : <>Weiter <ArrowRight size={13} /></>}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes tourUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}
