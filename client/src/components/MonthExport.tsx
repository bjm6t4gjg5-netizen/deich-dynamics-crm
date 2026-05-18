import { useState } from 'react';
import { Download } from 'lucide-react';
import { STORAGE } from '../api';

export function MonthExportButton() {
  const [month, setMonth]   = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  });
  const [loading, setLoading] = useState(false);

  const doExport = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem(STORAGE.TOKEN_KEY);
      const r = await fetch(`/api/sme/export/month?month=${month}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Export fehlgeschlagen');
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = r.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] || 'export.zip';
      a.click(); URL.revokeObjectURL(url);
    } catch(e) { alert(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
        className="form-input" style={{width:150,fontSize:13}}/>
      <button className="btn btn-secondary" onClick={doExport} disabled={loading}>
        <Download size={14}/>{loading?'Erstelle ZIP…':'Export für Steuerberater'}
      </button>
    </div>
  );
}
