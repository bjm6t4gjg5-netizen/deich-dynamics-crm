import { createContext, useContext, useState } from 'react';

const STORAGE_KEY = 'dd_lang';

const TRANSLATIONS = {
  de: {
    dashboard: 'Dashboard', customers: 'Kunden', pipeline: 'Pipeline',
    invoices: 'Rechnungen', expenses: 'Belege', inventory: 'Inventar',
    ai_assistant: 'KI-Assistent', appearance: 'Erscheinungsbild',
    settings: 'Einstellungen', clients: 'Mandanten', logout: 'Abmelden',
    save: 'Speichern', saved: 'Gespeichert!', cancel: 'Abbrechen',
    delete: 'Löschen', edit: 'Bearbeiten', create: 'Anlegen',
    close: 'Schließen', back: 'Zurück', next: 'Weiter', skip: 'Überspringen',
    search: 'Suchen…', loading: 'Lädt…', yes: 'Ja', no: 'Nein',
    expenses_title: 'Belege & Ausgaben',
    supplier: 'Lieferant', description: 'Beschreibung',
    category: 'Kategorie', date: 'Datum', net: 'Netto',
    vat: 'MwSt.', gross: 'Brutto', receipt: 'Beleg',
    receipt_present: '✓ Vorhanden', receipt_missing: 'Fehlt',
    upload_receipt: 'Foto/PDF hochladen',
    ai_scan: '🤖 KI-Scan',
    ai_scan_hint: 'KI analysiert Ihr Foto und füllt die Felder automatisch aus.',
    ai_not_active: 'KI nicht aktiv — Felder bitte manuell ausfüllen.',
    ai_scanning: 'KI analysiert Beleg…',
    new_expense: 'Neuer Beleg',
    missing_receipts: 'fehlen',
    invoice_number: 'Nummer', client: 'Kunde', service: 'Leistung',
    due_date: 'Fällig', status: 'Status', actions: 'Aktionen',
    new_invoice: 'Neue Rechnung', preview: 'Vorschau',
    send_invoice: 'Rechnung senden', send_reminder: 'Mahnung senden',
    mark_paid: 'Als bezahlt markieren', pdf_download: 'PDF',
    status_draft: 'Entwurf', status_open: 'Offen', status_paid: 'Bezahlt',
    status_overdue: 'Überfällig', status_cancelled: 'Storniert',
    status_active: 'Aktiv', status_lead: 'Lead', status_warm: 'Warm',
    status_inactive: 'Inaktiv',
    ai_title: 'KI-Assistent',
    ai_locked_msg: 'Der KI-Assistent ist nicht aktiviert. Bitte wenden Sie sich an Ihren Administrator oder Steuerberater um das KI-Paket freizuschalten.',
    ai_contact_admin: 'Kontakt zum Administrator',
    qa_title: 'Steuer-FAQ',
    qa_subtitle: 'Häufige Fragen zur deutschen Steuer — auch ohne KI verfügbar',
    ai_enabled_label: 'KI-Chat aktiv',
    ai_disabled_label: 'Nur FAQ (KI nicht aktiv)',
    ask_placeholder: 'Frage stellen…',
    send: 'Senden',
    monthly_export: 'Monatsabschluss-Export',
    my_tax_advisor: 'Mein Steuerberater',
    security: 'Sicherheit & Compliance',
    restart_tour: 'Einführungstour neu starten',
    api_key_label: 'Claude API-Key',
    api_key_managed: 'Der KI-Assistent wird von Ihrem Administrator aktiviert.',
    language: 'Sprache', language_de: 'Deutsch', language_en: 'English',
  },
  en: {
    dashboard: 'Dashboard', customers: 'Customers', pipeline: 'Pipeline',
    invoices: 'Invoices', expenses: 'Receipts', inventory: 'Inventory',
    ai_assistant: 'AI Assistant', appearance: 'Appearance',
    settings: 'Settings', clients: 'Clients', logout: 'Log out',
    save: 'Save', saved: 'Saved!', cancel: 'Cancel',
    delete: 'Delete', edit: 'Edit', create: 'Create',
    close: 'Close', back: 'Back', next: 'Next', skip: 'Skip',
    search: 'Search…', loading: 'Loading…', yes: 'Yes', no: 'No',
    expenses_title: 'Receipts & Expenses',
    supplier: 'Supplier', description: 'Description',
    category: 'Category', date: 'Date', net: 'Net',
    vat: 'VAT', gross: 'Total', receipt: 'Receipt',
    receipt_present: '✓ Uploaded', receipt_missing: 'Missing',
    upload_receipt: 'Upload photo/PDF',
    ai_scan: '🤖 AI Scan',
    ai_scan_hint: 'AI analyses your photo and fills in the fields automatically.',
    ai_not_active: 'AI not active — please fill in fields manually.',
    ai_scanning: 'AI is analysing receipt…',
    new_expense: 'New Receipt',
    missing_receipts: 'missing',
    invoice_number: 'Number', client: 'Client', service: 'Service',
    due_date: 'Due', status: 'Status', actions: 'Actions',
    new_invoice: 'New Invoice', preview: 'Preview',
    send_invoice: 'Send invoice', send_reminder: 'Send reminder',
    mark_paid: 'Mark as paid', pdf_download: 'PDF',
    status_draft: 'Draft', status_open: 'Open', status_paid: 'Paid',
    status_overdue: 'Overdue', status_cancelled: 'Cancelled',
    status_active: 'Active', status_lead: 'Lead', status_warm: 'Warm',
    status_inactive: 'Inactive',
    ai_title: 'AI Assistant',
    ai_locked_msg: 'The AI Assistant is not activated. Please contact your administrator or tax advisor to unlock the AI package.',
    ai_contact_admin: 'Contact administrator',
    qa_title: 'Tax FAQ',
    qa_subtitle: 'Common German tax questions — available without AI',
    ai_enabled_label: 'AI chat active',
    ai_disabled_label: 'FAQ only (AI not active)',
    ask_placeholder: 'Ask a question…',
    send: 'Send',
    monthly_export: 'Month-end Export',
    my_tax_advisor: 'My Tax Advisor',
    security: 'Security & Compliance',
    restart_tour: 'Restart intro tour',
    api_key_label: 'Claude API Key',
    api_key_managed: 'The AI assistant is activated by your administrator.',
    language: 'Language', language_de: 'Deutsch', language_en: 'English',
  }
};

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangRaw] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'de'; } catch { return 'de'; }
  });

  const setLang = (l) => {
    setLangRaw(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  };

  const t = (key) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.de[key] ?? key;

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

// Safe hook — returns de fallback if used outside provider
export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) {
    // Fallback so components don't crash if provider is missing
    return {
      lang: 'de',
      setLang: () => {},
      t: (key) => TRANSLATIONS.de[key] ?? key,
    };
  }
  return ctx;
}
