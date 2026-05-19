import { useState, useEffect } from 'react';
import { Plus, Send, CheckCircle, X, Search, Eye, FileText, AlertTriangle } from 'lucide-react';
import { api, fmt, fmtDate, STORAGE } from '../../api';
import { Badge, Modal } from '../../components/ui';
import { LineItemsEditor } from '../../components/LineItemsEditor';
import { PdfPreviewModal } from '../../components/PdfPreview';

const STATUSES = ['Alle','Entwurf','Offen','Bezahlt','Überfällig','Storniert'];

function invoiceHtml(inv: any, sme: any, customer?: any): string {
  const color = sme?.theme_color || '#1d3f36';
  const iban  = sme?.iban ? `<p style="margin:3px 0"><b>IBAN:</b> ${sme.iban}${sme.bic?` &middot; BIC: ${sme.bic}`:''}</p>` : '';
  const ust   = sme?.ust_id ? `<p style="margin:2px 0;font-size:11px;color:#888">USt-IdNr.: ${sme.ust_id}</p>` : '';
  const logo  = sme?.logo_url ? `<img src="${window.location.origin}${sme.logo_url}" style="height:40px;object-fit:contain;margin-bottom:4px" alt="Logo"/>` : '';
  // Full recipient block — falls back to scalar client_name when no FK customer
  const rec = customer || {};
  const recipientBlock = `
    <p style="font-weight:600;font-size:14px;margin-bottom:4px">${(rec.company || inv.client_name || '').replace(/</g,'&lt;')}</p>
    ${rec.name ? `<p style="font-size:12px">${rec.name}</p>` : ''}
    ${rec.address ? `<p style="font-size:12px;color:#555">${rec.address}</p>` : ''}
    ${rec.plz || rec.city ? `<p style="font-size:12px;color:#555">${[rec.plz, rec.city].filter(Boolean).join(' ')}</p>` : ''}
    ${rec.email ? `<p style="font-size:11px;color:#888;margin-top:4px">${rec.email}</p>` : ''}
    ${rec.tax_id ? `<p style="font-size:11px;color:#888">USt-IdNr.: ${rec.tax_id}</p>` : ''}
  `;
  // Line items — if multi-position, render rows; otherwise fall back to scalar
  let items: any[] = [];
  try { items = JSON.parse(inv.line_items || '[]'); } catch { items = []; }

  // Per-item VAT — group by vat_rate so the totals show each rate separately.
  const useItems = items.length > 0;
  const itemsByRate: Record<number, number> = {};
  for (const it of items) {
    const r = parseFloat(it.vat_rate ?? inv.vat_rate ?? 19);
    const net = (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0);
    itemsByRate[r] = (itemsByRate[r] || 0) + net;
  }
  const sumNet = useItems
    ? items.reduce((s: number, it: any) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0), 0)
    : inv.net;
  const sumVat = useItems
    ? Object.entries(itemsByRate).reduce((s, [r, n]) => s + (n as number) * (+r) / 100, 0)
    : inv.vat;
  const sumGross = sumNet + sumVat;

  const eur = (n: number) => `€ ${Number(n).toFixed(2).replace('.', ',')}`;

  const itemRows = useItems
    ? items.map((it) => {
        const qty = parseFloat(it.qty) || 0;
        const up = parseFloat(it.unit_price) || 0;
        const rate = parseFloat(it.vat_rate ?? inv.vat_rate ?? 19);
        const lineNet = qty * up;
        return `<tr>
          <td>${(it.description || '').replace(/</g, '&lt;')}</td>
          <td style="text-align:right">${qty}</td>
          <td style="text-align:right">${eur(up)}</td>
          <td style="text-align:right">${rate}%</td>
          <td style="text-align:right"><b>${eur(lineNet)}</b></td>
        </tr>`;
      }).join('')
    : `<tr><td>${inv.description || 'Leistung'}</td><td style="text-align:right">1</td><td style="text-align:right">${eur(inv.net)}</td><td style="text-align:right">${inv.vat_rate}%</td><td style="text-align:right"><b>${eur(inv.net)}</b></td></tr>`;

  const vatRows = useItems
    ? Object.entries(itemsByRate)
        .sort((a, b) => +b[0] - +a[0])
        .map(([rate, net]) => `<div class="total-row"><span>MwSt. ${rate}% auf ${eur(net as number)}</span><span>${eur((net as number) * (+rate) / 100)}</span></div>`)
        .join('')
    : `<div class="total-row"><span>MwSt. ${inv.vat_rate}%</span><span>${eur(inv.vat)}</span></div>`;

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;color:#222;padding:40px;font-size:13px;line-height:1.6}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:18px;border-bottom:3px solid ${color}}.firm h1{font-size:20px;color:${color};font-weight:700}.inv-title{font-size:26px;font-weight:800;color:${color}}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}.meta-box{background:#f8f9fa;padding:12px;border-radius:6px}.meta-box h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#999;margin-bottom:6px}table{width:100%;border-collapse:collapse;margin-bottom:18px}th{padding:9px 12px;background:${color};color:#fff;text-align:left;font-size:11px;font-weight:600}td{padding:9px 12px;border-bottom:1px solid #f0f0f0}.total-section{display:flex;justify-content:flex-end;margin-bottom:24px}.total-box{width:280px;border:2px solid ${color};border-radius:6px;overflow:hidden}.total-row{display:flex;justify-content:space-between;padding:7px 12px;font-size:12px}.total-row.grand{background:${color};color:#fff;font-weight:700;font-size:14px;padding:10px 12px}.payment{background:#f8f9fa;border-radius:6px;padding:12px;margin-bottom:20px}.footer{border-top:1px solid #eee;padding-top:12px;font-size:10px;color:#aaa;text-align:center}</style>
</head><body>
<div class="header"><div class="firm">${logo}<h1>${sme?.firm_name || 'Firmenname'}</h1><p style="color:#888;font-size:11px">${[sme?.address, sme?.plz, sme?.city].filter(Boolean).join(' &middot; ')}</p>${ust}</div><div style="text-align:right"><div class="inv-title">Rechnung</div><p style="color:#888;font-size:12px">${inv.invoice_number}</p><p style="color:#888;font-size:11px;margin-top:3px">Datum: ${fmtDate(inv.date)}</p></div></div>
<div class="meta-grid"><div class="meta-box"><h3>Rechnungsempf&auml;nger</h3>${recipientBlock}</div><div class="meta-box"><h3>Details</h3><p><b>Nummer:</b> ${inv.invoice_number}</p><p><b>Datum:</b> ${fmtDate(inv.date)}</p><p><b>F&auml;llig:</b> ${fmtDate(inv.due_date)}</p></div></div>
<table><thead><tr><th>Position</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzelpreis</th><th style="text-align:right">MwSt.</th><th style="text-align:right">Netto</th></tr></thead><tbody>${itemRows}</tbody></table>
<div class="total-section"><div class="total-box"><div class="total-row"><span>Nettobetrag</span><span>${eur(sumNet)}</span></div>${vatRows}<div class="total-row grand"><span>Gesamtbetrag</span><span>${eur(sumGross)}</span></div></div></div>
<div class="payment"><p style="font-weight:600;margin-bottom:5px">Zahlungshinweis</p><p>Bitte &uuml;berweisen Sie bis zum <b>${fmtDate(inv.due_date)}</b>.</p>${iban}<p style="margin-top:3px;font-size:11px;color:#888">Verwendungszweck: ${inv.invoice_number}</p></div>
<div class="footer">${sme?.firm_name || ''} ${sme?.legal_form ? '&middot; ' + sme.legal_form : ''} ${sme?.ust_id ? '&middot; USt-IdNr.: ' + sme.ust_id : ''}</div>
</body></html>`;
}

export function InvoiceModal({ inv, sme, onClose, onRefresh }: any) {
  const [tab, setTab] = useState<'preview'|'send'|'edit'|'reminders'>('preview');
  const initialItems = (() => { try { return JSON.parse(inv.line_items || '[]'); } catch { return []; } })();
  const [editForm, setEdit] = useState<any>({
    client_name: inv.client_name,
    description: inv.description || '',
    notes: inv.notes || '',
    line_items: initialItems,
    vat_rate: inv.vat_rate || 19,
    due_date: inv.due_date || '',
  });
  const [sendEmail, setSendEmail] = useState('');
  const [sendType, setSendType]   = useState<'invoice'|'reminder'>('invoice');
  const [reminderLevel, setReminderLevel] = useState(1);
  const [dunningLevels, setDunningLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  // Resolve full customer record so the preview shows address/email/etc.
  useEffect(() => {
    if (inv.customer_id) api.sme.customer(inv.customer_id).then(setCustomer).catch(()=>setCustomer(null));
  }, [inv.customer_id]);

  // Merge live edits into preview so saving isn't required to see them.
  const previewItems = editForm.line_items || initialItems;
  const previewNet = previewItems.length
    ? previewItems.reduce((s: number, it: any) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0), 0)
    : inv.net;
  const previewVat = previewItems.length
    ? previewItems.reduce((s: number, it: any) => {
        const lineNet = (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0);
        return s + lineNet * ((it.vat_rate ?? editForm.vat_rate ?? inv.vat_rate ?? 19) / 100);
      }, 0)
    : inv.vat;
  const previewInv = {
    ...inv,
    ...editForm,
    line_items: JSON.stringify(previewItems),
    net: previewNet,
    vat: previewVat,
    gross: previewNet + previewVat,
  };
  const html = invoiceHtml(previewInv, sme, customer);

  useEffect(() => {
    api.get<any[]>('/sme/dunning').then(setDunningLevels).catch(() => setDunningLevels([]));
  }, []);

  // Real server-rendered PDF instead of browser print.
  const downloadPdf = () => {
    const token = localStorage.getItem(STORAGE.TOKEN_KEY);
    // We can't put Authorization into a download anchor; use fetch + blob.
    fetch(`/api/sme/pdf/invoice/${inv.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error('PDF konnte nicht erstellt werden'); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${inv.invoice_number}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => alert(e.message));
  };

  const markPaid = async () => {
    if (!confirm('Als bezahlt markieren?')) return;
    await api.sme.updateInvoice(inv.id, { status:'Bezahlt', paid_at:new Date().toISOString() });
    onRefresh(); onClose();
  };

  const doSend = async () => {
    if (!sendEmail) return;
    setLoading(true);
    try {
      if (sendType==='invoice') await api.sme.sendInvoice(inv.id, sendEmail);
      else await api.sme.sendReminder(inv.id, sendEmail);
      onRefresh(); onClose();
    } catch(e) { alert(e.message); setLoading(false); }
  };

  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Mark dirty whenever the user edits anything in the edit tab. Note: this is
  // a rough heuristic — we trust the user to know they made changes.
  const markEdit = (patch: any) => { setEdit((f: any) => ({ ...f, ...patch })); setDirty(true); };

  const saveEdit = async () => {
    setLoading(true);
    try {
      await api.sme.updateInvoice(inv.id, editForm);
      onRefresh();
      setSavedFlash(true);
      setDirty(false);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  // X-button intercept — confirm if there are unsaved changes
  const handleClose = () => {
    if (dirty && !confirm('Es gibt ungespeicherte Änderungen. Wirklich schließen?')) return;
    onClose();
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&handleClose()}>
      <div className="modal modal-lg" style={{maxWidth:860,maxHeight:'92vh',display:'flex',flexDirection:'column'}}>
        <div className="modal-hd" style={{flexShrink:0}}>
          <div>
            <div className="modal-title">{inv.invoice_number}</div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
              <span className="muted sm">{inv.client_name} · {fmt(inv.gross)}</span>
              <Badge status={inv.status}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8, alignItems:'center'}}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPdfPreview(true)} title="PDF-Vorschau"><Eye size={13}/>PDF</button>
            {/* Status-Schnellwechsel direkt im Header */}
            {inv.status !== 'Storniert' && !inv.deleted_at && (
              <>
                {inv.status === 'Entwurf' && (
                  <button
                    className="btn btn-primary btn-sm"
                    title="Rechnung als versendet markieren (Status → Offen)"
                    onClick={async () => {
                      try { await api.sme.updateInvoice(inv.id, { status: 'Offen', sent_at: new Date().toISOString() }); onRefresh(); onClose(); }
                      catch (e: any) { alert(e.message); }
                    }}
                  ><Send size={13}/>Als gesendet markieren</button>
                )}
                {(inv.status === 'Offen' || inv.status === 'Überfällig') && (
                  <button className="btn btn-primary btn-sm" onClick={markPaid} title="Rechnung als bezahlt markieren"><CheckCircle size={13}/>Bezahlt</button>
                )}
              </>
            )}
            {inv.status !== 'Storniert' && !inv.deleted_at && (
              <>
                {inv.sent_at && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      const reason = window.prompt(`Rechnung ${inv.invoice_number} stornieren?\n\nGrund (wird auf der Storno-Rechnung vermerkt):`, '');
                      if (reason === null) return;
                      try {
                        await api.post(`/sme/invoices/${inv.id}/cancel`, { reason });
                        alert(`✓ Rechnung ${inv.invoice_number} storniert.`);
                        onClose();
                      } catch (e: any) { alert(e.message); }
                    }}
                    title="Storno-Rechnung erstellen (GoBD-konform, behält die Nummer)"
                    style={{ color: 'var(--danger)' }}
                  >
                    Stornieren
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    let reason = '';
                    if (inv.sent_at) {
                      // Versendet → Grund pflicht
                      const r = window.prompt(
                        `⚠️ Rechnung ${inv.invoice_number} löschen?\n\n` +
                        `Diese Rechnung wurde bereits VERSENDET. Aus buchhalterischen Gründen (GoBD) ist eine Stornierung normalerweise besser. ` +
                        `Wenn du sie trotzdem löschen willst, gib bitte einen Grund an:`,
                        '',
                      );
                      if (r === null) return;
                      if (!r.trim()) { alert('Ein Grund ist erforderlich, wenn die Rechnung bereits versendet wurde.'); return; }
                      reason = r;
                    } else {
                      if (!window.confirm(
                        `Rechnung ${inv.invoice_number} löschen?\n\n` +
                        `Sie wurde noch nicht versendet — Löschen ist unkritisch. ` +
                        `Aus einem verknüpften Angebot oder Abo lässt sich danach wieder eine neue Rechnung erstellen.`,
                      )) return;
                      reason = window.prompt('Grund (optional):', '') || '';
                    }
                    try {
                      const token = localStorage.getItem('dd_token');
                      const r = await fetch(`/api/sme/invoices/${inv.id}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ reason }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.error || 'Löschen fehlgeschlagen');
                      alert(`✓ Rechnung ${inv.invoice_number} gelöscht.${d.was_sent ? ' Verknüpftes Angebot/Abo kann erneut eine Rechnung erzeugen.' : ''}`);
                      onClose();
                    } catch (e: any) { alert(e.message); }
                  }}
                  title="Rechnung löschen (versendete erfordern Grund)"
                  style={{ color: 'var(--danger)' }}
                >
                  Löschen
                </button>
              </>
            )}
            <button className="modal-close" onClick={handleClose}><X size={18}/></button>
          </div>
        </div>
        <div style={{display:'flex',borderBottom:'1px solid var(--border2)',flexShrink:0}}>
          {([['preview','👁 Vorschau & Senden'],['reminders','⏰ Mahnungen'],['edit','✏️ Bearbeiten']] as const).map(([v,l])=>(
            <button key={v} className={`tab${tab===v?' active':''}`} onClick={()=>setTab(v as any)}>{l}</button>
          ))}
        </div>
        <div style={{flex:1,overflow:'auto'}}>
          {tab==='preview' && (
            <>
              <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border2)',background:'var(--bg)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <input
                  className="form-input"
                  type="email"
                  value={sendEmail}
                  onChange={(e) => { setSendEmail(e.target.value); setSendType('invoice'); }}
                  placeholder="Rechnung per Mail senden an: kunde@beispiel.de"
                  style={{flex:1,minWidth:240}}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => { setSendType('invoice'); doSend(); }}
                  disabled={!sendEmail || loading}
                >
                  <Send size={13}/>{loading && sendType==='invoice' ? 'Sende…' : 'Rechnung senden'}
                </button>
              </div>
              <iframe srcDoc={html} style={{width:'100%',minHeight:480,border:'none'}} title="Rechnungsvorschau"/>
            </>
          )}
          {tab==='edit' && (
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Empfänger / Kundenname</label>
                  <input className="form-input" value={editForm.client_name} onChange={e=>setEdit((f:any)=>({...f,client_name:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Fällig am</label>
                  <input className="form-input" type="date" value={editForm.due_date} onChange={e=>setEdit((f:any)=>({...f,due_date:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Positionen</label>
                <LineItemsEditor
                  value={editForm.line_items}
                  onChange={(items)=>markEdit({ line_items: items })}
                  vatRate={editForm.vat_rate}
                />
                <p className="form-hint" style={{marginTop:6}}>Jede Position kann eine eigene MwSt haben (Spalte „MwSt"). Default kommt aus dem Inventar-Artikel.</p>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">MwSt. (%)</label>
                  <select className="form-select" value={editForm.vat_rate} onChange={e=>setEdit((f:any)=>({...f,vat_rate:+e.target.value}))}>
                    {[0,7,19].map(r=><option key={r} value={r}>{r} %</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Beschreibung (Übersicht / kurz)</label>
                  <input className="form-input" value={editForm.description} onChange={e=>setEdit((f:any)=>({...f,description:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Interne Notiz</label>
                <textarea className="form-textarea" value={editForm.notes} onChange={e=>setEdit((f:any)=>({...f,notes:e.target.value}))} rows={2}/>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <button className="btn btn-primary" onClick={saveEdit} disabled={loading}>
                  <CheckCircle size={13}/>{loading?'Speichert…':'Speichern'}
                </button>
                {savedFlash && <span className="badge badge-ok" style={{fontSize:12}}>✓ Gespeichert</span>}
                {dirty && !savedFlash && <span className="badge badge-warn" style={{fontSize:11}}>Ungespeicherte Änderungen</span>}
              </div>
            </div>
          )}

          {tab==='reminders' && (
            <div className="modal-body">
              <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:14}}>
                <div className="bold sm" style={{marginBottom:6}}>Mahnstufen-Status</div>
                <div className="muted sm">
                  Bisher versendet: <strong>{inv.reminder_count || 0}</strong> Mahnung(en){inv.reminder_sent_at ? ` · zuletzt am ${fmtDate(inv.reminder_sent_at)}` : ''}
                </div>
                {inv.due_date && new Date(inv.due_date) < new Date() && (
                  <div className="err-c sm" style={{marginTop:6}}>
                    <AlertTriangle size={11} style={{verticalAlign:'-1px',marginRight:4}}/>
                    Überfällig seit {fmtDate(inv.due_date)}
                  </div>
                )}
              </div>

              {/* Full invoice preview — so the user sees the actual document
                  the customer received, with the dunning header on top. */}
              <div style={{background:'var(--bg)',padding:14,borderRadius:'var(--r-lg)',marginBottom:14,border:'1px solid var(--border)'}}>
                <div className="bold sm" style={{marginBottom:8,color:'var(--ink2)'}}>📄 Rechnung im Detail</div>
                <iframe srcDoc={html} style={{width:'100%',minHeight:380,border:'1px solid var(--border)',borderRadius:'var(--r)',background:'#fff'}} title="Rechnungsvorschau in Mahnung"/>
              </div>

              <div style={{marginBottom:14}}>
                <label className="form-label">Mahnstufe wählen</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
                  {dunningLevels.map((dl:any)=>(
                    <button
                      key={dl.id}
                      className={`btn ${reminderLevel===dl.level?'btn-primary':'btn-secondary'} btn-sm`}
                      onClick={()=>setReminderLevel(dl.level)}
                    >
                      Stufe {dl.level} — {dl.name}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const lvl = dunningLevels.find((d:any)=>d.level===reminderLevel);
                if (!lvl) return null;
                const color = reminderLevel > 1 ? 'var(--danger)' : 'var(--warn)';
                const subjectLine = reminderLevel === 1 ? 'Zahlungserinnerung' : `${reminderLevel - 1}. Mahnung`;
                return (
                  <div style={{border:`2px solid ${color}`,borderRadius:'var(--r-lg)',padding:0,background:'#fff',overflow:'hidden'}}>
                    {/* Letterhead-ish header */}
                    <div style={{padding:'14px 20px',background:color,color:'#fff'}}>
                      <div style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:700}}>{lvl.name}</div>
                      <div style={{fontSize:12,opacity:.85,marginTop:2}}>{subjectLine} · {fmtDate(new Date().toISOString())}</div>
                    </div>
                    <div style={{padding:20}}>
                      <p style={{fontSize:13,marginBottom:14}}>Sehr geehrte Damen und Herren,</p>
                      <p style={{fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap',marginBottom:18}}>{lvl.text_template}</p>

                      <div className="bold sm" style={{marginBottom:8}}>Offene Rechnung</div>
                      <table style={{width:'100%',fontSize:12,marginBottom:14,borderCollapse:'collapse'}}>
                        <thead>
                          <tr style={{background:'var(--bg)',borderBottom:'1px solid var(--border)'}}>
                            <th style={{padding:8,textAlign:'left'}}>Position</th>
                            <th style={{padding:8,textAlign:'right'}}>Menge</th>
                            <th style={{padding:8,textAlign:'right'}}>Einzel</th>
                            <th style={{padding:8,textAlign:'right'}}>Gesamt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            try {
                              const items = JSON.parse(inv.line_items || '[]');
                              return items.length > 0 ? items.map((it:any, i:number) => (
                                <tr key={i} style={{borderBottom:'1px solid var(--border2)'}}>
                                  <td style={{padding:8}}>{it.description}</td>
                                  <td style={{padding:8,textAlign:'right'}}>{it.qty}</td>
                                  <td style={{padding:8,textAlign:'right'}}>{fmt(it.unit_price)}</td>
                                  <td style={{padding:8,textAlign:'right',fontWeight:600}}>{fmt((it.qty||0)*(it.unit_price||0))}</td>
                                </tr>
                              )) : <tr><td colSpan={4} style={{padding:8}}>{inv.description}</td></tr>;
                            } catch { return null; }
                          })()}
                        </tbody>
                      </table>

                      <div style={{background:'var(--bg)',borderRadius:'var(--r)',padding:14,fontSize:13}}>
                        <div className="fb" style={{marginBottom:4}}><span>Rechnungs-Nr.</span><strong>{inv.invoice_number}</strong></div>
                        <div className="fb" style={{marginBottom:4}}><span>Rechnungsdatum</span><span>{fmtDate(inv.date)}</span></div>
                        <div className="fb" style={{marginBottom:4}}><span>Fälligkeit</span><span className="err-c">{fmtDate(inv.due_date)}</span></div>
                        <div className="fb" style={{marginBottom:4}}><span>Ursprünglicher Betrag</span><span>{fmt(inv.gross)}</span></div>
                        <div className="fb" style={{marginBottom:4}}><span>Mahngebühr (Stufe {reminderLevel})</span><span style={{color}}>{fmt(lvl.fee)}</span></div>
                        <div style={{borderTop:'2px solid var(--border)',marginTop:8,paddingTop:8}} className="fb">
                          <strong>Gesamt zu zahlen</strong>
                          <strong style={{color, fontSize:16}}>{fmt((inv.gross || 0) + (lvl.fee || 0))}</strong>
                        </div>
                      </div>

                      <p style={{fontSize:12,marginTop:14,color:'var(--ink3)'}}>
                        Bitte überweisen Sie den Betrag binnen 7 Tagen auf das angegebene Konto.
                        Bei Rückfragen wenden Sie sich gerne an uns.
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div style={{marginTop:18,padding:12,background:'var(--bg)',borderRadius:'var(--r)',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                <input
                  className="form-input"
                  type="email"
                  value={sendEmail}
                  onChange={(e) => { setSendEmail(e.target.value); setSendType('reminder'); }}
                  placeholder="Mahnung per Mail senden an: kunde@beispiel.de"
                  style={{flex:1,minWidth:220}}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => { setSendType('reminder'); doSend(); }}
                  disabled={!sendEmail || loading}
                >
                  <Send size={13}/>{loading && sendType==='reminder' ? 'Sende…' : `Mahnung Stufe ${reminderLevel} senden`}
                </button>
              </div>

              <p className="form-hint" style={{marginTop:12}}>
                Mahnstufen können in <strong>Einstellungen → Mahnstufen</strong> angepasst werden (Tage, Gebühr, Text).
              </p>
            </div>
          )}
        </div>
      </div>
      {showPdfPreview && (
        <PdfPreviewModal
          url={`/api/sme/pdf/invoice/${inv.id}`}
          filename={`${inv.invoice_number}.pdf`}
          title={`Rechnung · ${inv.invoice_number}`}
          onClose={() => setShowPdfPreview(false)}
        />
      )}
    </div>
  );
}

export default function Invoices({ initialFilter, initialPrefill, onNavigate }: { initialFilter?: string; initialPrefill?: any; onNavigate?: (page: string, hint?: any) => void } = {}) {
  const [invoices,setInvoices]   = useState<any[]>([]);
  const [customers,setCustomers] = useState<any[]>([]);
  const [sme,setSme]             = useState<any>(null);
  const [filter,setFilter]       = useState<string>(initialFilter && initialFilter !== 'undefined' ? initialFilter : 'Alle');
  const [search,setSearch]       = useState('');
  // Open create-modal only when there's actual prefill data (not just a focus hint)
  const [showNew,setShowNew]     = useState(!!initialPrefill && !initialPrefill.focus_invoice && (initialPrefill.client_name || initialPrefill.customer_id || initialPrefill.description || initialPrefill.line_items));
  const [selected,setSelected]   = useState<any>(null);
  const [form,setForm]           = useState<any>({
    customer_id: initialPrefill?.customer_id || '',
    client_name: initialPrefill?.client_name || '',
    description: initialPrefill?.description || '',
    net: initialPrefill?.net ? String(initialPrefill.net) : '',
    vat_rate: '19',
    due_date: '',
    notes: '',
    line_items: initialPrefill?.line_items || [],
    from_deal_id: initialPrefill?.from_deal_id || null,
  });
  const [formErr,setFormErr]     = useState('');

  // Sync filter prop into local state when parent passes one
  useEffect(() => { if (initialFilter) setFilter(initialFilter); }, [initialFilter]);

  const load = () => Promise.all([api.sme.invoices(),api.sme.customers(),api.sme.profile()]).then(([inv,c,p])=>{setInvoices(inv);setCustomers(c);setSme(p);});
  useEffect(()=>{load();},[]);

  // If parent passed { focus_invoice: id } open that invoice modal once loaded.
  useEffect(() => {
    if (!initialPrefill?.focus_invoice || invoices.length === 0) return;
    const target = invoices.find((i) => i.id === initialPrefill.focus_invoice);
    if (target) {
      setSelected(target);
      // Prevent re-opening when invoices reload
      initialPrefill.focus_invoice = undefined;
      setShowNew(false);
    }
  }, [initialPrefill, invoices]);

  const visible = invoices.filter(i=>{
    const q=search.toLowerCase();
    return (filter==='Alle'||i.status===filter)&&(!q||[i.invoice_number,i.client_name,i.description].some(v=>v?.toLowerCase().includes(q)));
  });

  const create = async () => {
    setFormErr('');
    if (!form.client_name) { setFormErr('Kunde erforderlich'); return; }
    if (!form.line_items?.length) { setFormErr('Mindestens eine Position erforderlich'); return; }
    try {
      await api.sme.createInvoice({ ...form, vat_rate: +form.vat_rate });
      setShowNew(false);
      setForm({ customer_id: '', client_name: '', description: '', net: '', vat_rate: '19', due_date: '', notes: '', line_items: [] });
      load();
    } catch (e: any) { setFormErr(e.message); }
  };
  const statusBorder = { Bezahlt:'var(--ok)', Offen:'var(--primary)', Überfällig:'var(--danger)', Entwurf:'var(--border)', Storniert:'var(--ink4)' };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Rechnungen ({visible.length})</span>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <div style={{position:'relative'}}><Search size={13} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--ink3)'}}/>
              <input className="form-input" style={{paddingLeft:28,width:160}} placeholder="Suchen…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onNavigate?.('pipeline')}
              title="Rechnungen entstehen aus Pipeline-Deals oder aus wiederkehrenden Abos"
            >
              <Plus size={13}/>Neue Rechnung über Pipeline
            </button>
          </div>
        </div>

        <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border2)', padding: '10px 18px', fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6 }}>
          💡 Rechnungen entstehen ausschließlich aus <strong>Pipeline-Deals</strong> (wenn ein Deal als „Gewonnen" markiert wird oder ein Angebot in Rechnung umgewandelt wird) oder aus <strong>Wiederkehrenden Abos</strong>. So bleibt der Workflow sauber und es entstehen keine isolierten Rechnungen ohne Quelle.
        </div>

        <div style={{display:'flex',borderBottom:'1px solid var(--border2)',overflowX:'auto',padding:'0 18px'}}>
          {STATUSES.map(s=>(
            <button key={s} className={`tab${filter===s?' active':''}`} onClick={()=>setFilter(s)}>
              {s}{s!=='Alle'&&<span style={{marginLeft:4,background:'var(--border)',borderRadius:10,padding:'0 5px',fontSize:10}}>{invoices.filter(i=>i.status===s).length}</span>}
            </button>
          ))}
        </div>

        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nummer</th><th>Kunde</th><th>Leistung</th><th>Netto</th><th>Brutto</th><th>Fällig</th><th title="Klicken zum Ändern">Status</th><th>Aktionen</th></tr></thead>
            <tbody>
              {visible.map(i=>(
                <tr key={i.id} className="clickable" onClick={()=>setSelected(i)} style={{borderLeft:`3px solid ${statusBorder[i.status]||'transparent'}`}}>
                  <td><div style={{display:'flex',alignItems:'center',gap:7}}><FileText size={14} color="var(--ink3)"/><span className="bold sm">{i.invoice_number}</span></div></td>
                  <td className="sm">{i.client_name}</td>
                  <td className="muted sm" style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.description}</td>
                  <td className="sm">{fmt(i.net)}</td>
                  <td className="bold">{fmt(i.gross)}</td>
                  <td className="sm" style={{color:i.status==='Überfällig'?'var(--danger)':''}}>{fmtDate(i.due_date)}</td>
                  <td onClick={(e)=>e.stopPropagation()}>
                    <select
                      className="form-select"
                      style={{ width: 'auto', fontSize: 12, padding: '4px 8px', height: 28, color: statusBorder[i.status] || 'inherit', fontWeight: 600 }}
                      value={i.status}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        if (newStatus === i.status) return;
                        const patch: any = { status: newStatus };
                        if (newStatus === 'Bezahlt') patch.paid_at = new Date().toISOString().slice(0, 10);
                        if (newStatus === 'Offen' && !i.sent_at) patch.sent_at = new Date().toISOString();
                        try { await api.sme.updateInvoice(i.id, patch); load(); }
                        catch (err: any) { alert(err.message); }
                      }}
                      title="Status der Rechnung ändern"
                    >
                      {['Entwurf','Offen','Bezahlt','Überfällig','Storniert'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',gap:4}}>
                      <button title="Vorschau öffnen" className="btn btn-ghost btn-sm" onClick={()=>setSelected(i)}><Eye size={12}/></button>
                      {i.status === 'Entwurf' && (
                        <button
                          title="Als versendet markieren (Status → Offen)"
                          className="btn btn-ghost btn-sm"
                          onClick={async () => {
                            try { await api.sme.updateInvoice(i.id, { status: 'Offen', sent_at: new Date().toISOString() }); load(); }
                            catch (err: any) { alert(err.message); }
                          }}
                        >
                          <Send size={12}/>
                        </button>
                      )}
                      {(i.status === 'Offen' || i.status === 'Überfällig') && (
                        <button
                          title="Als bezahlt markieren"
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--ok)' }}
                          onClick={async () => {
                            try { await api.sme.updateInvoice(i.id, { status: 'Bezahlt', paid_at: new Date().toISOString().slice(0, 10) }); load(); }
                            catch (err: any) { alert(err.message); }
                          }}
                        >
                          <CheckCircle size={12}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length===0&&<tr><td colSpan={8} style={{textAlign:'center',padding:32,color:'var(--ink3)',fontSize:13}}>Keine Rechnungen{filter!=='Alle'?` mit Status „${filter}"`:''} — entstehen aus Pipeline-Deals oder Abos. <button className="btn btn-primary btn-sm" style={{marginLeft:12}} onClick={() => onNavigate?.('pipeline')}><Plus size={12}/>Zur Pipeline</button></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected&&<InvoiceModal inv={selected} sme={sme} onClose={()=>setSelected(null)} onRefresh={load}/>}

      {showNew && (
        <Modal
          title="Neue Rechnung"
          onClose={() => setShowNew(false)}
          large
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={create} disabled={!form.client_name || (form.line_items?.length || 0) === 0}>
                <Plus size={13}/>Erstellen
              </button>
            </>
          }
        >
          {formErr && <div className="notice err">{formErr}</div>}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kunde *</label>
              <select className="form-select" value={form.customer_id} onChange={(e) => {
                const c = customers.find((x) => x.id === e.target.value);
                setForm((f: any) => ({ ...f, customer_id: e.target.value, client_name: c ? `${c.name}${c.company ? ' – ' + c.company : ''}` : f.client_name }));
              }}>
                <option value="">– Manuell eingeben –</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ' – ' + c.company : ''}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Zahlungsziel</label>
              <input className="form-input" type="date" value={form.due_date} onChange={(e) => setForm((f: any) => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
          {!form.customer_id && (
            <div className="form-group">
              <label className="form-label">Kundenname *</label>
              <input className="form-input" value={form.client_name} onChange={(e) => setForm((f: any) => ({ ...f, client_name: e.target.value }))} placeholder="Muster GmbH" />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Positionen * (Inventar-Artikel oder Sonderposten)</label>
            <LineItemsEditor
              value={form.line_items || []}
              onChange={(items) => setForm((f: any) => ({ ...f, line_items: items }))}
              vatRate={+form.vat_rate || 19}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">MwSt. (%)</label>
              <select className="form-select" value={form.vat_rate} onChange={(e) => setForm((f: any) => ({ ...f, vat_rate: e.target.value }))}>
                {['0', '7', '19'].map((r) => <option key={r} value={r}>{r} %</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Kurz-Beschreibung (für Übersicht)</label>
              <input className="form-input" value={form.description} onChange={(e) => setForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="z.B. Beratungsleistung Mai 2025" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
