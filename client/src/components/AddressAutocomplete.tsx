import { useEffect, useState, useRef } from 'react';
import { MapPin, Loader } from 'lucide-react';

/**
 * AddressAutocomplete — type-as-you-go full-address completion using
 * Photon (https://photon.komoot.io/), OpenStreetMap-backed. No API key
 * needed, no DSGVO problem (servers in Germany).
 *
 * On pick, the parent gets back the parsed components (street, plz, city,
 * country, lat, lng) — caller decides which fields to populate.
 */

export interface ParsedAddress {
  street: string;       // "Hauptstraße 5"
  plz: string;
  city: string;
  country: string;
  lat?: number;
  lng?: number;
  display: string;
}

interface PhotonResult {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
    osm_type?: string;
    osm_value?: string;
  };
}

function parseResult(r: PhotonResult): ParsedAddress {
  const p = r.properties;
  const street = [p.street, p.housenumber].filter(Boolean).join(' ') || p.name || '';
  return {
    street,
    plz: p.postcode || '',
    city: p.city || p.state || '',
    country: p.country || 'Deutschland',
    lat: r.geometry.coordinates[1],
    lng: r.geometry.coordinates[0],
    display: [street, [p.postcode, p.city].filter(Boolean).join(' '), p.country].filter(Boolean).join(', '),
  };
}

export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  placeholder = 'Adresse eingeben…',
  className = 'form-input',
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (a: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
}) {
  const [hits, setHits] = useState<PhotonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || value.trim().length < 3) { setHits([]); return; }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=6&lang=de`;
        const r = await fetch(url);
        const d = await r.json();
        setHits(d.features || []);
      } catch { setHits([]); }
      finally { setLoading(false); }
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [value, open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className={className}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {loading && (
        <Loader size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', animation: 'spin 1s linear infinite' }} />
      )}
      {open && hits.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', boxShadow: 'var(--shadow-lg)',
          marginTop: 4, maxHeight: 280, overflowY: 'auto',
        }}>
          {hits.map((h, i) => {
            const parsed = parseResult(h);
            return (
              <button
                key={i}
                type="button"
                onClick={() => { onPick(parsed); onChange(parsed.street); setOpen(false); setHits([]); }}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  width: '100%', textAlign: 'left',
                  padding: '10px 12px', background: 'none', border: 'none',
                  borderBottom: '1px solid var(--border2)',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <MapPin size={13} color="var(--ink3)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div className="sm bold">{parsed.street || h.properties.name}</div>
                  <div className="muted sm">{[parsed.plz, parsed.city, parsed.country].filter(Boolean).join(', ')}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { from { transform: translateY(-50%) rotate(0deg); } to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  );
}
