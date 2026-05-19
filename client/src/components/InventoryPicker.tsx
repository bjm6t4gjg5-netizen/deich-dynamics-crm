import { useEffect, useState } from 'react';
import { Search, Package, X, Check } from 'lucide-react';
import { api, fmt } from '../api';
import { Modal } from './ui';

/**
 * Modal-based inventory picker — opens when adding a line item to an invoice
 * or quote. Grid layout with image, name, price, stock. Much more browseable
 * than the inline dropdown for catalogues > 5 items.
 */

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  unit: string;
  sell_price: number;
  stock: number;
  is_unlimited: 0 | 1;
  image_url?: string;
  default_vat_rate?: number;
  category?: string;
}

export function InventoryPickerModal({
  onPick,
  onClose,
}: {
  onPick: (item: InventoryItem) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.sme.inventory().then((r: any) => setItems(r.items || [])).catch(() => setItems([]));
  }, []);

  const filtered = items.filter((it) => {
    const s = q.toLowerCase();
    return !s || it.name.toLowerCase().includes(s) || it.sku?.toLowerCase().includes(s) || it.category?.toLowerCase().includes(s);
  });

  return (
    <Modal title="Artikel wählen" onClose={onClose} large
      footer={<button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>}>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }} />
        <input
          className="form-input"
          style={{ paddingLeft: 30 }}
          placeholder="Suche nach Name, SKU, Kategorie…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12,
        maxHeight: 480,
        overflowY: 'auto',
      }}>
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>
            <Package size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div className="sm">Keine Artikel gefunden.</div>
          </div>
        )}
        {filtered.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => { onPick(it); onClose(); }}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              padding: 10,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all .15s',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{
              aspectRatio: '4/3', borderRadius: 'var(--r)', background: 'var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {it.image_url ? (
                <img src={it.image_url} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Package size={28} color="var(--ink4)" />
              )}
            </div>
            <div className="bold sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
            <div className="muted" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
              <span>{it.sku || it.category || ''}</span>
              <span>{it.is_unlimited ? '♾️' : `${it.stock} ${it.unit}`}</span>
            </div>
            <div className="bold" style={{ color: 'var(--primary)' }}>{fmt(it.sell_price)}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/**
 * Image upload + crop/rotate/zoom — pure canvas-based, no external deps.
 * Output is a JPEG blob the caller can upload. Designed for inventory item
 * cover photos (4:3 aspect by default).
 */
export function ImageCropModal({
  onUpload,
  onClose,
  aspect = 4 / 3,
}: {
  onUpload: (blob: Blob) => Promise<void>;
  onClose: () => void;
  aspect?: number;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [zoom, setZoom]     = useState(1);
  const [rotate, setRotate] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy]     = useState(false);
  const [drag, setDrag]     = useState<{ x: number; y: number } | null>(null);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImgSrc(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const onMouseDown = (e: React.MouseEvent) => setDrag({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  const onMouseMove = (e: React.MouseEvent) => { if (drag) setOffset({ x: e.clientX - drag.x, y: e.clientY - drag.y }); };
  const onMouseUp   = () => setDrag(null);

  const save = async () => {
    if (!imgSrc) return;
    setBusy(true);
    try {
      // Composite the transformed image onto a fresh canvas at output size
      const canvas = document.createElement('canvas');
      const W = 600, H = Math.round(600 / aspect);
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgSrc;
      await new Promise((res) => { img.onload = res; });

      ctx.save();
      ctx.translate(W / 2 + offset.x, H / 2 + offset.y);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.scale(zoom, zoom);
      const drawW = img.width;
      const drawH = img.height;
      ctx.drawImage(img, -drawW / 2, -drawH / 2);
      ctx.restore();

      canvas.toBlob(async (blob) => {
        if (blob) {
          await onUpload(blob);
          onClose();
        }
        setBusy(false);
      }, 'image/jpeg', 0.9);
    } catch (e: any) {
      alert(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Produktbild" onClose={onClose} large
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn btn-primary" onClick={save} disabled={!imgSrc || busy}>
          <Check size={13} />{busy ? 'Speichert…' : 'Übernehmen'}
        </button>
      </>}>
      {!imgSrc ? (
        <div style={{ padding: 30, textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--r)' }}>
          <input type="file" accept="image/*" onChange={pickFile} />
          <div className="muted sm" style={{ marginTop: 8 }}>JPG, PNG, WebP · max. 4 MB</div>
        </div>
      ) : (
        <>
          <div
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{
              width: '100%',
              aspectRatio: `${aspect}`,
              background: '#0f1117',
              borderRadius: 'var(--r)',
              overflow: 'hidden',
              position: 'relative',
              cursor: drag ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          >
            <img
              src={imgSrc}
              alt="Vorschau"
              draggable={false}
              style={{
                position: 'absolute',
                left: '50%', top: '50%',
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotate}deg) scale(${zoom})`,
                pointerEvents: 'none',
                maxWidth: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'center' }}>
            <label className="sm muted" style={{ width: 60 }}>Zoom</label>
            <input type="range" min={0.5} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ flex: 1 }} />
            <span className="sm" style={{ width: 40 }}>{zoom.toFixed(2)}×</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
            <label className="sm muted" style={{ width: 60 }}>Drehen</label>
            <input type="range" min={-180} max={180} step={1} value={rotate} onChange={(e) => setRotate(+e.target.value)} style={{ flex: 1 }} />
            <span className="sm" style={{ width: 40 }}>{rotate}°</span>
          </div>

          <p className="muted sm" style={{ marginTop: 10 }}>Bild verschieben mit Drag, Zoom + Drehen mit den Slidern. Beim Übernehmen wird auf 600×{Math.round(600/aspect)} px JPEG zugeschnitten.</p>
        </>
      )}
    </Modal>
  );
}
