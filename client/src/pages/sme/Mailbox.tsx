import { useEffect, useState } from 'react';
import { Inbox, Search, Send, X, RefreshCw, Mail, Paperclip, Reply, PenSquare } from 'lucide-react';
import { api, fmtDate } from '../../api';
import { Modal } from '../../components/ui';

/**
 * Mailbox — live IMAP-backed inbox.
 *
 * The product decision is "no local storage, live every request" — so each
 * folder open hits IMAP fresh. That's 2-5s perceived latency on every
 * navigation; we show a clear loader and a manual refresh button.
 */

interface MailAddress { name?: string; address: string }
interface MailListItem {
  uid: number;
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  date: string;
  size: number;
  seen: boolean;
  flagged: boolean;
}
interface MailDetail {
  uid: number;
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  date: string;
  text: string;
  html: string | null;
  attachments: Array<{ filename: string; size: number; contentType: string }>;
}

function formatAddress(addrs: MailAddress[] | undefined): string {
  if (!addrs?.length) return '';
  return addrs.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ');
}

// Very small HTML sanitiser — strips <script>, on* handlers, and javascript:
// URLs. Not full DOMPurify level; do not run hostile content through this in
// a vacuum. For an internal-tool MVP this is sufficient.
function sanitiseHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export default function Mailbox({ initialTo, initialSubject, initialBody }: {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
}) {
  const [status, setStatus]     = useState<any>(null);
  const [items, setItems]       = useState<MailListItem[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCompose, setShowCompose] = useState(!!initialTo);
  const [composeForm, setComposeForm] = useState({
    to: initialTo || '',
    subject: initialSubject || '',
    body: initialBody || '',
    inReplyTo: '',
  });

  // Status load + initial inbox load (only if configured)
  const loadStatus = () => api.get<any>('/sme/mail/status').then(setStatus).catch(() => setStatus(null));
  useEffect(() => { loadStatus(); }, []);

  const loadInbox = async (q = '') => {
    setLoading(true);
    try {
      const r = await api.get<{ messages: MailListItem[] }>(`/sme/mail/inbox?limit=50${q ? `&search=${encodeURIComponent(q)}` : ''}`);
      setItems(r.messages);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (status?.imapConfigured) loadInbox(); }, [status?.imapConfigured]);

  const openMail = async (uid: number) => {
    setLoadingDetail(true);
    setSelected(null);
    try {
      const d = await api.get<MailDetail>(`/sme/mail/${uid}`);
      setSelected(d);
      // Update read state in list optimistically
      setItems((xs) => xs.map((x) => (x.uid === uid ? { ...x, seen: true } : x)));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const reply = (mail: MailDetail) => {
    const sender = mail.from?.[0]?.address || '';
    const quote = mail.text
      ? '\n\n———\n' + mail.text.split('\n').map((l) => '> ' + l).join('\n')
      : '';
    setComposeForm({
      to: sender,
      subject: mail.subject?.toLowerCase().startsWith('re:') ? mail.subject : `Re: ${mail.subject}`,
      body: quote,
      inReplyTo: '',
    });
    setShowCompose(true);
  };

  const send = async () => {
    if (!composeForm.to.trim() || !composeForm.subject.trim()) {
      alert('Empfänger und Betreff erforderlich.'); return;
    }
    try {
      await api.post('/sme/mail/send', {
        to: composeForm.to,
        subject: composeForm.subject,
        text: composeForm.body,
        inReplyTo: composeForm.inReplyTo || undefined,
      });
      setShowCompose(false);
      setComposeForm({ to: '', subject: '', body: '', inReplyTo: '' });
      alert('✓ Mail versendet');
    } catch (e: any) { alert(e.message); }
  };

  if (!status) return <div className="muted sm" style={{ padding: 40, textAlign: 'center' }}>Lade Postfach-Status…</div>;

  if (!status.imapConfigured || !status.smtpConfigured) {
    return (
      <div className="card">
        <div className="card-header"><span className="card-title">Postfach</span></div>
        <div className="card-body">
          <div style={{ background: 'var(--info-bg)', border: '1px solid var(--info)', borderRadius: 'var(--r)', padding: 18, color: 'var(--info)', lineHeight: 1.7 }}>
            <strong>Mail-Postfach noch nicht eingerichtet.</strong>
            <p style={{ marginTop: 8 }}>
              Du brauchst dein eigenes Mail-Konto (Gmail, Outlook, eigene Domain), um Mahnungen, Rechnungen und Antworten direkt aus der App zu senden — und Eingangspost zu sehen.
            </p>
            <p style={{ marginTop: 8 }}>
              Geh zu <strong>Einstellungen → Postfach</strong> und hinterlege IMAP + SMTP. Bei Gmail/Outlook brauchst du ein App-Passwort (NICHT dein normales Passwort) — siehe Hinweis im Setup.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, alignItems: 'flex-start' }}>
      {/* List */}
      <div className="card">
        <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">
              <Inbox size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Posteingang
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => loadInbox(search)} title="Neu laden">
                <RefreshCw size={12} className={loading ? 'spin' : ''} />
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => { setComposeForm({ to: '', subject: '', body: '', inReplyTo: '' }); setShowCompose(true); }}>
                <PenSquare size={12} />Neu
              </button>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 26, fontSize: 12 }}
              placeholder="Suche im Postfach…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadInbox(search)}
            />
          </div>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Lade Mails…</div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              {search ? 'Keine Treffer.' : 'Posteingang ist leer.'}
            </div>
          )}
          {items.map((m) => (
            <button
              key={m.uid}
              onClick={() => openMail(m.uid)}
              style={{
                width: '100%', textAlign: 'left',
                padding: '10px 14px',
                background: selected?.uid === m.uid ? 'var(--primary-lt)' : 'none',
                border: 'none', borderBottom: '1px solid var(--border2)',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={m.seen ? 'sm' : 'sm bold'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {formatAddress(m.from) || '(unbekannt)'}
                </span>
                <span className="muted" style={{ fontSize: 10, flexShrink: 0, marginLeft: 8 }}>{fmtDate(m.date)}</span>
              </div>
              <div className={m.seen ? 'muted sm' : 'sm bold'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.subject}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="card" style={{ minHeight: 360 }}>
        {loadingDetail && (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Lade Mail…</div>
        )}
        {!loadingDetail && !selected && (
          <div style={{ padding: '60px 30px', textAlign: 'center', color: 'var(--ink3)' }}>
            <Mail size={40} style={{ opacity: 0.3, marginBottom: 14 }} />
            <div className="bold sm" style={{ color: 'var(--ink2)', marginBottom: 6 }}>Wähle eine Nachricht</div>
            <div className="sm">Klicke links auf eine Mail, um sie zu öffnen.</div>
          </div>
        )}
        {!loadingDetail && selected && (
          <>
            <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="card-title" style={{ fontSize: 16 }}>{selected.subject}</span>
                <button className="btn btn-primary btn-sm" onClick={() => reply(selected)}>
                  <Reply size={12} />Antworten
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <span><strong>Von:</strong> {formatAddress(selected.from)}</span>
                <span><strong>An:</strong> {formatAddress(selected.to)}</span>
                {selected.cc?.length > 0 && <span><strong>CC:</strong> {formatAddress(selected.cc)}</span>}
                <span><strong>Datum:</strong> {fmtDate(selected.date)}</span>
              </div>
              {selected.attachments.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  <Paperclip size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                  {selected.attachments.length} Anhang/Anhänge:&nbsp;
                  {selected.attachments.map((a) => a.filename).join(', ')}
                </div>
              )}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {selected.html ? (
                <iframe
                  title={`mail-${selected.uid}`}
                  sandbox=""
                  srcDoc={sanitiseHtml(selected.html)}
                  style={{ width: '100%', minHeight: 480, border: 'none', background: '#fff' }}
                />
              ) : (
                <pre style={{ padding: 18, fontFamily: 'var(--font)', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {selected.text || '(Leerer Inhalt)'}
                </pre>
              )}
            </div>
          </>
        )}
      </div>

      {showCompose && (
        <Modal
          title="Neue Nachricht"
          onClose={() => setShowCompose(false)}
          large
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowCompose(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={send}>
                <Send size={13} />Senden
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">An *</label>
            <input className="form-input" type="email" value={composeForm.to} onChange={(e) => setComposeForm((f) => ({ ...f, to: e.target.value }))} placeholder="empfaenger@beispiel.de" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Betreff *</label>
            <input className="form-input" value={composeForm.subject} onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Nachricht</label>
            <textarea className="form-textarea" rows={10} value={composeForm.body} onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))} />
          </div>
          <p className="form-hint">Absender: {status.displayName ? `${status.displayName} <${status.address}>` : status.address}</p>
        </Modal>
      )}
    </div>
  );
}
