import { useState, useEffect, useRef } from 'react';
import { Plus, X, CheckCircle, FileText, Trash2, Settings, Clock, Download, Eye, Users } from 'lucide-react';
import { api, fmt, fmtDate, STORAGE } from '../../api';
import { Modal } from '../../components/ui';
import { LineItemsEditor } from '../../components/LineItemsEditor';
import { CustomerPickerModal, type CustomerLite } from '../../components/CustomerPicker';
import { PdfPreviewModal } from '../../components/PdfPreview';
import { useLang } from '../../context/LangContext';
import { useApp } from '../../context/AppContext';

// Helper: how many days has the deal been in its current stage?
function daysInStage(deal: any): number | null {
  const at = deal.stage_entered_at || deal.created_at;
  if (!at) return null;
  return Math.floor((Date.now() - new Date(at).getTime()) / (1000 * 60 * 60 * 24));
}

function stageTimeLabel(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'Heute angelegt';
  if (days === 1) return 'Seit gestern';
  return `Seit ${days} Tagen`;
}

const CATS_DE = ['Büromaterial','Fahrtkosten','Telekommunikation','Marketing','Miete','Versicherung','Software','Personal','Sonstiges'];
const CATS_EN = ['Office supplies','Travel','Telecommunications','Marketing','Rent','Insurance','Software','Personnel','Other'];

// ── Pipeline ──────────────────────────────────────────────────────────────────
// Stages are now loaded from the server per Unternehmen — see /api/sme/pipeline-stages.
// Each stage has an is_won/is_lost flag that drives column tinting.
interface PipelineStage {
  id: string;
  name: string;
  position: number;
  is_won: 0 | 1;
  is_lost: 0 | 1;
  is_quote: 0 | 1;
}

