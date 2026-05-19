import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, X, Search, Users, Upload, Download, Tag, Trash2, CheckCircle, Mail, Send, Info, Edit2, Save, LayoutGrid, List, Rows } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api';
import { Badge, Modal, Empty } from '../../components/ui';
import { InvoiceModal } from './Invoices';
import { useSort } from '../../hooks/useSort';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';

const STATUS_OPTS = ['Aktiv', 'Lead', 'Warm', 'Inaktiv'];
const TYPE_OPTS   = ['Kunde', 'Interessent', 'Partner', 'Lieferant', 'Inaktiv'];

interface CustomerGroup { id: string; name: string; color?: string }

function CustomerModal({ id, all, onClose, onNavigate }: {
  id: string;
  all: any[];
  onClose: () => void;
  onNavigate?: (page: string, ...args: any[]) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<'info' | 'invoices' | 'connections' | 'files' | 'timeline'>('info');
  const [sme, setSme] = useState<any>(null);
  const [openInvoice, setOpenInvoice] = useState<any>(null);
  const [composeFor, setComposeFor] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = () => api.sme.customer(id).then(setData);

  // CRITICAL: all hooks must run in the same order every render. Previously
  // there was an `if (!data) return null;` BEFORE one of the useEffects which
  // caused the "Rendered more hooks than during the previous render" crash on
  // re-mount once data arrived. All useEffects now sit above the early return.
  useEffect(() => { load(); }, [id]);
  useEffect(() => { api.sme.profile().then(setSme).catch(() => setSme(null)); }, []);
  useEffect(() => {
    if (tab === 'timeline') api.get<any[]>(`/sme/activity/${id}`).then(setTimeline).catch(() => setTimeline([]));
  }, [tab, id]);

  if (!data) return null;

  const c = data;
  const referredBy = all.find((x) => x.id === c.referred_by);
  const invoiceCount   = data.invoices?.length || 0;
  const referralCount  = (data.referrals?.length || 0) + (referredBy ? 1 : 0);
  const fileCount      = data.files?.length || 0;

  const TAB_LABELS: Record<typeof tab, string> = {
    info:        'Info',
    timeline:    'Aktivität',
    invoices:    `Rechnungen${invoiceCount ? ` (${invoiceCount})` : ''}`,
    connections: `Verbindungen${referralCount ? ` (${referralCount})` : ''}`,
    files:       `Dateien${fileCount ? ` (${fileCount})` : ''}`,
  };

  const downloadDsgvo = () => {
    const token = localStorage.getItem('dd_token');
    fetch(`/api/sme/activity/${id}/dsgvo`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `dsgvo-${c.name}.pdf`; a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => alert(e.message));
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
        <div className="modal-hd" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar" style={{ fontSize: 14, width: 44, height: 44 }}>
              {c.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="modal-title">{c.name}</div>
              <div className="muted sm">{c.company} {c.city ? `· ${c.city}` : ''}</div>
            </div>
            <Badge status={c.type} />
            <Badge status={c.status} />
          </div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border2)', flexShrink: 0 }}>
          {(Object.keys(TAB_LABELS) as Array<typeof tab>).map((t) => (
            <button
              key={t}
              className={`tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'info' && (
            <div>
              {!editing ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setEditForm({ ...c }); setEditing(true); }}
                    >
                      <Edit2 size={12} />Stammdaten bearbeiten
                    </button>
                  </div>
                  {[
                    ['📧 E-Mail',          c.email],
                    ['📞 Telefon',         c.phone || c.mobile],
                    ['🏠 Adresse',         [c.address, c.plz, c.city].filter(Boolean).join(', ')],
                    ['🌐 Webseite',        c.website],
                    ['🎂 Geburtstag',      c.birthday ? fmtDate(c.birthday) : null],
                    ['🔢 Steuernr.',       c.tax_id],
                    ['🏷️ Typ',             c.type],
                    ['📊 Gruppe',          c.group_name],
                    ['📅 Letzter Kontakt', c.last_contact ? fmtDate(c.last_contact) : null],
                    ['✍️ Notizen',         c.notes],
                  ].map(([l, v]) => v ? (
                    <div key={l as string} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
                      <span className="muted sm" style={{ width: 140, flexShrink: 0 }}>{l}</span>
                      <span className="sm">{v}</span>
                    </div>
                  ) : null)}
                  {![c.email, c.phone, c.mobile, c.address, c.notes].some(Boolean) && (
                    <p className="muted sm" style={{ padding: '14px 0' }}>Keine zusätzlichen Informationen hinterlegt.</p>
                  )}
                </>
              ) : (
                <div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input className="form-input" value={editForm.name || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Unternehmen</label>
                      <input className="form-input" value={editForm.company || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, company: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">E-Mail</label>
                      <input className="form-input" type="email" value={editForm.email || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Telefon (Festnetz)</label>
                      <input className="form-input" value={editForm.phone || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mobil</label>
                      <input className="form-input" value={editForm.mobile || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, mobile: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Adresse <span className="muted" style={{ fontSize: 11 }}>(Tippen für Vorschläge — OpenStreetMap)</span></label>
                    <AddressAutocomplete
                      value={editForm.address || ''}
                      onChange={(v) => setEditForm((f: any) => ({ ...f, address: v }))}
                      onPick={(a) => setEditForm((f: any) => ({
                        ...f,
                        address: a.street,
                        plz: a.plz || f.plz,
                        city: a.city || f.city,
                        country: a.country || f.country,
                        lat: a.lat, lng: a.lng,
                      }))}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">PLZ</label><input className="form-input" value={editForm.plz || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, plz: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Stadt</label><input className="form-input" value={editForm.city || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, city: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Land</label><input className="form-input" value={editForm.country || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, country: e.target.value }))} placeholder="Deutschland" /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Webseite</label><input className="form-input" value={editForm.website || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, website: e.target.value }))} placeholder="https://…" /></div>
                    <div className="form-group"><label className="form-label">Geburtstag</label><input className="form-input" type="date" value={editForm.birthday || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, birthday: e.target.value }))} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">USt-IdNr. / Steuernummer</label><input className="form-input" value={editForm.tax_id || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, tax_id: e.target.value }))} /></div>
                    <div className="form-group">
                      <label className="form-label">Typ</label>
                      <select className="form-select" value={editForm.type || 'Interessent'} onChange={(e) => setEditForm((f: any) => ({ ...f, type: e.target.value }))}>
                        {['Kunde','Interessent','Partner','Lieferant','Inaktiv'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select className="form-select" value={editForm.status || 'Aktiv'} onChange={(e) => setEditForm((f: any) => ({ ...f, status: e.target.value }))}>
                        {['Aktiv','Warm','Lead','Inaktiv'].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Gruppe / Branche</label>
                      <input className="form-input" value={editForm.group_name || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, group_name: e.target.value }))} placeholder="z.B. Handwerk, Gastronomie…" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Geworben durch</label>
                      <select className="form-select" value={editForm.referred_by || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, referred_by: e.target.value }))}>
                        <option value="">– Keine Empfehlung –</option>
                        {all.filter((x: any) => x.id !== id).map((x: any) => (
                          <option key={x.id} value={x.id}>{x.name}{x.company ? ` – ${x.company}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notizen</label>
                    <textarea className="form-textarea" rows={3} value={editForm.notes || ''} onChange={(e) => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setEditing(false)}>Abbrechen</button>
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        setSaving(true);
                        try { await api.sme.updateCustomer(id, editForm); await load(); setEditing(false); }
                        catch (e: any) { alert(e.message); }
                        finally { setSaving(false); }
                      }}
                      disabled={saving}
                    >
                      <Save size={13} />{saving ? 'Speichert…' : 'Speichern'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'invoices' && (
            <div>
              {invoiceCount === 0 ? (
                <p className="muted sm" style={{ padding: '14px 0' }}>Noch keine Rechnungen für diesen Kunden.</p>
              ) : (
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr><th>Nummer</th><th>Beschreibung</th><th>Datum</th><th>Brutto</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((i: any) => (
                        <tr key={i.id} className="clickable" onClick={() => setOpenInvoice(i)}>
                          <td className="bold sm">{i.invoice_number}</td>
                          <td className="sm">{i.description}</td>
                          <td className="muted sm">{fmtDate(i.date)}</td>
                          <td>{fmt(i.gross)}</td>
                          <td><Badge status={i.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'connections' && (
            <div>
              {referralCount === 0 ? (
                <p className="muted sm" style={{ padding: '14px 0' }}>Keine Verbindungen zu anderen Kunden.</p>
              ) : (
                <>
                  {referredBy && (
                    <div style={{ marginBottom: 18 }}>
                      <div className="bold sm" style={{ marginBottom: 8 }}>👤 Empfohlen von</div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { onClose(); setTimeout(() => onNavigate && onNavigate('customers', referredBy.id), 100); }}
                      >
                        {referredBy.name} ({referredBy.company || '–'})
                      </button>
                    </div>
                  )}
                  {data.referrals?.length > 0 && (
                    <>
                      <div className="bold sm" style={{ marginBottom: 8 }}>👥 Hat folgende Kunden empfohlen</div>
                      {data.referrals.map((r: any) => (
                        <div key={r.id} style={{ padding: '6px 0', fontSize: 13 }}>→ {r.name} ({r.company || '–'})</div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'timeline' && (
            <div>
              {timeline.length === 0 ? (
                <p className="muted sm" style={{ padding: '14px 0' }}>Noch keine Aktivität für diesen Kunden.</p>
              ) : (
                <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 18, marginLeft: 6 }}>
                  {timeline.map((a: any, i: number) => (
                    <div key={i} style={{ position: 'relative', paddingBottom: 14 }}>
                      <span style={{ position: 'absolute', left: -25, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)' }} />
                      <div className="bold sm">{a.title}</div>
                      <div className="muted sm" style={{ marginTop: 2 }}>{a.body}</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{fmtDate(a.at)} · {a.kind}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div>
              {fileCount === 0 ? (
                <p className="muted sm" style={{ padding: '14px 0' }}>Noch keine Dateien zu diesem Kunden hochgeladen.</p>
              ) : (
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th>Dateiname</th><th>Hochgeladen</th><th>Größe</th></tr></thead>
                    <tbody>
                      {data.files.map((f: any) => (
                        <tr key={f.id}>
                          <td className="bold sm">{f.original_name}</td>
                          <td className="muted sm">{fmtDate(f.uploaded_at)}</td>
                          <td className="muted sm">{f.size ? `${(f.size / 1024).toFixed(0)} KB` : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={downloadDsgvo} title="DSGVO-Auskunft als PDF — alle Daten über diesen Kunden">
            📄 DSGVO-Auskunft
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Schließen</button>
          {c.email && (
            <button className="btn btn-primary" onClick={() => setComposeFor(c)}>
              <Mail size={13} />Mail schreiben
            </button>
          )}
        </div>
      </div>

      {openInvoice && (
        <InvoiceModal
          inv={openInvoice}
          sme={sme}
          onClose={() => setOpenInvoice(null)}
          onRefresh={() => { load(); setOpenInvoice(null); }}
        />
      )}

      {composeFor && (
        <QuickComposeModal
          to={composeFor.email}
          recipientName={composeFor.name}
          onClose={() => setComposeFor(null)}
        />
      )}
    </div>
  );
}

// ── Quick compose mail straight from a customer ─────────────────────────
function QuickComposeModal({
  to,
  recipientName,
  onClose,
}: {
  to: string;
  recipientName?: string;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState(recipientName ? `Hallo ${recipientName.split(' ')[0]},\n\n` : '');
  const [sending, setSending] = useState(false);
  const [status, setStatus]   = useState<any>(null);

  useEffect(() => { api.get<any>('/sme/mail/status').then(setStatus).catch(() => setStatus(null)); }, []);

  const send = async () => {
    if (!subject.trim()) { alert('Betreff erforderlich'); return; }
    setSending(true);
    try {
      await api.post('/sme/mail/send', { to, subject, text: body });
      alert('✓ Mail versendet');
      onClose();
    } catch (e: any) { alert(e.message); }
    finally { setSending(false); }
  };

  return (
    <Modal
      title={`Mail an ${recipientName || to}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={send} disabled={sending || !status?.smtpConfigured}>
            <Send size={13} />{sending ? 'Sendet…' : 'Senden'}
          </button>
        </>
      }
    >
      {status && !status.smtpConfigured && (
        <div className="notice err">
          SMTP nicht konfiguriert. Geh zu Einstellungen → Postfach und hinterlege deine Mail-Zugangsdaten, dann kannst du direkt von hier mailen.
        </div>
      )}
      <div className="form-group">
        <label className="form-label">An</label>
        <input className="form-input" value={to} readOnly style={{ background: 'var(--bg2)' }} />
      </div>
      <div className="form-group">
        <label className="form-label">Betreff *</label>
        <input className="form-input" value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label">Nachricht</label>
        <textarea className="form-textarea" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {status?.address && (
        <p className="form-hint">Wird gesendet als: {status.displayName ? `${status.displayName} <${status.address}>` : status.address}</p>
      )}
    </Modal>
  );
}

export default function Customers({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [groups, setGroups]       = useState<CustomerGroup[]>([]);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('');
  const [view, setView] = useState<'cards' | 'table' | 'compact'>(() => {
    try { return (localStorage.getItem('dd_customers_view') as any) || 'cards'; } catch { return 'cards'; }
  });
  useEffect(() => { try { localStorage.setItem('dd_customers_view', view); } catch { /* ignore */ } }, [view]);
  const [detail, setDetail]       = useState<string | null>(null);
  const [showNew, setShowNew]     = useState(false);
  const [showGroups, setShowGroups]   = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [form, setForm] = useState<any>({
    name: '', company: '', email: '', phone: '', mobile: '', website: '',
    address: '', city: '', plz: '', country: 'Deutschland',
    birthday: '', tax_id: '',
    type: 'Interessent', group_name: '', status: 'Aktiv',
    notes: '', referred_by: '',
  });
  const [formErr, setFormErr] = useState('');

  const load = () => Promise.all([
    api.sme.customers(),
    api.get<CustomerGroup[]>('/sme/customer-groups'),
  ]).then(([cs, gs]) => { setCustomers(cs); setGroups(gs); });
  useEffect(() => { load(); }, []);

  // ── CSV export — Excel-friendly: BOM + semicolons ────────────────────
  const exportCsv = () => {
    const cols = [
      'Name', 'Unternehmen', 'E-Mail', 'Telefon', 'Mobil', 'Webseite',
      'Adresse', 'PLZ', 'Stadt', 'Land',
      'Typ', 'Gruppe', 'Status', 'Geburtstag', 'Steuernummer',
      'Letzter Kontakt', 'Notizen',
    ];
    const keys = [
      'name', 'company', 'email', 'phone', 'mobile', 'website',
      'address', 'plz', 'city', 'country',
      'type', 'group_name', 'status', 'birthday', 'tax_id',
      'last_contact', 'notes',
    ];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(';')];
    for (const c of customers) {
      lines.push(keys.map((k) => escape(c[k])).join(';'));
    }
    // UTF-8 BOM so Excel detects encoding correctly.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kunden-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => customers.filter((c) => {
    const q = search.toLowerCase();
    const matchQ = !q || [c.name, c.company, c.email, c.city].some((v) => v?.toLowerCase().includes(q));
    const matchF = !filter || c.type === filter;
    return matchQ && matchF;
  }), [customers, search, filter]);
  const { sorted: visible, headerProps, sortIndicator, sortKey, direction, setSortKey, setDirection } = useSort(filtered, 'name');

  // Unique company list from existing customers — feeds the "Unternehmen wählen" dropdown
  const companies = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => { if (c.company) set.add(c.company); });
    return Array.from(set).sort();
  }, [customers]);

  const save = async () => {
    setFormErr('');
    try {
      await api.sme.createCustomer(form);
      setShowNew(false);
      setForm({name:'',company:'',email:'',phone:'',mobile:'',address:'',city:'',plz:'',birthday:'',tax_id:'',type:'Interessent',group_name:'',status:'Aktiv',notes:'',referred_by:''});
      load();
    } catch(e) { setFormErr(e.message); }
  };

  const typeColor = {Kunde:'var(--ok)',Interessent:'var(--primary)',Partner:'var(--accent)',Lieferant:'var(--warn)',Inaktiv:'var(--ink3)'};

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Kunden ({visible.length})</span>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{position:'relative'}}>
              <Search size={13} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--ink3)'}}/>
              <input className="form-input" style={{paddingLeft:28,width:180}} placeholder="Suchen…"
                value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <select className="form-select" style={{width:130}} value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="">Alle Typen</option>
              {TYPE_OPTS.map(t=><option key={t}>{t}</option>)}
            </select>
            {/* View switcher */}
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              {([
                ['cards', LayoutGrid, 'Kartenansicht'],
                ['table', Rows, 'Tabellenansicht'],
                ['compact', List, 'Kompakte Listenansicht'],
              ] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  title={label}
                  style={{
                    padding: '6px 10px',
                    border: 'none',
                    cursor: 'pointer',
                    background: view === v ? 'var(--primary)' : 'transparent',
                    color: view === v ? '#fff' : 'var(--ink3)',
                  }}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
            {/* Sort dropdown — only useful outside of the table view */}
            {view !== 'table' && (
              <select
                className="form-select"
                style={{ width: 'auto', fontSize: 12, padding: '6px 8px' }}
                value={`${String(sortKey)}:${direction}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':');
                  setSortKey(k as any);
                  setDirection(d as 'asc' | 'desc');
                }}
                title="Sortierung wählen"
              >
                <option value="name:asc">Name (A–Z)</option>
                <option value="name:desc">Name (Z–A)</option>
                <option value="company:asc">Unternehmen (A–Z)</option>
                <option value="type:asc">Typ</option>
                <option value="status:asc">Status</option>
                <option value="city:asc">Stadt (A–Z)</option>
                <option value="last_contact:desc">Letzter Kontakt (neueste zuerst)</option>
                <option value="last_contact:asc">Letzter Kontakt (älteste zuerst)</option>
                <option value="created_at:desc">Angelegt (neueste zuerst)</option>
              </select>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowGroups(true)} title="Branchen-Gruppen verwalten (Handwerk, Gastronomie etc.)">
              <Tag size={13}/>Gruppen
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(true)} title="Kunden aus CSV oder Outlook-Export hochladen">
              <Upload size={13}/>Import
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} title="Alle sichtbaren Kunden als CSV-Datei herunterladen">
              <Download size={13}/>Export
            </button>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)} title="Neuen Kunden anlegen"><Plus size={13}/>Neuer Kunde</button>
          </div>
        </div>

        {visible.length === 0 ? (
          <Empty icon={<Users size={32}/>} text="Keine Kunden gefunden" action={<button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)}><Plus size={13}/>Ersten Kunden anlegen</button>}/>
        ) : view === 'cards' ? (
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {visible.map((c) => (
              <button key={c.id} onClick={() => setDetail(c.id)} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
                padding: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8,
                transition: 'all .15s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar-sm" style={{ background: typeColor[c.type] + '22', color: typeColor[c.type], width: 38, height: 38, borderRadius: 19, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(c.company || c.name).slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bold sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || c.name}</div>
                    {c.company && c.name && c.name !== c.company && (
                      <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <Badge status={c.type}/>
                  <Badge status={c.status}/>
                </div>
                {c.email && <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📧 {c.email}</div>}
                {c.phone && <div className="muted" style={{ fontSize: 11 }}>📞 {c.phone}</div>}
                {c.city && <div className="muted" style={{ fontSize: 11 }}>📍 {c.city}</div>}
                {c.last_contact && <div className="muted" style={{ fontSize: 10, borderTop: '1px solid var(--border2)', paddingTop: 6, marginTop: 4 }}>Zuletzt: {fmtDate(c.last_contact)}</div>}
              </button>
            ))}
          </div>
        ) : view === 'compact' ? (
          <div style={{ padding: '4px 0' }}>
            {visible.map((c) => (
              <div
                key={c.id}
                className="clickable"
                onClick={() => setDetail(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 18px', borderBottom: '1px solid var(--border2)', cursor: 'pointer' }}
              >
                <div className="avatar-sm" style={{ background: typeColor[c.type] + '22', color: typeColor[c.type], width: 28, height: 28, borderRadius: 14, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {(c.company || c.name).slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="bold sm">{c.company || c.name}</span>
                  {c.company && c.name && c.name !== c.company && <span className="muted sm"> · {c.name}</span>}
                </div>
                <Badge status={c.type}/>
                <span className="muted sm" style={{ width: 100, textAlign: 'right' }}>{c.city || ''}</span>
              </div>
            ))}
          </div>
        ) : (
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th {...headerProps('name')}>Name{sortIndicator('name')}</th>
              <th {...headerProps('company')}>Unternehmen{sortIndicator('company')}</th>
              <th {...headerProps('type')}>Typ{sortIndicator('type')}</th>
              <th {...headerProps('status')}>Status{sortIndicator('status')}</th>
              <th {...headerProps('city')}>Stadt{sortIndicator('city')}</th>
              <th {...headerProps('last_contact')}>Letzter Kontakt{sortIndicator('last_contact')}</th>
              <th>Rechnungen</th>
            </tr></thead>
            <tbody>
              {visible.map(c => (
                <tr key={c.id} className="clickable" onClick={()=>setDetail(c.id)}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:9}}>
                      <div className="avatar-sm" style={{background:typeColor[c.type]+'22',color:typeColor[c.type]}}>
                        {c.name.slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="bold sm">{c.name}</div>
                        {c.email && <div className="muted sm">{c.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="sm">{c.company||'–'}</td>
                  <td><Badge status={c.type}/></td>
                  <td><Badge status={c.status}/></td>
                  <td className="muted sm">{c.city||'–'}</td>
                  <td className="muted sm">{fmtDate(c.last_contact)}</td>
                  <td className="sm">–</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '10px 18px', borderTop: '1px solid var(--border2)', fontSize: 11, color: 'var(--ink3)' }}>
          <Info size={12} /> <span><strong>Typ:</strong> Kunde = aktive Geschäftsbeziehung · Interessent = Lead, noch kein Abschluss · Partner = Kooperation · Lieferant = Zukauf · Inaktiv = ruhend</span>
          <span><strong>Status:</strong> Aktiv = laufende Aufträge · Warm = qualifizierter Lead · Lead = neuer Kontakt · Inaktiv = pausiert</span>
        </div>
      </div>

      {detail && <CustomerModal id={detail} all={customers} onClose={()=>setDetail(null)}/>}

      {showNew && (
        <Modal title="Neuer Kunde" onClose={()=>setShowNew(false)} large footer={<>
          <button className="btn btn-secondary" onClick={()=>setShowNew(false)}>Abbrechen</button>
          <button className="btn btn-primary" onClick={save}><Plus size={13}/>Anlegen</button>
        </>}>
          {formErr && <div className="notice err">{formErr}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus/></div>
            <div className="form-group">
              <label className="form-label">Unternehmen</label>
              <input
                className="form-input"
                list="customer-companies"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Bestehendes wählen oder neues eintippen — leer = keins"
              />
              <datalist id="customer-companies">
                {companies.map((c) => <option key={c} value={c} />)}
              </datalist>
              <p className="form-hint" style={{ marginTop: 4 }}>Tipp: Tippe einen Buchstaben um ein bestehendes Unternehmen vorgeschlagen zu bekommen.</p>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">E-Mail</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Telefon (Festnetz)</label><input className="form-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Mobil</label><input className="form-input" value={form.mobile || ''} onChange={e=>setForm(f=>({...f,mobile:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Typ</label>
              <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {TYPE_OPTS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                {STATUS_OPTS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">USt-IdNr.</label><input className="form-input" value={form.tax_id || ''} onChange={e=>setForm(f=>({...f,tax_id:e.target.value}))} placeholder="DE 123 456 789"/></div>
          </div>
          <div className="form-group">
            <label className="form-label">Adresse <span className="muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>(Tippen für Vorschläge — OpenStreetMap)</span></label>
            <AddressAutocomplete
              value={form.address || ''}
              onChange={(v) => setForm((f) => ({ ...f, address: v }))}
              onPick={(a) => setForm((f) => ({
                ...f,
                address: a.street,
                plz: a.plz || f.plz,
                city: a.city || f.city,
                country: a.country || f.country,
              }))}
            />
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">PLZ</label><input className="form-input" value={form.plz} onChange={e=>setForm(f=>({...f,plz:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Stadt</label><input className="form-input" value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Land</label><input className="form-input" value={form.country || 'Deutschland'} onChange={e=>setForm(f=>({...f,country:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Geburtstag</label><input className="form-input" type="date" value={form.birthday} onChange={e=>setForm(f=>({...f,birthday:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Webseite</label><input className="form-input" value={form.website || ''} onChange={e=>setForm(f=>({...f,website:e.target.value}))} placeholder="https://…"/></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>Gruppe / Branche</span>
                <button type="button" className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'2px 6px'}} onClick={()=>setShowGroups(true)}>
                  + verwalten
                </button>
              </label>
              <select className="form-select" value={form.group_name} onChange={e=>setForm(f=>({...f,group_name:e.target.value}))}>
                <option value="">– Keine –</option>
                {groups.map((g)=><option key={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Empfohlen von</label>
              <select className="form-select" value={form.referred_by} onChange={e=>setForm(f=>({...f,referred_by:e.target.value}))}>
                <option value="">– Niemanden –</option>
                {customers.filter(c=>c.name!==form.name).map(c=><option key={c.id} value={c.id}>{c.name} ({c.company||'–'})</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Notizen</label><textarea className="form-textarea" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}/></div>
        </Modal>
      )}

      {showGroups && (
        <GroupManagerModal
          groups={groups}
          onClose={() => setShowGroups(false)}
          onChanged={load}
        />
      )}

      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); }}
          existingCustomers={customers}
        />
      )}
    </div>
  );
}

// ── Group manager modal ─────────────────────────────────────────────────────
function GroupManagerModal({
  groups,
  onClose,
  onChanged,
}: {
  groups: CustomerGroup[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [list, setList]       = useState<CustomerGroup[]>([...groups]);
  const [newName, setNewName] = useState('');
  const [err, setErr]         = useState('');

  const add = async () => {
    if (!newName.trim()) return;
    setErr('');
    try {
      const r = await api.post<{ id: string }>('/sme/customer-groups', { name: newName.trim() });
      setList((ls) => [...ls, { id: r.id, name: newName.trim() }]);
      setNewName('');
      onChanged();
    } catch (e: any) { setErr(e.message); }
  };

  const rename = async (g: CustomerGroup, name: string) => {
    setList((ls) => ls.map((x) => (x.id === g.id ? { ...x, name } : x)));
  };

  const persistRename = async (g: CustomerGroup) => {
    const current = list.find((x) => x.id === g.id);
    if (!current || current.name === g.name) return;
    try { await api.put(`/sme/customer-groups/${g.id}`, { name: current.name }); onChanged(); }
    catch (e: any) { setErr(e.message); }
  };

  const remove = async (g: CustomerGroup) => {
    if (!confirm(`Gruppe „${g.name}" löschen? Bestehende Kunden bleiben erhalten, verlieren aber die Gruppenzuordnung.`)) return;
    try {
      await api.delete(`/sme/customer-groups/${g.id}`);
      setList((ls) => ls.filter((x) => x.id !== g.id));
      onChanged();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal
      title="Gruppen / Branchen verwalten"
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}><CheckCircle size={13} />Fertig</button>}
    >
      {err && <div className="notice err">{err}</div>}
      <p className="muted sm" style={{ marginBottom: 14 }}>
        Frei wählbare Branchen / Segmente für deine Kunden. Beim Umbenennen werden alle Kunden mit dieser Gruppe automatisch aktualisiert.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {list.map((g) => {
          const orig = groups.find((x) => x.id === g.id);
          const dirty = orig && orig.name !== g.name;
          return (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 'var(--r)',
            }}>
              <Tag size={13} color="var(--ink3)" />
              <input
                className="form-input"
                style={{ flex: 1 }}
                value={g.name}
                onChange={(e) => rename(g, e.target.value)}
                onBlur={() => persistRename(g)}
              />
              {dirty && <span className="badge badge-warn" style={{ fontSize: 10 }}>Geändert</span>}
              <button className="btn btn-ghost btn-sm" onClick={() => remove(g)} style={{ color: 'var(--danger)' }}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
        {list.length === 0 && <p className="muted sm">Noch keine Gruppen angelegt.</p>}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Neue Gruppe — z.B. Großhandel"
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!newName.trim()}>
          <Plus size={12} />Hinzufügen
        </button>
      </div>
    </Modal>
  );
}

// ── CSV import modal ────────────────────────────────────────────────────────
/**
 * Outlook-CSV columns expected (case-insensitive, German/English mix):
 *   - First Name / Vorname → name (with Last Name appended)
 *   - Last Name  / Nachname
 *   - Company    / Firma
 *   - E-mail Address / E-Mail
 *   - Business Phone / Telefon
 *   - Mobile Phone   / Mobil
 *   - Street, City, ZIP, Country
 *   - Notes / Notizen
 * Any column not understood is dropped silently.
 */
const CSV_FIELD_MAP: Record<string, string> = {
  'name': 'name',                'nachname': 'name',           'last name': 'name',
  'vorname': '_firstname',       'first name': '_firstname',
  'company': 'company',          'firma': 'company',           'unternehmen': 'company',
  'e-mail': 'email',             'email': 'email',             'e-mail address': 'email',
  'telefon': 'phone',            'phone': 'phone',             'business phone': 'phone',
  'mobile': 'mobile',            'mobile phone': 'mobile',     'mobil': 'mobile',
  'website': 'website',          'webseite': 'website',        'web page': 'website',
  'adresse': 'address',          'street': 'address',          'business street': 'address',
  'stadt': 'city',               'city': 'city',               'business city': 'city',
  'plz': 'plz',                  'zip': 'plz',                 'postal code': 'plz', 'business postal code': 'plz',
  'land': 'country',             'country': 'country',         'business country': 'country',
  'notizen': 'notes',            'notes': 'notes',
  'gruppe': 'group_name',        'group': 'group_name',
  'typ': 'type',                 'type': 'type',
};

function parseCsv(text: string): Array<Record<string, string>> {
  // Strip BOM if present
  const body = text.replace(/^﻿/, '');
  // Outlook/Excel use ; or , depending on locale. Detect by counting in header.
  const firstLine = body.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  // Tiny CSV parser supporting quoted fields with embedded separators/newlines.
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"' && body[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { cur.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (field !== '' || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ''; }
        if (ch === '\r' && body[i + 1] === '\n') i++;
      } else { field += ch; }
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
    return obj;
  });
}

function CsvImportModal({
  onClose,
  onDone,
  existingCustomers,
}: {
  onClose: () => void;
  onDone: () => void;
  existingCustomers: any[];
}) {
  const [parsed, setParsed] = useState<any[]>([]);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File | null | undefined) => {
    if (!f) return;
    setErr(''); setResult(null); setFileName(f.name);
    try {
      const text = await f.text();
      const rows = parseCsv(text);
      const mapped = rows.map((r) => {
        const out: any = {};
        for (const [key, val] of Object.entries(r)) {
          const target = CSV_FIELD_MAP[key];
          if (!target) continue;
          out[target] = val;
        }
        // Outlook splits first/last name → combine
        if (out._firstname) {
          out.name = [out._firstname, out.name].filter(Boolean).join(' ').trim();
          delete out._firstname;
        }
        return out;
      }).filter((r) => r.name); // need at least a name
      setParsed(mapped);
    } catch (e: any) { setErr('CSV konnte nicht gelesen werden: ' + e.message); }
  };

  const existingEmails = new Set(
    existingCustomers.map((c) => (c.email || '').toLowerCase()).filter(Boolean)
  );
  const dupCount = parsed.filter((p) => p.email && existingEmails.has(p.email.toLowerCase())).length;

  const doImport = async () => {
    setImporting(true); setErr('');
    let created = 0, skipped = 0;
    for (const row of parsed) {
      if (row.email && existingEmails.has(row.email.toLowerCase())) { skipped++; continue; }
      try {
        await api.sme.createCustomer({ ...row, type: row.type || 'Interessent', status: 'Aktiv' });
        created++;
      } catch { skipped++; }
    }
    setResult({ created, skipped });
    setImporting(false);
    if (created > 0) onDone();
  };

  return (
    <Modal
      title="Kunden importieren (CSV / Outlook-Export)"
      onClose={onClose}
      large
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{result ? 'Schließen' : 'Abbrechen'}</button>
          {!result && parsed.length > 0 && (
            <button className="btn btn-primary" onClick={doImport} disabled={importing}>
              <Upload size={13} />{importing ? 'Importiere…' : `${parsed.length - dupCount} Kunden importieren`}
            </button>
          )}
        </>
      }
    >
      {err && <div className="notice err">{err}</div>}

      {result ? (
        <div className="ok-box" style={{ padding: 16, fontSize: 14 }}>
          ✓ Import abgeschlossen. <strong>{result.created}</strong> Kunden angelegt, <strong>{result.skipped}</strong> übersprungen (Duplikate / Fehler).
        </div>
      ) : (
        <>
          <div
            style={{
              border: '2px dashed var(--border)', borderRadius: 'var(--r-lg)',
              padding: 28, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)',
              marginBottom: 14,
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          >
            <Upload size={32} color="var(--ink3)" style={{ marginBottom: 10 }} />
            <div className="bold sm" style={{ marginBottom: 4 }}>
              {fileName || 'CSV-Datei hier ablegen oder klicken'}
            </div>
            <div className="muted sm">
              Erkennt Outlook-Export (.csv) sowie generische CSV mit deutschen oder englischen Spalten.
            </div>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {parsed.length > 0 && (
            <>
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Erkannt: <strong>{parsed.length}</strong> Datensätze
                {dupCount > 0 && <span style={{ marginLeft: 8, color: 'var(--warn)' }}>· {dupCount} Duplikate (E-Mail bereits vorhanden, werden übersprungen)</span>}
              </div>
              <div className="tbl-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Name</th><th>Unternehmen</th><th>E-Mail</th><th>Telefon</th><th>Stadt</th></tr></thead>
                  <tbody>
                    {parsed.slice(0, 50).map((r, i) => {
                      const isDup = r.email && existingEmails.has(r.email.toLowerCase());
                      return (
                        <tr key={i} style={isDup ? { opacity: 0.5 } : undefined}>
                          <td className="bold sm">{r.name}</td>
                          <td className="sm">{r.company || '–'}</td>
                          <td className="muted sm">{r.email || '–'}</td>
                          <td className="muted sm">{r.phone || r.mobile || '–'}</td>
                          <td className="muted sm">{r.city || '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {parsed.length > 50 && (
                  <div className="muted sm" style={{ padding: 8, textAlign: 'center' }}>
                    … + {parsed.length - 50} weitere
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
