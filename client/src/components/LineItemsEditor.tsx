import { useEffect, useState } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { api, fmt } from '../api';
import { InventoryPickerModal } from './InventoryPicker';

/**
 * Tabular editor for invoice / quote / recurring line items.
 *
 * Product rules:
 *   - Each row MUST reference an inventory item OR be a free-form
 *     "Sonderposten" (toggle via the dropdown's first option).
 *   - Unlimited inventory items (e.g. software licences) don't count down on
 *     stock — the server skips the deduction.
 *
 * Emits the canonical line_items shape used by the API:
 *   { description, qty, unit_price, inventory_id?, free_form? }
 */

interface LineItem {
  description: string;
  qty: number;
  unit_price: number;
  vat_rate?: number;
  inventory_id?: string | null;
  free_form?: boolean;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  sell_price: number;
  stock: number;
  is_unlimited: 0 | 1;
  default_vat_rate?: number;
  image_url?: string;
}

export function LineItemsEditor({
  value,
  onChange,
  vatRate = 19,
}: {
  value: LineItem[];
  onChange: (items: LineItem[]) => void;
  vatRate?: number;
}) {
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [pickerFor, setPickerFor] = useState<number | 'new' | null>(null);

  useEffect(() => {
    api.sme.inventory()
      .then((r: any) => setInv(r.items || []))
      .catch(() => setInv([]));
  }, []);

  const update = (idx: number, patch: Partial<LineItem>) => {
    onChange(value.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  const addInventory = () => {
    if (!inv.length) {
      alert('Noch keine Inventar-Artikel angelegt. Erstelle erst Artikel im Inventar oder nutze „Sonderposten".');
      return;
    }
    // Open the modal picker instead of auto-picking the first item.
    setPickerFor('new');
  };

  const onPickFromModal = (item: any) => {
    const newLine = {
      inventory_id: item.id,
      description: item.name,
      qty: 1,
      unit_price: item.sell_price || 0,
      vat_rate: item.default_vat_rate ?? vatRate,
    };
    if (pickerFor === 'new') {
      onChange([...value, newLine]);
    } else if (typeof pickerFor === 'number') {
      update(pickerFor, newLine);
    }
    setPickerFor(null);
  };

  const addFree = () => onChange([...value, {
    free_form: true,
    description: '',
    qty: 1,
    unit_price: 0,
    vat_rate: vatRate,
  }]);

  // (legacy onPickInventory removed — modal picker replaces inline dropdown)

  const totalNet = value.reduce((s, it) => s + (it.qty || 0) * (it.unit_price || 0), 0);
  // Per-line VAT: sum each line's net × its own rate
  const totalVat = value.reduce((s, it) => {
    const lineNet = (it.qty || 0) * (it.unit_price || 0);
    const rate = it.vat_rate ?? vatRate;
    return s + lineNet * (rate / 100);
  }, 0);

  return (
    <div>
      <div className="tbl-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Artikel / Position</th>
              <th>Beschreibung</th>
              <th style={{ width: 70 }}>Menge</th>
              <th style={{ width: 90 }}>Einzelpreis</th>
              <th style={{ width: 70 }}>MwSt.</th>
              <th style={{ width: 90 }}>Gesamt</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {value.length === 0 && (
              <tr>
                <td colSpan={7} className="muted sm" style={{ textAlign: 'center', padding: 20 }}>
                  Noch keine Positionen. „+ Inventar-Artikel" oder „+ Sonderposten" hinzufügen.
                </td>
              </tr>
            )}
            {value.map((it, idx) => {
              const item = it.inventory_id ? inv.find((x) => x.id === it.inventory_id) : null;
              const stockWarn = item && !item.is_unlimited && it.qty > item.stock;
              return (
                <tr key={idx}>
                  <td>
                    {it.free_form ? (
                      <span className="badge badge-warn" style={{ fontSize: 10 }}>Sonderposten</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12 }}
                        onClick={() => setPickerFor(idx)}
                      >
                        {item?.image_url ? (
                          <img src={item.image_url} style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover' }} alt="" />
                        ) : (
                          <Package size={14} color="var(--ink3)" />
                        )}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item?.name || it.description || 'Artikel wählen'}
                        </span>
                      </button>
                    )}
                  </td>
                  <td>
                    <input
                      className="form-input"
                      style={{ fontSize: 12 }}
                      value={it.description}
                      onChange={(e) => update(idx, { description: e.target.value })}
                      placeholder={it.free_form ? 'Freie Beschreibung' : '—'}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      style={{ fontSize: 12 }}
                      type="number"
                      step="0.01"
                      value={it.qty}
                      onChange={(e) => update(idx, { qty: parseFloat(e.target.value) || 0 })}
                    />
                    {stockWarn && (
                      <div className="err-c" style={{ fontSize: 10, marginTop: 2 }}>nur {item?.stock} verfügbar</div>
                    )}
                  </td>
                  <td>
                    <input
                      className="form-input"
                      style={{ fontSize: 12 }}
                      type="number"
                      step="0.01"
                      value={it.unit_price}
                      onChange={(e) => update(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <select
                      className="form-select"
                      style={{ fontSize: 12 }}
                      value={it.vat_rate ?? vatRate}
                      onChange={(e) => update(idx, { vat_rate: +e.target.value })}
                    >
                      {[0, 7, 19].map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="bold sm">
                    {fmt((it.qty || 0) * (it.unit_price || 0))}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(idx)} style={{ color: 'var(--danger)' }}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addInventory}>
            <Plus size={12} />Inventar-Artikel
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addFree}>
            <Plus size={12} />Sonderposten
          </button>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8, textAlign: 'right' }}>
          <div>Netto: <strong>{fmt(totalNet)}</strong></div>
          <div>MwSt. (gemischte Sätze): <strong>{fmt(totalVat)}</strong></div>
          <div style={{ fontSize: 15, color: 'var(--primary)' }}>Brutto: <strong>{fmt(totalNet + totalVat)}</strong></div>
        </div>
      </div>

      {pickerFor !== null && (
        <InventoryPickerModal
          onPick={onPickFromModal}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
