import { useState } from 'react';
import { Save, Building2, MapPin, CreditCard, Check } from 'lucide-react';
import { api } from '../api';
import { Modal } from './ui';
import { AddressAutocomplete } from './AddressAutocomplete';

/**
 * OnboardingWizard — wird einmal beim ersten Login eines Unternehmens-Accounts
 * gezeigt, wenn `profile.firm_name` noch leer ist. Drei Schritte:
 *   1. Firmenname + Rechtsform
 *   2. Anschrift + Kontakt
 *   3. Steuer- + Bankdaten
 *
 * Nach Abschluss wird das Profil per `api.sme.updateProfile` gespeichert und
 * `onComplete` gerufen. Der Wizard ist nicht abbrechbar — Schließen ohne
 * Speichern blockiert die App nicht (der User landet im Dashboard), erscheint
 * aber beim nächsten Login wieder, solange `firm_name` leer ist.
 */
export function OnboardingWizard({ profile, onComplete }: { profile: any; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firm_name:    profile?.firm_name || '',
    legal_form:   profile?.legal_form || 'GmbH',
    address:      profile?.address || '',
    plz:          profile?.plz || '',
    city:         profile?.city || '',
    country:      profile?.country || 'Deutschland',
    phone:        profile?.phone || '',
    email:        profile?.email || '',
    website:      profile?.website || '',
    ust_id:       profile?.ust_id || '',
    steuernummer: profile?.steuernummer || '',
    iban:         profile?.iban || '',
    bic:          profile?.bic || '',
    bank_name:    profile?.bank_name || '',
  });

  const steps = [
    { id: 'firm',    title: 'Unternehmen', icon: <Building2 size={16} /> },
    { id: 'address', title: 'Anschrift',   icon: <MapPin size={16} /> },
    { id: 'tax',     title: 'Steuer & Bank', icon: <CreditCard size={16} /> },
  ];

  const current = steps[step];
  const canProceed = step === 0 ? !!form.firm_name.trim() : true;

  const finish = async () => {
    if (!form.firm_name.trim()) {
      alert('Bitte mindestens einen Firmennamen angeben.');
      return;
    }
    setSaving(true);
    try {
      await api.sme.updateProfile(form);
      onComplete();
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Willkommen bei Mein Dynamics 👋"
      large
      onClose={() => { /* nicht abbrechbar — siehe Komponenten-Doku */ }}
      footer={
        <>
          {step > 0 && (
            <button className="btn btn-secondary" onClick={() => setStep((s) => s - 1)} disabled={saving}>
              Zurück
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < steps.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canProceed || saving}>
              Weiter
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={saving || !form.firm_name.trim()}>
              {saving ? 'Speichert…' : <><Save size={13} />Fertig — los geht's</>}
            </button>
          )}
        </>
      }
    >
      <p className="muted sm" style={{ marginBottom: 18, lineHeight: 1.6 }}>
        Bevor du loslegst, ergänze bitte deine Stammdaten. Sie erscheinen auf Rechnungen, Angeboten und Mahnungen.
        Du kannst alles jederzeit unter <strong>Einstellungen → Unternehmen</strong> ändern.
      </p>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 22, paddingBottom: 14, borderBottom: '1px solid var(--border2)' }}>
        {steps.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 'var(--r)',
                background: i === step ? 'var(--primary-lt)' : i < step ? 'rgba(5,150,105,.08)' : 'var(--bg)',
                color: i === step ? 'var(--primary)' : i < step ? 'var(--ok)' : 'var(--ink3)',
                fontSize: 13, fontWeight: i === step ? 600 : 500,
              }}
            >
              {i < step ? <Check size={16} /> : s.icon}
              <span>{i + 1}. {s.title}</span>
            </div>
            {i < steps.length - 1 && <div style={{ width: 24, height: 1, background: 'var(--border2)', margin: '0 4px' }} />}
          </div>
        ))}
      </div>

      {/* Step content */}
      {current.id === 'firm' && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Firmenname *</label>
              <input
                className="form-input"
                value={form.firm_name}
                onChange={(e) => setForm((f) => ({ ...f, firm_name: e.target.value }))}
                placeholder="z.B. Müller Design GmbH"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Rechtsform</label>
              <select
                className="form-select"
                value={form.legal_form}
                onChange={(e) => setForm((f) => ({ ...f, legal_form: e.target.value }))}
              >
                {['GmbH', 'UG', 'KG', 'GbR', 'Einzelunternehmen', 'AG', 'GmbH & Co. KG', 'Freiberufler'].map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Webseite (optional)</label>
            <input
              className="form-input"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://…"
            />
          </div>
        </>
      )}

      {current.id === 'address' && (
        <>
          <div className="form-group">
            <label className="form-label">Anschrift <span className="muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>(Tippen für Vorschläge — OpenStreetMap)</span></label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => setForm((f) => ({ ...f, address: v }))}
              onPick={(a: any) => setForm((f) => ({
                ...f,
                address: a.street,
                plz: a.plz || f.plz,
                city: a.city || f.city,
                country: a.country || f.country,
              }))}
            />
          </div>
          <div className="form-row-3">
            <div className="form-group"><label className="form-label">PLZ</label><input className="form-input" value={form.plz} onChange={(e) => setForm((f) => ({ ...f, plz: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Stadt</label><input className="form-input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Land</label><input className="form-input" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Telefon</label><input className="form-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+49 …" /></div>
            <div className="form-group"><label className="form-label">E-Mail</label><input className="form-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="info@…" /></div>
          </div>
        </>
      )}

      {current.id === 'tax' && (
        <>
          <p className="muted sm" style={{ marginBottom: 14 }}>Diese Daten erscheinen im Fuß deiner Rechnungen. Du kannst sie auch leer lassen und später ergänzen.</p>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">USt-IdNr.</label>
              <input className="form-input" value={form.ust_id} onChange={(e) => setForm((f) => ({ ...f, ust_id: e.target.value }))} placeholder="DE 123 456 789" />
            </div>
            <div className="form-group">
              <label className="form-label">Steuernummer</label>
              <input className="form-input" value={form.steuernummer} onChange={(e) => setForm((f) => ({ ...f, steuernummer: e.target.value }))} placeholder="12/345/67890" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Bank</label>
            <input className="form-input" value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} placeholder="Sparkasse / Volksbank / …" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">IBAN</label>
              <input className="form-input" value={form.iban} onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))} placeholder="DE89 3704 0044 …" />
            </div>
            <div className="form-group">
              <label className="form-label">BIC</label>
              <input className="form-input" value={form.bic} onChange={(e) => setForm((f) => ({ ...f, bic: e.target.value }))} placeholder="COBADEFFXXX" />
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
