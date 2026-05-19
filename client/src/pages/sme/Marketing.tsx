import { useEffect, useState } from 'react';
import { Plus, Megaphone, TrendingUp, Trash2 } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api';
import { Modal, Empty } from '../../components/ui';

/**
 * Marketing & Kampagnen — track which campaign brought in which lead and
 * what the resulting revenue is. Lets the user attribute deals to campaigns
 * for very basic ROI analysis.
 *
 * Backend: /api/sme/campaigns CRUD. The `acquired_via` field on customers
 * and the `campaign_id` field on deals get reported back in /campaigns/:id
 * for the per-campaign view.
 */

interface Campaign {
  id: string;
  name: string;
  description?: string;
  channel?: string;
  spend: number;
  start_date?: string;
  end_date?: string;
  status: 'Geplant' | 'Aktiv' | 'Beendet';
  created_at: string;
  // Aggregates (joined server-side)
  customer_count?: number;
  deal_count?: number;
  deal_value?: number;
  won_value?: number;
}

const STATUS_OPTIONS: Campaign['status'][] = ['Geplant', 'Aktiv', 'Beendet'];
const CHANNELS = ['Email', 'Social Media', 'Google Ads', 'Print', 'Empfehlung', 'Messe', 'Sonstiges'];

export default function Marketing() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showNew, setShowNew]     = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', channel: 'Email', spend: '',
    start_date: '', end_date: '', status: 'Aktiv' as Campaign['status'],
  });
  const [err, setErr] = useState('');

  const load = () => api.get<Campaign[]>('/sme/campaigns').then(setCampaigns).catch(() => setCampaigns([]));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr('');
    if (!form.name.trim()) { setErr('Name erforderlich'); return; }
    try {
      await api.post('/sme/campaigns', {
        ...form,
        spend: parseFloat(form.spend) || 0,
      });
      setShowNew(false);
      setForm({ name: '', description: '', channel: 'Email', spend: '', start_date: '', end_date: '', status: 'Aktiv' });
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm('Kampagne löschen? Zuordnungen bei Kunden/Deals bleiben erhalten.')) return;
    try { await api.delete(`/sme/campaigns/${id}`); load(); } catch (e: any) { alert(e.message); }
  };

  const totals = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + (c.spend || 0),
      won:   acc.won   + (c.won_value || 0),
      deals: acc.deals + (c.deal_count || 0),
    }),
    { spend: 0, won: 0, deals: 0 }
  );
  const totalRoi = totals.spend > 0 ? ((totals.won - totals.spend) / totals.spend) * 100 : null;

  return (
    <div>
      {/* KPIs */}
      <div className="stats-grid">
        <div className="stat">
          <div className="stat-label">Aktive Kampagnen</div>
          <div className="stat-value">{campaigns.filter((c) => c.status === 'Aktiv').length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Marketing-Spend</div>
          <div className="stat-value">{fmt(totals.spend)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gewonnenes Volumen</div>
          <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(totals.won)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ROI gesamt</div>
          <div className="stat-value" style={{ color: totalRoi !== null && totalRoi >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
            {totalRoi === null ? '–' : `${totalRoi.toFixed(0)} %`}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Kampagnen ({campaigns.length})</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            <Plus size={13} />Neue Kampagne
          </button>
        </div>

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kanal</th>
                <th>Status</th>
                <th>Zeitraum</th>
                <th>Spend</th>
                <th>Deals</th>
                <th>Umsatz (gewonnen)</th>
                <th>ROI</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const roi = (c.spend || 0) > 0 ? (((c.won_value || 0) - (c.spend || 0)) / (c.spend || 0)) * 100 : null;
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="bold sm">{c.name}</div>
                      {c.description && <div className="muted sm">{c.description}</div>}
                    </td>
                    <td className="sm">{c.channel || '–'}</td>
                    <td><span className={`badge ${c.status === 'Aktiv' ? 'badge-ok' : c.status === 'Geplant' ? 'badge-info' : 'badge-neu'}`}>{c.status}</span></td>
                    <td className="muted sm">
                      {c.start_date ? fmtDate(c.start_date) : '–'}
                      {c.end_date ? ` – ${fmtDate(c.end_date)}` : ''}
                    </td>
                    <td>{fmt(c.spend)}</td>
                    <td>{c.deal_count || 0}</td>
                    <td className="bold">{fmt(c.won_value || 0)}</td>
                    <td className={roi !== null && roi >= 0 ? 'ok-c bold' : 'err-c bold'}>
                      {roi === null ? '–' : `${roi.toFixed(0)} %`}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(c.id)} style={{ color: 'var(--danger)' }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <Empty
                      icon={<Megaphone size={32} />}
                      text="Noch keine Kampagnen angelegt. Mit Kampagnen kannst du nachvollziehen, welche Marketing-Aktion welchen Umsatz gebracht hat."
                      action={
                        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
                          <Plus size={13} />Erste Kampagne anlegen
                        </button>
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <Modal
          title="Neue Marketing-Kampagne"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={create}><Plus size={13} />Anlegen</button>
            </>
          }
        >
          {err && <div className="notice err">{err}</div>}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus placeholder="z.B. Ostern 2026" />
            </div>
            <div className="form-group">
              <label className="form-label">Kanal</label>
              <select className="form-select" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
                {CHANNELS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Beschreibung</label>
            <textarea className="form-textarea" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Budget (€)</label>
              <input className="form-input" type="number" step="0.01" value={form.spend} onChange={(e) => setForm((f) => ({ ...f, spend: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Campaign['status'] }))}>
                {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start</label>
              <input className="form-input" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Ende</label>
              <input className="form-input" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      <div style={{ marginTop: 18, fontSize: 12, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingUp size={12} />
        Tipp: Bei einem Deal oder neuen Kunden kannst du die Kampagne als Quelle hinterlegen — die ROI-Berechnung läuft dann automatisch.
      </div>
    </div>
  );
}
