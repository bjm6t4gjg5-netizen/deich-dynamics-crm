import { useEffect, useState } from 'react';
import { Download, X, AlertCircle } from 'lucide-react';
import { STORAGE } from '../api';

/**
 * PdfPreviewModal — fetches a PDF endpoint with the auth token, builds a
 * blob: URL and shows it inside an iframe so the user can see the PDF before
 * deciding to download or send. Used by Invoices, Quotes, Reminders.
 */
export function PdfPreviewModal({
  url,
  filename,
  title,
  onClose,
  extraActions,
}: {
  url: string;
  filename: string;
  title: string;
  onClose: () => void;
  extraActions?: React.ReactNode;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let revokeUrl: string | null = null;
    let aborted = false;
    (async () => {
      try {
        const token = localStorage.getItem(STORAGE.TOKEN_KEY);
        const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const u = URL.createObjectURL(blob);
        revokeUrl = u;
        if (!aborted) { setBlobUrl(u); setLoading(false); }
      } catch (e: any) {
        if (!aborted) { setErr(e.message || 'PDF-Generierung fehlgeschlagen'); setLoading(false); }
      }
    })();
    return () => {
      aborted = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [url]);

  const download = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl; a.download = filename; a.click();
  };

  return (
    <div
      className="overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      // Höherer z-index als der normale .overlay (200), damit die Vorschau
      // immer über bereits offenen Modals (z.B. Deal-Modal) erscheint.
      style={{ zIndex: 400 }}
    >
      <div className="modal modal-xl" style={{ display: 'flex', flexDirection: 'column', height: '92vh' }}>
        <div className="modal-hd" style={{ flexShrink: 0 }}>
          <span className="modal-title">{title}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {extraActions}
            <button className="btn btn-primary btn-sm" onClick={download} disabled={!blobUrl}>
              <Download size={13} />PDF herunterladen
            </button>
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div style={{ flex: 1, background: '#525659', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {loading && <div style={{ color: '#fff', fontSize: 13 }}>Lade Vorschau…</div>}
          {err && (
            <div style={{ color: '#fff', textAlign: 'center', padding: 20 }}>
              <AlertCircle size={32} style={{ marginBottom: 10 }} />
              <div>{err}</div>
            </div>
          )}
          {blobUrl && !err && (
            <iframe
              src={blobUrl}
              title={title}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
