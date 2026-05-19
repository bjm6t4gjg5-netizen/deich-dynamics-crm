import { useEffect, useState } from 'react';
import { Search, Users, UserPlus, Check } from 'lucide-react';
import { api } from '../api';
import { Modal } from './ui';
import { AddressAutocomplete } from './AddressAutocomplete';

/**
 * CustomerPickerModal — search + pick from existing customers, or inline-
 * create a new one when the customer doesn't exist yet. Mirrors the
 * Inventory-Picker layout so the app feels consistent.
 *
 * - Search across name, company, email, city
 * - Card grid with avatar + company + email
 * - If the search query has 0 results: show "Neuen Kunden anlegen"-Inline-Form
 *   pre-populated with the search text as name
 */
export interface CustomerLite {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  city?: string;
  type?: string;
  status?: string;
}

export function CustomerPickerModal({
  onPick,
  onClose,
  allowCreate = true,
}: {
  onPick: (customer: CustomerLite) => void;
  onClose: () => void;
  allowCreate?: boolean;
}) {
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState<any>({
    name: '', company: '', email: '', phone: '', mobile: '',
    address: '', plz: '', city: '', country: 'Deutschland',
    type: 'Kunde', status: 'Aktiv', tax_id: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const load = () =>
    api.sme.customers().then((r: any) => setCustomers(r || [])).catch(() => setCustomers([]));
  useEffect(() => { load(); }, []);

  const filtered = customers.filter((c) => {
    const s = q.toLowerCase().trim();
    if (!s) return true;
    return (
      c.name?.toLowerCase().includes(s) ||
      c.company?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.city?.toLowerCase().includes(s)
    );
  });

  const startCreate = () => {
    setCreating(true);
    const isLikelyCompany = /\b(gmbh|ag|kg|ohg|ug|e\.?\s*k\.?|gbr|ltd|inc)\b/i.test(q);
    setNewForm((f: any) => ({
      ...f,
      name: isLikelyCompany ? '' : q,
      company: isLikelyCompany ? q : '',
    }));
  };

  const save = async () => {
    if (!newForm.name.trim() && !newForm.company.trim()) {
      alert('Bitte mindestens Name oder Firma angeben.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...newForm,
        name: newForm.name.trim() || newForm.company.trim(),
      };
      const r = await api.sme.createCustomer(payload);
      onPick({ id: r.id, ...payload } as CustomerLite);
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (creating) {
    return (
      <Modal title="Neuen Kunden anlegen" large onClose={() => setCreating(false)}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setCreating(false)}>Zurück zur Suche</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Check size={13} />{saving ? 'Speichert…' : 'Anlegen und auswählen'}
          </button>
        </>}>
        <p className="muted sm" style={{ marginBottom: 14, lineHeight: 1.6 }}>
          Mindestens Name oder Firma ist erforderlich. Weitere Felder kannst du jederzeit später auf der Kundenseite ergänzen.
        </p>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Vor- &amp; Nachname</label>
            <input className="form-input" value={newForm.name} onChange={(e) => setNewForm((f: any) => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Firma</label>
            <input className="form-input" value={newForm.company} onChange={(e) => setNewForm((f: any) => ({ ...f, company: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">E-Mail</label>
            <input className="form-input" type="email" value={newForm.email} onChange={(e) => setNewForm((f: any) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Telefon (Festnetz)</label>
            <input className="form-input" value={newForm.phone} onChange={(e) => setNewForm((f: any) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Mobil</label>
            <input className="form-input" value={newForm.mobile} onChange={(e) => setNewForm((f: any) => ({ ...f, mobile: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Adresse <span className="muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>(Tippen für Vorschläge — OpenStreetMap)</span></label>
          <AddressAutocomplete
            value={newForm.address || ''}
            onChange={(v) => setNewForm((f: any) => ({ ...f, address: v }))}
            onPick={(a: any) => setNewForm((f: any) => ({
              ...f,
              address: a.street,
              plz: a.plz || f.plz,
              city: a.city || f.city,
              country: a.country || f.country,
            }))}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">PLZ</label>
            <input className="form-input" value={newForm.plz} onChange={(e) => setNewForm((f: any) => ({ ...f, plz: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Stadt</label>
            <input className="form-input" value={newForm.city} onChange={(e) => setNewForm((f: any) => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Land</label>
            <input className="form-input" value={newForm.country} onChange={(e) => setNewForm((f: any) => ({ ...f, country: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Typ</label>
            <select className="form-select" value={newForm.type} onChange={(e) => setNewForm((f: any) => ({ ...f, type: e.target.value }))}>
              {['Kunde', 'Interessent', 'Partner', 'Lieferant', 'Inaktiv'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={newForm.status} onChange={(e) => setNewForm((f: any) => ({ ...f, status: e.target.value }))}>
              {['Aktiv', 'Warm', 'Lead', 'Inaktiv'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">USt-IdNr.</label>
            <input className="form-input" value={newForm.tax_id} onChange={(e) => setNewForm((f: any) => ({ ...f, tax_id: e.target.value }))} placeholder="DE 123 456 789" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Notizen</label>
          <textarea className="form-textarea" rows={2} value={newForm.notes} onChange={(e) => setNewForm((f: any) => ({ ...f, notes: e.target.value }))} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Kunde wählen" onClose={onClose} large
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        {allowCreate && (
          <button className="btn btn-primary" onClick={startCreate}>
            <UserPlus size={13} />{q ? `„${q}" als neuen Kunden anlegen` : 'Neuen Kunden anlegen'}
          </button>
        )}
      </>}>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }} />
        <input
          className="form-input"
          style={{ paddingLeft: 30 }}
          placeholder="Suche nach Name, Firma, E-Mail oder Stadt…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 10,
        maxHeight: 480,
        overflowY: 'auto',
      }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1/-1', padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>
            <Users size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div className="sm" style={{ marginBottom: 12 }}>
              {q ? `Kein Kunde "${q}" gefunden.` : 'Noch keine Kunden vorhanden.'}
            </div>
            {allowCreate && (
              <button className="btn btn-primary btn-sm" onClick={startCreate}>
                <UserPlus size={12} />{q ? `„${q}" anlegen` : 'Ersten Kunden anlegen'}
              </button>
            )}
          </div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onPick(c); onClose(); }}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: 12,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all .15s',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 18,
                background: 'var(--primary-lt)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, flexShrink: 0,
              }}>
                {(c.name || c.company || '?').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="bold sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.company || c.name}
                </div>
                {c.company && c.name && c.name !== c.company && (
                  <div className="muted" style={{ fontSize: 11 }}>{c.name}</div>
                )}
                {c.email && (
                  <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.email}
                  </div>
                )}
                {c.city && (
                  <div className="muted" style={{ fontSize: 11 }}>{c.city}</div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
