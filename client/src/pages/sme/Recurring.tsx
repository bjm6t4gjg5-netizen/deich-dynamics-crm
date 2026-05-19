import { useEffect, useState } from 'react';
import { Plus, Repeat, Trash2, Power, Calendar, FileText, ExternalLink } from 'lucide-react';
import { api, fmtDate } from '../../api';
import { Modal, Empty } from '../../components/ui';
import { LineItemsEditor } from '../../components/LineItemsEditor';

/**
 * Abos (recurring invoice templates).
 *
 * Each abo carries the spec for an invoice that should repeat: client, items,
 * frequency, next due. We DON'T auto-generate any more — the user clicks
 * "Rechnung generieren" per due date so they retain control over what goes
 * out (was generated as Entwurf, can be reviewed before sending).
 *
 * UI: list with expand-per-row showing the next 3 upcoming due dates each
 * with its own "Generieren"-button.
 */

function addInterval(dateStr: string, freq: string): string {
  const d = new Date(dateStr);
  if (freq === 'monthly')   d.setMonth(d.getMonth() + 1);
  if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
  if (freq === 'yearly')    d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const freqLabel = (f: string) => ({ monthly: 'Monatlich', quarterly: 'Quartalsweise', yearly: 'Jährlich' } as any)[f] || f;

export default function Recurring({ onNavigate }: { onNavigate?: (page: string, hint?: any) => void } = {}) {
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({
    customer_id: '', client_name: '', description: '', vat_rate: 19,
    frequency: 'monthly', start_date: '', end_date: '', line_items: [],
  });
  const [err, setErr] = useState('');

  const load = () => Promise.all([api.get<any[]>('/sme/recurring'), api.sme.customers()])
    .then(([rs, cs]) => {
      // Parse generated_log for the UI
      setItems(rs.map((r) => ({
        ...r,
        generated_log_parsed: (() => { try { return JSON.parse(r.generated_log || '[]'); } catch { return []; } })(),
      })));
      setCustomers(cs);
    });
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr('');
    if (!form.client_name || !form.start_date) { setErr('Kunde und Startdatum erforderlich'); return; }
    if (!form.line_items.length) { setErr('Mindestens eine Position'); return; }
    try { await api.post('/sme/recurring', form); setShowNew(false); load(); }
    catch (e: any) { setErr(e.message); }
  };

  const toggleActive = async (r: any) => { await api.put(`/sme/recurring/${r.id}`, { active: !r.active }); load(); };
  const remove       = async (r: any) => { if (confirm('Abo löschen?')) { await api.delete(`/sme/recurring/${r.id}`); load(); } };

  const generateForDate = async (r: any, date: string) => {
    try {
      const res = await api.post<any>(`/sme/recurring/${r.id}/generate`, { date });
      if (res.already_existed) {
        // Already generated — jump straight to that invoice instead
        if (onNavigate) onNavigate('invoices', { focus_invoice: res.invoice_id });
        return;
      }
      alert(`✓ Rechnung ${res.invoice_number} als Entwurf erstellt — bei „Rechnungen" prüfen.`);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const openGeneratedInvoice = (invoiceId: string) => {
    if (onNavigate) onNavigate('invoices', { focus_invoice: invoiceId });
  };

  // Combined timeline: past-generated dates + 3 future due dates, sorted ASC.
  const timelineDates = (r: any): Array<{ date: string; future: boolean }> => {
    const generated = (r.generated_log_parsed || []).map((l: any) => ({ date: l.date, future: false }));
    const future: Array<{ date: string; future: boolean }> = [{ date: r.next_due, future: true }];
    let d = r.next_due;
    for (let i = 0; i < 2; i++) { d = addInterval(d, r.frequency); future.push({ date: d, future: true }); }
    const merged = [...generated, ...future];
    // Dedupe by date (favouring already-generated entries)
    const map = new Map<string, { date: string; future: boolean }>();
    for (const e of merged) {
      if (!map.has(e.date) || !e.future) map.set(e.date, e);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Repeat size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Abos ({items.length})</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={13} />Neues Abo</button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Kunde</th><th>Beschreibung</th><th>Frequenz</th><th>Nächste fällig</th><th>Aktiv</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => (
                <FragmentRow key={r.id}
                  r={r}
                  expanded={expanded === r.id}
                  timeline={timelineDates(r)}
                  onToggleExpand={() => setExpanded(expanded === r.id ? null : r.id)}
                  onToggleActive={() => toggleActive(r)}
                  onEdit={() => setEditing(r)}
                  onRemove={() => remove(r)}
                  onGenerate={(date) => generateForDate(r, date)}
                  onOpenInvoice={openGeneratedInvoice}
                />
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6}>
                  <Empty icon={<Repeat size={32} />} text="Noch keine Abos. Ideal für Wartungsverträge, Software-Abos und monatliche Gebühren." action={<button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={13} />Erstes Abo</button>} />
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <AboForm
          form={form} setForm={setForm} err={err}
          customers={customers}
          title="Neues Abo"
          onClose={() => setShowNew(false)}
          onSubmit={create}
        />
      )}

      {editing && (
        <AboForm
          form={editing} setForm={(f: any) => setEditing(typeof f === 'function' ? f(editing) : f)}
          err=""
          customers={customers}
          title={`Abo bearbeiten — ${editing.client_name}`}
          onClose={() => setEditing(null)}
          onSubmit={async () => {
            try {
              const body = { ...editing, line_items: typeof editing.line_items === 'string' ? JSON.parse(editing.line_items || '[]') : editing.line_items };
              await api.put(`/sme/recurring/${editing.id}`, body);
              setEditing(null); load();
            } catch (e: any) { alert(e.message); }
          }}
        />
      )}
    </div>
  );
}

function FragmentRow({ r, expanded, timeline, onToggleExpand, onToggleActive, onEdit, onRemove, onGenerate, onOpenInvoice }: any) {
  const log: Array<{ date: string; invoice_id: string; invoice_number: string }> = r.generated_log_parsed || [];
  const generatedFor = (date: string) => log.find((l) => l.date === date);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <tr className="clickable" onClick={onToggleExpand} style={{ background: expanded ? 'var(--bg)' : '' }}>
        <td className="bold sm">{r.client_name}</td>
        <td className="muted sm">{r.description || '–'}</td>
        <td>{freqLabel(r.frequency)}</td>
        <td className="sm">{fmtDate(r.next_due)}{r.last_generated && <div className="muted" style={{ fontSize: 11 }}>Zuletzt: {fmtDate(r.last_generated)}</div>}</td>
        <td onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" onClick={onToggleActive} title="Pausieren/Aktivieren">
            <Power size={12} color={r.active ? 'var(--ok)' : 'var(--ink3)'} />
            <span className="sm" style={{ marginLeft: 4 }}>{r.active ? 'Aktiv' : 'Pausiert'}</span>
          </button>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={onEdit}>Bearbeiten</button>
            <button className="btn btn-ghost btn-sm" onClick={onRemove} style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--bg)', padding: '14px 22px' }}>
            <div className="bold sm" style={{ marginBottom: 12 }}>
              <Calendar size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Zeitlicher Verlauf
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {timeline.map(({ date: d, future }: { date: string; future: boolean }, idx: number) => {
                const gen = generatedFor(d);
                const isToday = d === today;
                const isPast = d < today;
                const accent = gen ? 'var(--ok)' : isPast ? 'var(--ink3)' : 'var(--primary)';
                return (
                  <div
                    key={d}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--surface)',
                      border: `1px solid ${gen ? 'var(--ok)' : 'var(--border)'}`,
                      borderLeft: `3px solid ${accent}`,
                      borderRadius: 'var(--r)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minWidth: 200,
                      opacity: isPast && !gen ? 0.55 : 1,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="bold sm">{fmtDate(d)}</div>
                      <div className="muted" style={{ fontSize: 10 }}>
                        {gen ? '✓ generiert' : isToday ? 'heute fällig' : isPast ? 'verpasst' : `in ${Math.round((new Date(d).getTime() - Date.now()) / 86400000)} Tagen`}
                      </div>
                      {gen && <div style={{ fontSize: 10, color: 'var(--ok)', marginTop: 2, fontWeight: 600 }}>{gen.invoice_number}</div>}
                    </div>
                    {gen ? (
                      <button className="btn btn-secondary btn-sm" onClick={() => onOpenInvoice(gen.invoice_id)} title="Generierte Rechnung öffnen">
                        <ExternalLink size={11} />Öffnen
                      </button>
                    ) : (future && !isPast || (isPast && idx === 0)) ? (
                      <button className="btn btn-primary btn-sm" onClick={() => onGenerate(d)}>
                        <FileText size={11} />Generieren
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <p className="muted sm" style={{ marginTop: 12, lineHeight: 1.6 }}>
              Vergangene Fälligkeiten mit Häkchen wurden bereits in eine Rechnung umgewandelt — Klick zum Öffnen.
              Künftige Fälligkeiten kannst du via <strong>„Generieren"</strong> jetzt schon zur Rechnung machen.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function AboForm({
  form, setForm, err, customers, title, onClose, onSubmit,
}: any) {
  const items = typeof form.line_items === 'string'
    ? (() => { try { return JSON.parse(form.line_items || '[]'); } catch { return []; } })()
    : (form.line_items || []);

  return (
    <Modal title={title} onClose={onClose} large
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn btn-primary" onClick={onSubmit}><Plus size={13} />Speichern</button>
      </>}>
      {err && <div className="notice err">{err}</div>}
      <div className="form-row">
        <div className="form-group"><label className="form-label">Kunde *</label>
          <select className="form-select" value={form.customer_id || ''} onChange={(e) => {
            const c = customers.find((x: any) => x.id === e.target.value);
            setForm((f: any) => ({ ...f, customer_id: e.target.value, client_name: c ? `${c.name}${c.company ? ' – ' + c.company : ''}` : f.client_name }));
          }}>
            <option value="">– Manuell –</option>
            {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.company ? ' – ' + c.company : ''}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Frequenz *</label>
          <select className="form-select" value={form.frequency} onChange={(e) => setForm((f: any) => ({ ...f, frequency: e.target.value }))}>
            <option value="monthly">Monatlich</option>
            <option value="quarterly">Quartalsweise</option>
            <option value="yearly">Jährlich</option>
          </select>
        </div>
      </div>
      {!form.customer_id && (
        <div className="form-group">
          <label className="form-label">Kundenname *</label>
          <input className="form-input" value={form.client_name || ''} onChange={(e) => setForm((f: any) => ({ ...f, client_name: e.target.value }))} />
        </div>
      )}
      <div className="form-row">
        <div className="form-group"><label className="form-label">Startdatum / nächste Fälligkeit *</label>
          <input className="form-input" type="date" value={form.start_date || form.next_due || ''} onChange={(e) => setForm((f: any) => ({ ...f, start_date: e.target.value, next_due: e.target.value }))} />
        </div>
        <div className="form-group"><label className="form-label">Enddatum (optional)</label>
          <input className="form-input" type="date" value={form.end_date || ''} onChange={(e) => setForm((f: any) => ({ ...f, end_date: e.target.value }))} />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Positionen *</label>
        <LineItemsEditor value={items} onChange={(its) => setForm((f: any) => ({ ...f, line_items: its }))} vatRate={form.vat_rate || 19} />
      </div>
    </Modal>
  );
}