function DealModal({ deal, customers, stages, campaigns, onClose, onDone, onCreateInvoice, onOpenInvoice }: any) {
  const initialItems = (() => { try { return JSON.parse(deal.line_items || '[]'); } catch { return []; } })();
  const [form, setForm] = useState({ ...deal, line_items: initialItems });
  const [saving, setSaving] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const stageObj = stages.find((s: PipelineStage) => s.name === form.stage);
  const isQuote = !!stageObj?.is_quote;
  const linkedCustomer = customers.find((c: any) => c.id === form.customer_id);

  const save = async () => {
    setSaving(true);
    try {
      await api.sme.updateDeal(deal.id, {
        ...form,
        line_items: form.line_items,
      });
      onDone();
    } catch (e: any) { alert(e.message); setSaving(false); }
  };

  const pickCustomer = (c: CustomerLite) => {
    setForm((f: any) => ({
      ...f,
      customer_id: c.id,
      company: c.company || c.name || f.company,
      contact_person: f.contact_person || c.name || '',
    }));
  };

  return (
    <>
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-xl">
        <div className="modal-hd">
          <div>
            <div className="modal-title">{deal.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span className="muted sm">{form.company || linkedCustomer?.company || linkedCustomer?.name || '–'}</span>
              {isQuote && <span className="badge badge-info">Angebot</span>}
              {form.invoice_id && <span className="badge badge-ok">✓ Rechnung verknüpft</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isQuote && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowPdfPreview(true)} title="Angebot als PDF anzeigen">
                <Eye size={13} />PDF-Vorschau
              </button>
            )}
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="modal-body">
          {/* Section 1: Inhalt */}
          <div style={{ marginBottom: 18 }}>
            <div className="bold sm" style={{ color: 'var(--primary)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border2)' }}>1 · Inhalt</div>
            <div className="form-group">
              <label className="form-label">Bezeichnung *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Erwarteter Wert (netto, €)</label>
                <input className="form-input" type="number" value={form.value} onChange={(e) => setForm((f: any) => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Wahrscheinlichkeit (%)</label>
                <input className="form-input" type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm((f: any) => ({ ...f, probability: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Erwarteter Abschluss</label>
                <input className="form-input" type="date" value={form.expected_close ? form.expected_close.slice(0, 10) : ''} onChange={(e) => setForm((f: any) => ({ ...f, expected_close: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Section 2: Positionen */}
          <div style={{ marginBottom: 18 }}>
            <div className="bold sm" style={{ color: 'var(--primary)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border2)' }}>2 · Positionen</div>
            <LineItemsEditor
              value={form.line_items}
              onChange={(items) => setForm((f: any) => ({
                ...f,
                line_items: items,
                value: items.reduce((s: number, it: any) => s + (it.qty || 0) * (it.unit_price || 0), 0) || f.value,
              }))}
              vatRate={19}
            />
          </div>

          {/* Section 3: Kontakt & Attribution */}
          <div style={{ marginBottom: 18 }}>
            <div className="bold sm" style={{ color: 'var(--primary)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border2)' }}>3 · Kontakt &amp; Attribution</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Kunde</label>
                <button
                  type="button"
                  className="form-input"
                  onClick={() => setShowCustomerPicker(true)}
                  style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Users size={13} color="var(--ink3)" />
                  {linkedCustomer
                    ? <span>{linkedCustomer.company || linkedCustomer.name}{linkedCustomer.name && linkedCustomer.company && linkedCustomer.name !== linkedCustomer.company ? ` · ${linkedCustomer.name}` : ''}</span>
                    : <span className="muted">Kunden suchen oder anlegen…</span>}
                </button>
              </div>
              <div className="form-group">
                <label className="form-label">Ansprechpartner</label>
                <input className="form-input" value={form.contact_person || ''} onChange={(e) => setForm((f: any) => ({ ...f, contact_person: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phase</label>
                <select className="form-select" value={form.stage} onChange={(e) => setForm((f: any) => ({ ...f, stage: e.target.value }))}>
                  {stages.map((s: PipelineStage) => <option key={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Marketing-Aktion</label>
                <select className="form-select" value={form.campaign_id || ''} onChange={(e) => setForm((f: any) => ({ ...f, campaign_id: e.target.value }))}>
                  <option value="">– Keine Kampagne –</option>
                  {(campaigns || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}{c.channel ? ` (${c.channel})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Interne Notizen</label>
              <textarea className="form-textarea" value={form.notes || ''} onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Schließen</button>
          {form.invoice_id ? (
            <button className="btn btn-ghost" onClick={() => onOpenInvoice?.(form.invoice_id)}>
              <FileText size={13} />Rechnung öffnen
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => onCreateInvoice(deal)}><FileText size={13} />Rechnung erstellen</button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={saving}><CheckCircle size={13} />{saving ? 'Speichert…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
    {showCustomerPicker && (
      <CustomerPickerModal onClose={() => setShowCustomerPicker(false)} onPick={pickCustomer} />
    )}
    {showPdfPreview && (
      <PdfPreviewModal
        url={`/api/sme/pdf/quote/${deal.id}`}
        filename={`Angebot-${deal.id}.pdf`}
        title={`Angebot · ${deal.name}`}
        onClose={() => setShowPdfPreview(false)}
      />
    )}
    </>
  );
}

function StageManagerModal({ stages, onClose, onSaved }: { stages: PipelineStage[]; onClose: () => void; onSaved: () => void }) {
  const [list, setList] = useState<PipelineStage[]>([...stages]);
  const [newName, setNewName] = useState('');

  const rename = (id: string, name: string) =>
    setList((ls) => ls.map((s) => (s.id === id ? { ...s, name } : s)));

  const toggle = (id: string, key: 'is_won' | 'is_lost' | 'is_quote') => {
    setList((ls) => {
      // is_won / is_lost: exactly one column may carry the flag — turning it
      // on elsewhere clears the previous holder. is_quote: any number allowed.
      if (key === 'is_won' || key === 'is_lost') {
        const target = ls.find((s) => s.id === id);
        if (!target) return ls;
        if (target[key] === 1) {
          // Turning OFF — but must keep at least one set
          const remaining = ls.filter((x) => x.id !== id && x[key] === 1).length;
          if (remaining === 0) {
            alert(`Mindestens eine „${key === 'is_won' ? 'Gewonnen' : 'Verloren'}"-Spalte muss markiert bleiben.`);
            return ls;
          }
          return ls.map((s) => (s.id === id ? { ...s, [key]: 0 } as PipelineStage : s));
        }
        // Turning ON — clear all other columns' flag, and mutually-exclude won/lost on same row
        return ls.map((s) => {
          if (s.id === id) {
            return { ...s, is_won: key === 'is_won' ? 1 : 0, is_lost: key === 'is_lost' ? 1 : 0 } as PipelineStage;
          }
          return { ...s, [key]: 0 } as PipelineStage;
        });
      }
      // is_quote — free toggle
      return ls.map((s) => (s.id === id ? { ...s, is_quote: s.is_quote ? 0 : 1 } as PipelineStage : s));
    });
  };

  const remove = async (id: string) => {
    const target = list.find((s) => s.id === id);
    if (!target) return;
    const wonCount  = list.filter((s) => s.is_won  && s.id !== id).length;
    const lostCount = list.filter((s) => s.is_lost && s.id !== id).length;
    if (target.is_won  && wonCount  === 0) { alert('Mindestens eine „Gewonnen"-Spalte muss erhalten bleiben.'); return; }
    if (target.is_lost && lostCount === 0) { alert('Mindestens eine „Verloren"-Spalte muss erhalten bleiben.'); return; }
    if (!confirm('Spalte löschen? Deals werden in die erste verbleibende Spalte verschoben.')) return;
    try {
      await api.delete(`/sme/pipeline-stages/${id}`);
      setList((ls: PipelineStage[]) => ls.filter((s) => s.id !== id));
    }
    catch (e: any) { alert(e.message); }
  };

  const add = async () => {
    if (!newName.trim()) return;
    try {
      const r = await api.post<{ id: string }>('/sme/pipeline-stages', { name: newName.trim() });
      setList((ls) => [...ls, { id: r.id, name: newName.trim(), position: ls.length, is_won: 0, is_lost: 0, is_quote: 0 } as PipelineStage]);
      setNewName('');
    } catch (e: any) { alert(e.message); }
  };

  const saveAll = async () => {
    try {
      // Persist any rename/flag changes against the original list (positions are
      // preserved server-side via the current saved values; reorder is a future
      // enhancement).
      for (const s of list) {
        const orig = stages.find((o) => o.id === s.id);
        if (!orig) continue;
        if (orig.name !== s.name || orig.is_won !== s.is_won || orig.is_lost !== s.is_lost || orig.is_quote !== s.is_quote) {
          await api.put(`/sme/pipeline-stages/${s.id}`, { name: s.name, is_won: s.is_won, is_lost: s.is_lost, is_quote: s.is_quote });
        }
      }
      onSaved();
      onClose();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <Modal
      title="Pipeline-Spalten verwalten"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={saveAll}><CheckCircle size={13} />Speichern</button>
        </>
      }
    >
      <p className="muted sm" style={{ marginBottom: 14 }}>
        Spalten umbenennen, Status (Gewonnen/Verloren) markieren oder löschen. Beim Löschen werden bestehende Deals in die erste verbleibende Spalte verschoben.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {list.map((s) => (
          <div
            key={s.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 'var(--r)',
            }}
          >
            <input
              className="form-input"
              style={{ flex: 1 }}
              value={s.name}
              onChange={(e) => rename(s.id, e.target.value)}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink3)' }}>
              <input type="checkbox" checked={!!s.is_won}  onChange={() => toggle(s.id, 'is_won')} />
              Gewonnen
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink3)' }}>
              <input type="checkbox" checked={!!s.is_lost} onChange={() => toggle(s.id, 'is_lost')} />
              Verloren
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink3)' }} title="Deals in dieser Spalte erscheinen automatisch als Angebote">
              <input type="checkbox" checked={!!s.is_quote} onChange={() => toggle(s.id, 'is_quote')} />
              Angebot
            </label>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => remove(s.id)}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name der neuen Spalte"
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!newName.trim()}>
          <Plus size={12} />Hinzufügen
        </button>
      </div>
    </Modal>
  );
}

export function Pipeline({ onNavigate }: { onNavigate?: (page: string, hint?: any) => void }) {
  const [deals, setDeals]         = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [stages, setStages]       = useState<PipelineStage[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showNew, setShowNew]     = useState(false);
  const [showNewCustomerPicker, setShowNewCustomerPicker] = useState(false);
  const [editDeal, setEditDeal]   = useState<any>(null);
  const [showStages, setShowStages] = useState(false);
  const [dragging, setDragging]   = useState<string | null>(null);
  const [dragOver, setDragOver]   = useState<string | null>(null);

  const defaultStageName = stages[0]?.name || 'Erstgespräch';
  const [hideClosed, setHideClosed] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', customer_id: '', company: '', value: '', probability: '20',
    stage: defaultStageName, contact_person: '', notes: '', line_items: [],
    expected_close: '', campaign_id: '',
  });
  useEffect(() => { setForm((f) => ({ ...f, stage: defaultStageName })); }, [defaultStageName]);

  const load = () => Promise.all([
    api.sme.deals(),
    api.sme.customers(),
    api.get<PipelineStage[]>('/sme/pipeline-stages'),
    api.get<any[]>('/sme/campaigns').catch(() => []),
  ]).then(([d, c, s, ca]) => { setDeals(d); setCustomers(c); setStages(s); setCampaigns(ca); });
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.sme.createDeal(form);
      setShowNew(false);
      // Reset form for next time
      setForm({
        name: '', customer_id: '', company: '', value: '', probability: '20',
        stage: defaultStageName, contact_person: '', notes: '', line_items: [],
        expected_close: '', campaign_id: '',
      });
      load();
    } catch (e: any) { alert(e.message); }
  };

  const moveDeal = async (dealId: string, stage: PipelineStage) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage.name) return;

    // If the deal already has an invoice and we're moving it AWAY from a won stage
    // (or to a non-won stage), ask the user what should happen with the invoice.
    if (deal.invoice_id && !stage.is_won) {
      const currentStage = stages.find((s) => s.name === deal.stage);
      if (currentStage?.is_won || deal.stage === currentStage?.name) {
        const choice = window.prompt(
          `Achtung: „${deal.name}" hat eine verknüpfte Rechnung.\n\n` +
          `Was soll mit der Rechnung passieren?\n` +
          `  1 = Rechnung behalten (nur Deal verschieben)\n` +
          `  2 = Rechnung stornieren\n` +
          `  3 = Abbrechen\n\n` +
          `Bitte 1, 2 oder 3 eingeben:`,
          '1'
        );
        if (choice === '3' || choice === null) return;
        if (choice === '2') {
          const reason = window.prompt('Stornogrund (optional):', 'Deal aus Won-Stage zurückbewegt') || '';
          try {
            await api.post(`/sme/invoices/${deal.invoice_id}/cancel`, { reason });
          } catch (e: any) { alert('Stornierung fehlgeschlagen: ' + e.message); return; }
        }
        // Choice "1" or default: keep invoice, just move the deal.
      }
    }

    await api.sme.updateDeal(dealId, { ...deal, stage: stage.name });
    if (stage.is_won && !deal.invoice_id && confirm(`„${deal.name}" gewonnen! 🎉\n\nMöchten Sie direkt eine Rechnung erstellen?`)) {
      createInvoiceFromDeal(deal);
    }
    load();
  };

  const createInvoiceFromDeal = (deal: any) => {
    if (!onNavigate) return;
    // If a linked invoice already exists, jump straight to it instead of creating a new one.
    if (deal.invoice_id) {
      (onNavigate as any)('invoices', { focus_invoice: deal.invoice_id });
      return;
    }
    const customer = customers.find((c) => c.id === deal.customer_id);
    let items: any[] = [];
    if (Array.isArray(deal.line_items)) items = deal.line_items;
    else { try { items = JSON.parse(deal.line_items || '[]'); } catch { items = []; } }
    (onNavigate as any)('invoices', {
      customer_id: deal.customer_id || '',
      client_name: customer ? `${customer.name}${customer.company ? ' – ' + customer.company : ''}` : (deal.company || ''),
      description: deal.name,
      net: deal.value || '',
      line_items: items,
      from_deal_id: deal.id,    // ← Link wird beim Anlegen in der DB gesetzt
    });
  };

  const onDragStart = (e: React.DragEvent, deal: any) => { setDragging(deal.id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver  = (e: React.DragEvent, name: string) => { e.preventDefault(); setDragOver(name); e.dataTransfer.dropEffect = 'move'; };
  const onDrop      = (e: React.DragEvent, stage: PipelineStage) => { e.preventDefault(); if (dragging) moveDeal(dragging, stage); setDragging(null); setDragOver(null); };
  const onDragEnd   = () => { setDragging(null); setDragOver(null); };

  const colDeals = (name: string) => deals.filter((d) => d.stage === name);
  const colVal   = (name: string) => colDeals(name).reduce((s, d) => s + (d.value * (d.probability / 100)), 0);
  const totalPipeline = deals
    .filter((d) => {
      const stage = stages.find((s) => s.name === d.stage);
      return !stage?.is_won && !stage?.is_lost;
    })
    .reduce((s, d) => s + (d.value * (d.probability / 100)), 0);

  return (
    <div>
      <div className="fb mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span className="bold sm">Pipeline gesamt: </span>
          <span className="bold" style={{ color: 'var(--primary)' }}>{fmt(totalPipeline)}</span>
          <span className="muted sm"> (gewichtet)</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
            Abgeschlossene ausblenden
          </label>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowStages(true)}>
            <Settings size={13} />Spalten anpassen
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={13} />Neues Angebot</button>
        </div>
      </div>

      <div className="board" style={{ paddingBottom: 16, gap: 12 }}>
        {stages.filter((s) => !hideClosed || (!s.is_won && !s.is_lost)).map((stage) => {
          const sdeals = colDeals(stage.name);
          const accent = stage.is_won ? 'var(--ok)' : stage.is_lost ? 'var(--danger)' : 'var(--primary)';
          const isDragTarget = dragOver === stage.name;
          return (
            <div
              key={stage.id}
              className={`board-col${stages.length >= 6 ? ' compact' : ''}`}
              onDragOver={(e) => onDragOver(e, stage.name)}
              onDrop={(e) => onDrop(e, stage)}
              onDragLeave={() => setDragOver(null)}
            >
              <div className="col-hd" style={{ borderTop: `3px solid ${accent}` }}>
                <span className="col-hd-title" style={{ color: stage.is_won ? 'var(--ok)' : stage.is_lost ? 'var(--danger)' : '' }}>
                  {stage.is_won ? '✓ ' : stage.is_lost ? '✗ ' : ''}{stage.name}
                </span>
                <span className="col-count">{sdeals.length}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', padding: '3px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none', borderBottom: 'none' }}>
                {fmt(colVal(stage.name))} gew.
              </div>
              <div className="col-body" style={{
                background: stage.is_won  ? 'rgba(5,150,105,.06)'
                          : stage.is_lost ? 'rgba(220,38,38,.04)'
                          : isDragTarget  ? 'var(--primary-lt)'
                                          : 'var(--bg)',
                border: `1px solid ${isDragTarget ? 'var(--primary)' : 'var(--border)'}`,
                minHeight: 160,
              }}>
                {sdeals.map((deal) => {
                  const days = daysInStage(deal);
                  const stale = days !== null && days > 14 && !stage.is_won && !stage.is_lost;
                  const campaign = campaigns.find((c) => c.id === deal.campaign_id);
                  return (
                    <div
                      key={deal.id}
                      className="deal-card"
                      draggable
                      onDragStart={(e) => onDragStart(e, deal)}
                      onDragEnd={onDragEnd}
                      style={{ opacity: dragging === deal.id ? .5 : 1, cursor: 'grab', borderLeft: `3px solid ${accent}` }}
                      onClick={() => setEditDeal(deal)}
                    >
                      <div className="deal-name">{deal.name}</div>
                      <div className="deal-co">{deal.company || customers.find((c) => c.id === deal.customer_id)?.name || '–'}</div>
                      <div className="deal-val" style={{ color: accent }}>{fmt(deal.value)}</div>
                      <div className="deal-foot">
                        <span className="muted sm" style={{ fontSize: 10 }}>{deal.probability}%</span>
                        <span className="muted sm" style={{ fontSize: 10 }}>{fmt(deal.value * deal.probability / 100)}</span>
                      </div>
                      {(campaign || deal.invoice_id) && (
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {campaign && (
                            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: 'rgba(99,102,241,.12)', color: 'rgb(79,70,229)', whiteSpace: 'nowrap' }}>
                              📣 {campaign.name}
                            </span>
                          )}
                          {deal.invoice_id && (
                            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: 'rgba(5,150,105,.12)', color: 'var(--ok)' }}>
                              ✓ Rechnung
                            </span>
                          )}
                        </div>
                      )}
                      {days !== null && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: stale ? 'var(--danger)' : 'var(--ink3)' }}>
                          <Clock size={10} />
                          {stageTimeLabel(days)} {days > 0 ? 'in dieser Phase' : ''}
                          {stale && ' · 🚨 Follow-up!'}
                        </div>
                      )}
                    </div>
                  );
                })}
                {isDragTarget && sdeals.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--primary)', fontSize: 12, border: '2px dashed var(--primary)', borderRadius: 'var(--r)', opacity: .6 }}>
                    Hierher ziehen
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editDeal && (
        <DealModal
          deal={editDeal}
          customers={customers}
          stages={stages}
          campaigns={campaigns}
          onClose={() => setEditDeal(null)}
          onDone={() => { setEditDeal(null); load(); }}
          onCreateInvoice={() => { setEditDeal(null); createInvoiceFromDeal(editDeal); }}
          onOpenInvoice={(id: string) => { setEditDeal(null); onNavigate && onNavigate('invoices', { focus_invoice: id }); }}
        />
      )}

      {showNew && (
        <>
        <Modal
          title="Neuer Deal / Angebot"
          xl
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={create} disabled={!form.name.trim()}>
                <Plus size={13} />Deal anlegen
              </button>
            </>
          }
        >
          {/* Section 1: Was ist der Deal? */}
          <div style={{ marginBottom: 18 }}>
            <div className="bold sm" style={{ color: 'var(--primary)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border2)' }}>1 · Inhalt</div>
            <div className="form-group">
              <label className="form-label">Bezeichnung *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} autoFocus placeholder={'z.B. „Logoredesign für Müller GmbH"'} />
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Erwarteter Wert (netto, €)</label>
                <input className="form-input" type="number" value={form.value} onChange={(e) => setForm((f: any) => ({ ...f, value: e.target.value }))} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label className="form-label">Wahrscheinlichkeit (%)</label>
                <input className="form-input" type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm((f: any) => ({ ...f, probability: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Erwarteter Abschluss</label>
                <input className="form-input" type="date" value={form.expected_close || ''} onChange={(e) => setForm((f: any) => ({ ...f, expected_close: e.target.value }))} />
              </div>
            </div>
            <p className="form-hint" style={{ marginTop: -6 }}>Erwarteter Wert wird automatisch aus den Positionen berechnet (falls erfasst).</p>
          </div>

          {/* Section 2: Positionen */}
          <div style={{ marginBottom: 18 }}>
            <div className="bold sm" style={{ color: 'var(--primary)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border2)' }}>2 · Positionen (optional)</div>
            <LineItemsEditor
              value={form.line_items}
              onChange={(items) => setForm((f: any) => ({
                ...f,
                line_items: items,
                value: items.reduce((s: number, it: any) => s + (it.qty || 0) * (it.unit_price || 0), 0) || f.value,
              }))}
              vatRate={19}
            />
            <p className="form-hint" style={{ marginTop: 6 }}>Bei „Gewonnen" werden diese Positionen automatisch in die Rechnung übernommen. Im Angebots-PDF erscheinen sie ebenfalls.</p>
          </div>

          {/* Section 3: Kontakt + Attribution */}
          <div>
            <div className="bold sm" style={{ color: 'var(--primary)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border2)' }}>3 · Kontakt & Attribution</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Kunde</label>
                <button
                  type="button"
                  className="form-input"
                  onClick={() => setShowNewCustomerPicker(true)}
                  style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Users size={13} color="var(--ink3)" />
                  {form.customer_id
                    ? <span>{(() => {
                        const c = customers.find((x: any) => x.id === form.customer_id);
                        return c ? (c.company || c.name) : '–';
                      })()}</span>
                    : <span className="muted">Kunden suchen oder neu anlegen…</span>}
                </button>
              </div>
              <div className="form-group">
                <label className="form-label">Ansprechpartner</label>
                <input className="form-input" value={form.contact_person} onChange={(e) => setForm((f: any) => ({ ...f, contact_person: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Startphase</label>
                <select className="form-select" value={form.stage} onChange={(e) => setForm((f: any) => ({ ...f, stage: e.target.value }))}>
                  {stages.map((s) => <option key={s.id}>{s.name}</option>)}
                </select>
                <p className="form-hint">
                  Tipp: Eine als „Angebot" markierte Spalte wählen → Deal erscheint automatisch in „Angebote".
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Aus welcher Marketing-Aktion?</label>
                <select className="form-select" value={form.campaign_id} onChange={(e) => setForm((f: any) => ({ ...f, campaign_id: e.target.value }))}>
                  <option value="">– Keine Kampagne –</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.channel ? ` (${c.channel})` : ''}</option>
                  ))}
                </select>
                <p className="form-hint">Erscheint als Label auf der Deal-Karte und zählt zu den Kampagnen-Statistiken.</p>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Interne Notizen</label>
              <textarea className="form-textarea" rows={2} value={form.notes} onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </Modal>
        {showNewCustomerPicker && (
          <CustomerPickerModal
            onClose={() => setShowNewCustomerPicker(false)}
            onPick={(c) => {
              setForm((f: any) => ({
                ...f,
                customer_id: c.id,
                company: c.company || c.name || f.company,
                contact_person: f.contact_person || c.name || '',
              }));
              load();
            }}
          />
        )}
        </>
      )}

      {showStages && (
        <StageManagerModal
          stages={stages}
          onClose={() => setShowStages(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}


// ── Tax FAQ data ──────────────────────────────────────────────────────────────
// Categories let the user filter; search runs across question AND answer text.
const TAX_FAQ = {
  de: [
    // Rechnungen
    { cat: 'Rechnungen', q: 'Was muss auf eine korrekte Rechnung?', a: 'Pflichtangaben laut § 14 UStG: vollständiger Name und Anschrift beider Parteien, Steuernummer oder USt-IdNr., Rechnungsdatum, fortlaufende Rechnungsnummer, Leistungsbeschreibung, Menge/Umfang, Nettobetrag, Steuersatz und Steuerbetrag, Bruttobetrag.' },
    { cat: 'Rechnungen', q: 'Was ist der Unterschied zwischen Netto und Brutto?', a: 'Netto = Rechnungsbetrag ohne Mehrwertsteuer. Brutto = Netto + Mehrwertsteuer. Beispiel: 1.000 € netto + 19 % MwSt. = 1.190 € brutto. Unternehmen können Vorsteuer (gezahlte MwSt.) vom Finanzamt zurückfordern.' },
    { cat: 'Rechnungen', q: 'Was ist eine Kleinbetragsrechnung?', a: 'Rechnungen bis 250 € (brutto) dürfen vereinfacht ausgestellt werden — es reichen Datum, Aussteller, Menge/Leistungsbeschreibung, Bruttobetrag und Steuersatz. USt-IdNr. und Empfänger sind nicht zwingend nötig (§ 33 UStDV).' },
    { cat: 'Rechnungen', q: 'Was ist ZUGFeRD und XRechnung?', a: 'ZUGFeRD ist ein hybrides Rechnungsformat: PDF + eingebettete strukturierte XML-Daten. XRechnung ist der reine XML-Standard. Pflicht für B2G-Rechnungen (Geschäft mit Behörden) seit 2020, B2B-Pflicht im Aufbau bis 2028.' },
    { cat: 'Rechnungen', q: 'Wann ist eine Rechnung fällig?', a: 'Wenn nichts vereinbart wurde: sofort. Üblich sind 14-30 Tage Zahlungsziel. Nach Fälligkeit + Mahnung wird der Kunde in Verzug gesetzt (§ 286 BGB). Verbraucher: 30 Tage nach Rechnung ohne Mahnung in Verzug, wenn entsprechender Hinweis auf der Rechnung steht.' },
    { cat: 'Rechnungen', q: 'Was ist Skonto?', a: 'Skonto = Preisnachlass für schnelle Zahlung. Beispiel "2% Skonto bei Zahlung innerhalb von 10 Tagen, sonst netto 30 Tage". Skonto muss auf der Rechnung klar ausgewiesen sein. Bei MwSt. korrigiert sich auch die Umsatzsteuer entsprechend.' },
    { cat: 'Rechnungen', q: 'Darf ich eine Rechnung nachträglich ändern?', a: 'Eine bereits versendete Rechnung darf inhaltlich NICHT korrigiert werden. Stattdessen: Stornorechnung (gleicher Betrag mit Minuszeichen) ausstellen und neue korrekte Rechnung erstellen. Nummerierung muss lückenlos bleiben.' },
    // Umsatzsteuer
    { cat: 'Umsatzsteuer', q: 'Wann muss ich Umsatzsteuer ausweisen?', a: 'Als umsatzsteuerpflichtiger Unternehmer immer. Ausnahme: Kleinunternehmer (§ 19 UStG) mit Jahresumsatz unter 22.000 € dürfen keine USt ausweisen. Standardsatz 19 %, ermäßigt 7 % für Lebensmittel, Bücher etc.' },
    { cat: 'Umsatzsteuer', q: 'Wann muss die Umsatzsteuer-Voranmeldung abgegeben werden?', a: 'Monatlich oder quartalsweise (je nach Vorjahresumsatz) bis zum 10. des Folgemonats beim Finanzamt. Bei Dauerfristverlängerung (+1 Monat). Abgabe über ELSTER. Über 7.500 € Vorjahres-USt: monatlich; weniger: quartalsweise; unter 1.000 € evtl. nur jährlich.' },
    { cat: 'Umsatzsteuer', q: 'Was ist Vorsteuer?', a: 'Vorsteuer ist die Mehrwertsteuer, die Sie beim Einkauf gezahlt haben. Diese kann vom Finanzamt zurückgefordert werden (Vorsteuerabzug), sofern Sie Unternehmer sind und die Ausgabe betrieblich veranlasst ist.' },
    { cat: 'Umsatzsteuer', q: 'Wie funktioniert die Kleinunternehmerregelung?', a: 'Bei Jahresumsatz bis 22.000 € im Vorjahr und voraussichtlich max. 50.000 € im laufenden Jahr: keine Umsatzsteuerpflicht, kein Vorsteuerabzug. Auf Rechnungen: "Kein Steuerausweis gemäß § 19 UStG". Wechsel zur Regelbesteuerung möglich (bindet 5 Jahre).' },
    { cat: 'Umsatzsteuer', q: 'Was sind die ermäßigten Steuersätze?', a: 'Standardsatz 19 %. Ermäßigt 7 % gilt für: Lebensmittel, Bücher, Zeitschriften, ÖPNV, Beherbergung, Kunstgegenstände, kulturelle Veranstaltungen. Auslandsverkäufe an Privatkunden (B2C) richten sich teilweise nach OSS-Verfahren.' },
    { cat: 'Umsatzsteuer', q: 'Was ist das Reverse-Charge-Verfahren?', a: 'Bei Geschäften zwischen umsatzsteuerpflichtigen Unternehmen in der EU geht die Steuerschuld auf den Leistungsempfänger über. Auf der Rechnung steht "Steuerschuldnerschaft des Leistungsempfängers". Der Empfänger meldet selbst USt und zieht sie als Vorsteuer wieder ab — nullsummenneutral.' },
    // Belege
    { cat: 'Belege', q: 'Welche Belege muss ich aufbewahren?', a: 'Alle Eingangs- und Ausgangsrechnungen, Kontoauszüge, Quittungen und Verträge müssen für 10 Jahre aufbewahrt werden (§ 147 AO). Geschäftsbriefe 6 Jahre. Digital oder Papier – beides zulässig, solange Lesbarkeit gewährleistet.' },
    { cat: 'Belege', q: 'Was sind absetzbare Betriebsausgaben?', a: 'Alle Ausgaben, die betrieblich veranlasst sind: Miete, Büromaterial, Fahrtkosten, Personalkosten, Werbung, Telefon, Fachliteratur, Versicherungen, Softwarelizenzen. Privat veranlasste Kosten sind nicht absetzbar.' },
    { cat: 'Belege', q: 'Kann ich Bewirtungskosten absetzen?', a: 'Geschäftliche Bewirtungskosten zu 70 % absetzbar (Restaurantbeleg muss enthalten: Datum, Bewirtete Personen, geschäftlicher Anlass, Betrag, Trinkgeld, Steuernummer des Lokals). Vorsteuerabzug zu 100 %. Eigenbewirtung im Büro: 100 % absetzbar.' },
    { cat: 'Belege', q: 'Wie weise ich Fahrtkosten nach?', a: 'Mit dem eigenen PKW: 0,30 €/km für die ersten 20 km, 0,38 €/km ab dem 21. km. Geschäftsfahrten besser per Fahrtenbuch dokumentieren — sonst ggf. 1%-Regelung mit pauschaler Privatnutzung.' },
    { cat: 'Belege', q: 'Was sind GWG (geringwertige Wirtschaftsgüter)?', a: 'Wirtschaftsgüter mit Anschaffungskosten bis 800 € (netto) können im Anschaffungsjahr voll abgesetzt werden. Sammelposten 250-1.000 €: zwingend über 5 Jahre verteilt abschreiben. Höhere Beträge: AfA gemäß Nutzungsdauer.' },
    // Mahnwesen
    { cat: 'Mahnwesen', q: 'Welche Mahnstufen gibt es?', a: '1. Zahlungserinnerung (freundlich, keine Gebühr), 2. Erste Mahnung (7-14 Tage nach Fälligkeit), 3. Zweite Mahnung (mit Mahngebühr ggf. 5-10 €), 4. Letzte Mahnung vor gerichtlichem Mahnverfahren / Inkasso. Verzugszinsen: 9 Prozentpunkte über Basiszinssatz (B2B).' },
    { cat: 'Mahnwesen', q: 'Wann kann ich Mahngebühren verlangen?', a: 'Nach Verzugseintritt. Pauschale: 40 € bei B2B-Geschäften (§ 288 Abs. 5 BGB). Bei B2C: nur tatsächlich entstandene Kosten (Porto etc.).' },
    { cat: 'Mahnwesen', q: 'Wie hoch sind Verzugszinsen?', a: 'B2B: 9 Prozentpunkte über Basiszinssatz (aktuell ca. 12 %). B2C: 5 Prozentpunkte über Basiszinssatz (ca. 8 %). Basiszinssatz wird halbjährlich von der Deutschen Bundesbank festgelegt.' },
    // Unternehmensformen
    { cat: 'Unternehmensformen', q: 'Was ist der Unterschied zwischen EÜR und Bilanz?', a: 'EÜR: Einfache Gegenüberstellung von Einnahmen und Ausgaben. Für Selbstständige und kleine Unternehmen bis 600.000 € Umsatz. Bilanz: Doppelte Buchführung mit Aktiva/Passiva. Pflicht für Kapitalgesellschaften (GmbH, AG) und größere Unternehmen.' },
    { cat: 'Unternehmensformen', q: 'Was kostet eine GmbH-Gründung?', a: 'Stammkapital mindestens 25.000 € (davon 12.500 € sofort einzahlen). Notarkosten ca. 400-800 € für Beurkundung. Handelsregistereintrag ca. 150 €. Gesamt: ca. 700-1.000 € + Stammkapital. Alternative: UG (haftungsbeschränkt) ab 1 € Stammkapital.' },
    { cat: 'Unternehmensformen', q: 'Brauche ich einen Steuerberater?', a: 'Nicht zwingend — Selbstständige können EÜR selbst machen. Empfohlen: bei Umsatz > 100.000 € oder bei Personal/Lohnsteuer. Bei Bilanzierung (GmbH, AG) faktisch erforderlich.' },
    // Personal
    { cat: 'Personal', q: 'Was ist eine Minijob-Regelung?', a: 'Bis 538 €/Monat (2024/25): pauschale 30 % Abgaben durch Arbeitgeber (Kranken-, Renten-, Lohnsteuer), Arbeitnehmer steuerfrei. Über 538 €: Midijob bis 2.000 €, dann reguläre sozialversicherungspflichtige Beschäftigung.' },
    { cat: 'Personal', q: 'Was kostet ein Mitarbeiter brutto/netto?', a: 'Faustregel: Mitarbeiterkosten ≈ 1,3 × Bruttogehalt. Arbeitgeberanteile zur Sozialversicherung ca. 21 %, dazu Berufsgenossenschaft, U1/U2-Umlagen. Bei 3.000 € Brutto: ca. 3.700 € Gesamtkosten für den Arbeitgeber.' },
    // Compliance
    { cat: 'Compliance', q: 'Was bedeutet GoBD?', a: 'Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern, Aufzeichnungen und Unterlagen in elektronischer Form. Vorschriften des Finanzamts für digitale Buchhaltung: Unveränderbarkeit der Buchungen, Vollständigkeit, Richtigkeit, Nachvollziehbarkeit, zeitgerechte Erfassung.' },
    { cat: 'Compliance', q: 'Was ist DATEV?', a: 'DATEV ist ein Software- und IT-Dienstleistungsanbieter für Steuerberater. Das DATEV-Format (DATEV-Buchungsstapel) ist der Standard für den Datenaustausch zwischen Unternehmen und Steuerberater in Deutschland.' },
    { cat: 'Compliance', q: 'Was ist DSGVO-relevant in der Buchhaltung?', a: 'Personenbezogene Daten von Mitarbeitern, Kunden, Lieferanten müssen DSGVO-konform gespeichert werden: Zweckbindung, Datensparsamkeit, Löschfristen. Buchhaltungsdaten dürfen aufgrund Aufbewahrungspflicht 10 Jahre gespeichert werden, danach Löschpflicht.' },
  ],
  en: [
    { q: 'What receipts do I need to keep?', a: 'All invoices (incoming and outgoing), bank statements, receipts and contracts must be retained for 10 years (§ 147 AO). Digital or paper format — both are acceptable as long as legibility is ensured.' },
    { q: 'What must appear on a correct invoice?', a: 'Mandatory information per § 14 UStG: full name and address of both parties, tax number or VAT ID, invoice date, consecutive invoice number, service description, quantity/scope, net amount, tax rate and tax amount, gross amount.' },
    { q: 'When do I need to show VAT?', a: 'As a VAT-liable entrepreneur, always. Exception: small businesses (§ 19 UStG) with annual turnover under €22,000 may not charge VAT. Standard rate 19%, reduced rate 7% for food, books etc.' },
    { q: 'What is the difference between net and gross?', a: 'Net = invoice amount without VAT. Gross = net + VAT. Example: €1,000 net + 19% VAT = €1,190 gross. Businesses can reclaim input VAT (Vorsteuer) paid on purchases from the tax office.' },
    { q: 'What is input tax (Vorsteuer)?', a: 'Input tax is the VAT you paid when making purchases. This can be reclaimed from the tax office (input tax deduction), provided you are an entrepreneur and the expense is business-related.' },
    { q: 'When is the VAT advance return due?', a: 'Monthly or quarterly (depending on previous year\'s turnover) by the 10th of the following month. With permanent extension of deadline (+1 month). Submission via ELSTER.' },
    { q: 'What business expenses are tax-deductible?', a: 'All expenses incurred for business purposes: rent, office supplies, travel costs, personnel costs, advertising, telephone, specialist literature, insurance, software licences. Privately motivated costs are not deductible.' },
    { q: 'What is a Einnahmen-Überschuss-Rechnung (EÜR)?', a: 'EÜR (income-surplus statement): Simple comparison of income and expenses. For self-employed and small businesses up to €600,000 turnover. Balance sheet: double-entry bookkeeping. Mandatory for limited companies (GmbH, AG) and larger businesses.' },
    { q: 'What does GoBD mean?', a: 'GoBD: Principles for the proper keeping and storage of books, records and documents in electronic form. Tax authority regulations for digital accounting: immutability, completeness, accuracy of entries.' },
    { q: 'How does the small business rule work?', a: 'With annual turnover up to €22,000 in the previous year and max. €50,000 in the current year: no VAT obligation, no input tax deduction. On invoices: "No tax pursuant to § 19 UStG".' },
  ],
};

// ── AI Chat ───────────────────────────────────────────────────────────────────
export function AIChat({ apiKey, onGoSettings }) {
  const { t, lang } = useLang();
  const [tab,setTab]       = useState(apiKey ? 'chat' : 'faq');
  const [msgs,setMsgs]     = useState([{role:'bot',text: lang==='en' ? 'Hello! I\'m your AI assistant for accounting, CRM and business strategy. How can I help you?' : 'Hallo! Ich bin Ihr KI-Assistent für Buchhaltung, CRM und Strategie. Wie kann ich Ihnen heute helfen?'}]);
  const [input,setInput]   = useState('');
  const [loading,setLoading] = useState(false);
  const [faqOpen,setFaqOpen] = useState(null);
  const [faqSearch, setFaqSearch] = useState('');
  const [faqCat, setFaqCat] = useState<string>('Alle');
  const bottomRef = useRef(null);
  const faqs = (TAX_FAQ[lang] || TAX_FAQ.de) as Array<{ q: string; a: string; cat?: string }>;

  // Available categories — keeps the order of first appearance + 'Alle' at front.
  const categories = ['Alle', ...Array.from(new Set(faqs.map((f) => f.cat || 'Sonstiges')))];
  const visibleFaqs = faqs.filter((f) => {
    const matchesCat = faqCat === 'Alle' || (f.cat || 'Sonstiges') === faqCat;
    if (!matchesCat) return false;
    const q = faqSearch.trim().toLowerCase();
    if (!q) return true;
    return f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q);
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput('');
    setMsgs(m => [...m, {role:'user', text:msg}]);
    setLoading(true);
    const reply = await api.claude(msg, apiKey);
    setMsgs(m => [...m, {role:'bot', text:reply}]);
    setLoading(false);
  };

  const chips = lang === 'en'
    ? ['How do I create an invoice?','What goes on a German invoice?','LIFO vs FIFO explained','Debt collection tips','What is a Jahresabschluss?']
    : ['Wie erstelle ich eine Rechnung?','Was muss auf eine Rechnung?','LIFO vs FIFO – Erklärung','Tipps für Mahnwesen','Was ist ein Jahresabschluss?'];

  return (
    <div>
      <div className="tabs" style={{marginBottom:0}}>
        <button className={`tab${tab==='faq'?' active':''}`} onClick={()=>setTab('faq')}>
          📚 {t('qa_title')}
        </button>
        {apiKey
          ? <button className={`tab${tab==='chat'?' active':''}`} onClick={()=>setTab('chat')}>🤖 {t('ai_title')}</button>
          : <button className="tab" style={{color:'var(--ink4)',cursor:'not-allowed'}} title={t('ai_locked_msg')}>🔒 KI-Chat (inaktiv)</button>
        }
      </div>

      {/* FAQ tab */}
      {tab==='faq' && (
        <div>
          <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:13,color:'var(--ink2)'}}>
            📚 {t('qa_subtitle')} — {faqs.length} {lang==='en'?'questions':'Fragen'}
            {!apiKey && <span style={{marginLeft:8,color:'var(--warn)',fontWeight:600}}>· {t('ai_disabled_label')}</span>}
          </div>

          {/* Search + category filter */}
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            <input
              className="form-input"
              style={{flex:'1 1 220px',minWidth:0}}
              placeholder={lang==='en'?'Search question or answer…':'In Fragen und Antworten suchen…'}
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
            />
            <select
              className="form-select"
              style={{width:'auto',minWidth:140}}
              value={faqCat}
              onChange={(e) => setFaqCat(e.target.value)}
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {visibleFaqs.length === 0 && (
              <div style={{padding:24,textAlign:'center',color:'var(--ink3)',fontSize:13,background:'var(--bg)',borderRadius:'var(--r)'}}>
                {lang==='en'?'No FAQ matches your search.':'Keine FAQ-Einträge gefunden.'}
              </div>
            )}
            {visibleFaqs.map((item, i) => (
              <div key={`${item.cat||'x'}-${i}`} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
                <button
                  onClick={() => setFaqOpen(faqOpen===i ? null : i)}
                  style={{width:'100%',textAlign:'left',padding:'13px 16px',background:'none',border:'none',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,fontFamily:'var(--font)',fontSize:13,fontWeight:600,color:'var(--ink)'}}>
                  <span style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
                    {item.cat && <span className="badge badge-neu" style={{fontSize:10}}>{item.cat}</span>}
                    <span>{item.q}</span>
                  </span>
                  <span style={{fontSize:16,color:'var(--primary)',flexShrink:0,transition:'transform .2s',transform:faqOpen===i?'rotate(180deg)':'rotate(0deg)'}}>▾</span>
                </button>
                {faqOpen===i && (
                  <div style={{padding:'0 16px 14px',fontSize:13,lineHeight:1.75,color:'var(--ink2)',borderTop:'1px solid var(--border2)',paddingTop:12}}>
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!apiKey && (
            <div style={{background:'var(--info-bg)',border:'1px solid var(--info)',borderRadius:'var(--r)',padding:'14px 16px',marginTop:16,fontSize:13,color:'var(--info)',lineHeight:1.7}}>
              <div className="bold" style={{marginBottom:6}}>🤖 {t('ai_title')} — {lang==='en'?'not active':'nicht aktiv'}</div>
              {t('ai_locked_msg')}
              <button className="btn btn-secondary btn-sm" style={{marginTop:10}} onClick={onGoSettings}>
                {t('ai_contact_admin')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Chat tab */}
      {tab==='chat' && apiKey && (
        <div className="chat-wrap" style={{marginTop:0,borderTop:'none',borderRadius:'0 0 var(--r-xl) var(--r-xl)'}}>
          <div className="chat-msgs">
            {msgs.map((m,i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
            {loading && <div className="msg bot" style={{color:'var(--ink3)'}}>⏳ {lang==='en'?'Claude is thinking…':'Claude denkt nach…'}</div>}
            <div ref={bottomRef}/>
          </div>
          {msgs.length===1 && (
            <div style={{padding:'0 18px 8px',display:'flex',gap:6,flexWrap:'wrap'}}>
              {chips.map(c=><button key={c} className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>setInput(c)}>{c}</button>)}
            </div>
          )}
          <div className="chat-foot">
            <input className="form-input" style={{flex:1}} value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()} placeholder={t('ask_placeholder')} disabled={loading}/>
            <button className="btn btn-primary" onClick={send} disabled={!input.trim()||loading}>{t('send')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

