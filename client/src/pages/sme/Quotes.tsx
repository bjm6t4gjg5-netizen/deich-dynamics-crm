import { useEffect, useState } from 'react';
import { FileSignature, ArrowRight, Eye, TrendingUp, ExternalLink, FileText } from 'lucide-react';
import { api, fmt } from '../../api';
import { Modal, Empty } from '../../components/ui';
import { PdfPreviewModal } from '../../components/PdfPreview';

/**
 * Angebote — pure read-only view über Pipeline-Deals in einer Stage mit
 * is_quote = 1. Es gibt keinen separaten "Angebot erstellen"-Flow mehr;
 * Angebote entstehen ausschließlich über die Pipeline.
 */

interface QuoteRow {
  id: string;
  pipeline_deal_id?: string;
  quote_number: string;
  client_name: string;
  customer_id?: string | null;
  description?: string;
  net: number;
  gross: number;
  vat_rate: number;
  status: string;
  valid_until?: string;
  notes?: string;
  line_items?: string;
  created_at: string;
  invoice_id?: string | null;
  campaign_id?: string | null;
  from_pipeline?: boolean;
}

export default function Quotes({ onNavigate }: { onNavigate?: (page: string, hint?: any) => void } = {}) {
  const [items, setItems] = useState<QuoteRow[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [open, setOpen] = useState<QuoteRow | null>(null);
  const [previewQuote, setPreviewQuote] = useState<QuoteRow | null>(null);

  const load = () => Promise.all([
    api.get<QuoteRow[]>('/sme/quotes'),
    api.get<any[]>('/sme/pipeline-stages'),
  ]).then(([qs, ss]) => { setItems(qs); setStages(ss); });
  useEffect(() => { load(); }, []);

  const quoteStages = stages.filter((s) => s.is_quote);

  const showPreview = (q: QuoteRow) => setPreviewQuote(q);

  const convertToInvoice = async (q: QuoteRow) => {
    if (q.invoice_id) {
      if (onNavigate) onNavigate('invoices', { focus_invoice: q.invoice_id });
      return;
    }
    try {
      const r = await api.post<{ ok: boolean; invoice_id: string; invoice_number: string }>(`/sme/quotes/${q.pipeline_deal_id || q.id}/convert`);
      alert(`✓ Rechnung ${r.invoice_number} erstellt`);
      await load();
      if (onNavigate) onNavigate('invoices', { focus_invoice: r.invoice_id });
    } catch (e: any) { alert(e.message); }
  };

  const changeStage = async (q: QuoteRow, newStage: string) => {
    if (!q.pipeline_deal_id) return;
    try {
      await api.sme.updateDeal(q.pipeline_deal_id, { stage: newStage });
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title"><FileSignature size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Angebote ({items.length})</span>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('pipeline')}>
            <TrendingUp size={13} />Neues Angebot in Pipeline
          </button>
        </div>
        <div className="card-body" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border2)', padding: '10px 18px', fontSize: 12, color: 'var(--ink3)' }}>
          💡 Angebote werden ausschließlich über die Pipeline angelegt. Erstelle einen Deal und ziehe ihn in eine als „Angebot" markierte Spalte —
          dann erscheint er hier automatisch. Spalten als „Angebot" markieren: <strong>Pipeline → „Spalten anpassen"</strong>.
        </div>

        {items.length === 0 ? (
          <Empty
            icon={<FileSignature size={32} />}
            text="Noch keine Angebote in der Pipeline. Lege einen Deal an und ziehe ihn in eine Angebot-Spalte."
            action={<button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('pipeline')}><TrendingUp size={13} />Zur Pipeline</button>}
          />
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>Nummer</th><th>Kunde</th><th>Beschreibung</th><th>Brutto</th><th>Phase / Status</th><th>Aktionen</th>
              </tr></thead>
              <tbody>
                {items.map((q) => (
                  <tr key={q.id} className="clickable" onClick={() => setOpen(q)}>
                    <td className="bold sm">
                      <TrendingUp size={11} style={{ verticalAlign: '-1px', marginRight: 4, color: 'var(--accent)' }} />
                      {q.quote_number}
                    </td>
                    <td className="sm">{q.client_name}</td>
                    <td className="muted sm">{q.description}</td>
                    <td className="bold">{fmt(q.gross || q.net)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="form-select"
                        style={{ fontSize: 12, width: 'auto' }}
                        value={q.status}
                        onChange={(e) => changeStage(q, e.target.value)}
                      >
                        {quoteStages.map((s) => <option key={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => showPreview(q)} title="PDF herunterladen">
                          <Eye size={11} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('pipeline')} title="In Pipeline öffnen">
                          <ExternalLink size={11} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => convertToInvoice(q)}
                          title={q.invoice_id ? 'Rechnung öffnen' : 'In Rechnung umwandeln'}
                          style={{ color: q.invoice_id ? 'var(--primary)' : 'var(--ok)' }}
                        >
                          {q.invoice_id ? <FileText size={11} /> : <ArrowRight size={11} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewQuote && (
        <PdfPreviewModal
          url={`/api/sme/pdf/quote/${previewQuote.pipeline_deal_id || previewQuote.id}`}
          filename={`${previewQuote.quote_number}.pdf`}
          title={`Angebot · ${previewQuote.quote_number}`}
          onClose={() => setPreviewQuote(null)}
        />
      )}

      {open && (
        <Modal title={open.quote_number} onClose={() => setOpen(null)} large
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setOpen(null)}>Schließen</button>
              <button className="btn btn-ghost" onClick={() => showPreview(open)}>
                <Eye size={13} />PDF
              </button>
              <button className="btn btn-ghost" onClick={() => { onNavigate?.('pipeline'); setOpen(null); }}>
                <ExternalLink size={13} />In Pipeline öffnen
              </button>
              {open.invoice_id ? (
                <button className="btn btn-primary" onClick={() => { onNavigate?.('invoices', { focus_invoice: open.invoice_id }); setOpen(null); }}>
                  <FileText size={13} />Rechnung öffnen
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => { convertToInvoice(open); setOpen(null); }}>
                  <ArrowRight size={13} />In Rechnung umwandeln
                </button>
              )}
            </>
          }
        >
          <div className="form-row">
            <div className="form-group"><label className="form-label">Kunde</label><input className="form-input" value={open.client_name} readOnly /></div>
            <div className="form-group"><label className="form-label">Brutto</label><input className="form-input" value={fmt(open.gross || open.net)} readOnly /></div>
          </div>
          <div className="form-group">
            <label className="form-label">Beschreibung</label>
            <textarea className="form-textarea" rows={2} value={open.description || ''} readOnly />
          </div>
          <div className="form-group">
            <label className="form-label">Positionen</label>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Beschreibung</th><th>Menge</th><th>Einzel</th><th>Gesamt</th></tr></thead>
                <tbody>
                  {(() => { try { return JSON.parse(open.line_items || '[]'); } catch { return []; } })().map((it: any, i: number) => (
                    <tr key={i}>
                      <td className="sm">{it.description}</td>
                      <td className="sm">{it.qty}</td>
                      <td className="sm">{fmt(it.unit_price)}</td>
                      <td className="bold">{fmt((it.qty || 0) * (it.unit_price || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {open.notes && (
            <div className="form-group">
              <label className="form-label">Notizen</label>
              <textarea className="form-textarea" rows={2} value={open.notes} readOnly />
            </div>
          )}
          <p className="form-hint" style={{ marginTop: 8 }}>
            Status-Änderungen erfolgen in der Pipeline. Klicke „In Pipeline öffnen" um die Phase zu wechseln.
          </p>
        </Modal>
      )}
    </div>
  );
}
