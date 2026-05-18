import { useState, useEffect, useRef } from 'react';
import { Plus, X, CheckCircle, FileText } from 'lucide-react';
import { api, fmt, fmtDate } from '../../api.js';
import { Badge, Modal, Empty } from '../../components/ui.jsx';
import { useLang } from '../../context/LangContext.jsx';
import { useApp } from '../../context/AppContext.jsx';

const CATS_DE = ['Büromaterial','Fahrtkosten','Telekommunikation','Marketing','Miete','Versicherung','Software','Personal','Sonstiges'];
const CATS_EN = ['Office supplies','Travel','Telecommunications','Marketing','Rent','Insurance','Software','Personnel','Other'];

// ── Pipeline ──────────────────────────────────────────────────────────────────
const STAGES = ['Erstgespräch','Bedarfsanalyse','Angebot gesendet','Verhandlung','Abschluss nah','Gewonnen','Verloren'];
const STAGE_COLOR = { Gewonnen:'var(--ok)', Verloren:'var(--danger)' };

function DealModal({ deal, customers, onClose, onDone, onCreateInvoice }) {
  const [form, setForm] = useState({ ...deal });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await api.sme.updateDeal(deal.id, form); onDone(); }
    catch(e) { alert(e.message); setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <div><div className="modal-title">{deal.name}</div><div className="muted sm">{deal.company}</div></div>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group"><label className="form-label">Bezeichnung</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Phase</label>
              <select className="form-select" value={form.stage} onChange={e=>setForm(f=>({...f,stage:e.target.value}))}>
                {STAGES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Wert (€)</label><input className="form-input" type="number" value={form.value} onChange={e=>setForm(f=>({...f,value:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Wahrscheinlichkeit %</label><input className="form-input" type="number" min="0" max="100" value={form.probability} onChange={e=>setForm(f=>({...f,probability:e.target.value}))}/></div>
          </div>
          <div className="form-group"><label className="form-label">Notizen</label><textarea className="form-textarea" value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}/></div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Schließen</button>
          <button className="btn btn-ghost" onClick={()=>onCreateInvoice(deal)}><FileText size={13}/>Rechnung erstellen</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}><CheckCircle size={13}/>{saving?'Speichert…':'Speichern'}</button>
        </div>
      </div>
    </div>
  );
}

export function Pipeline({ onNavigate }) {
  const [deals,setDeals]         = useState([]);
  const [customers,setCustomers] = useState([]);
  const [showNew,setShowNew]     = useState(false);
  const [editDeal,setEditDeal]   = useState(null);
  const [dragging,setDragging]   = useState(null);
  const [dragOver,setDragOver]   = useState(null);
  const [form,setForm]           = useState({name:'',customer_id:'',company:'',value:'',probability:'20',stage:'Erstgespräch',contact_person:'',notes:''});

  const load = () => Promise.all([api.sme.deals(),api.sme.customers()]).then(([d,c])=>{setDeals(d);setCustomers(c);});
  useEffect(()=>{load();},[]);

  const create = async () => {
    try { await api.sme.createDeal(form); setShowNew(false); load(); } catch(e) { alert(e.message); }
  };

  const moveDeal = async (dealId, stage) => {
    const deal = deals.find(d=>d.id===dealId);
    if (!deal || deal.stage === stage) return;
    await api.sme.updateDeal(dealId, { ...deal, stage });
    if (stage === 'Gewonnen' && confirm(`„${deal.name}" gewonnen! 🎉\n\nMöchten Sie direkt eine Rechnung erstellen?`)) {
      // Navigate to invoices with pre-fill
      onNavigate && onNavigate('invoices');
    }
    load();
  };

  const onDragStart = (e, deal) => { setDragging(deal.id); e.dataTransfer.effectAllowed='move'; };
  const onDragOver  = (e, stage) => { e.preventDefault(); setDragOver(stage); e.dataTransfer.dropEffect='move'; };
  const onDrop      = (e, stage) => { e.preventDefault(); if(dragging) moveDeal(dragging, stage); setDragging(null); setDragOver(null); };
  const onDragEnd   = ()          => { setDragging(null); setDragOver(null); };

  const colDeals = (stage) => deals.filter(d=>d.stage===stage);
  const colVal   = (stage) => colDeals(stage).reduce((s,d)=>s+(d.value*(d.probability/100)),0);
  const totalPipeline = deals.filter(d=>d.stage!=='Gewonnen'&&d.stage!=='Verloren').reduce((s,d)=>s+(d.value*(d.probability/100)),0);

  const createInvoiceFromDeal = (deal) => {
    onNavigate && onNavigate('invoices');
  };

  return (
    <div>
      <div className="fb mb-3" style={{flexWrap:'wrap',gap:8}}>
        <div>
          <span className="bold sm">Pipeline gesamt: </span>
          <span className="bold" style={{color:'var(--primary)'}}>{fmt(totalPipeline)}</span>
          <span className="muted sm"> (gewichtet)</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)}><Plus size={13}/>Neues Angebot</button>
      </div>

      <div className="board" style={{paddingBottom:16}}>
        {STAGES.map(stage=>{
          const sdeals = colDeals(stage);
          const isWon  = stage==='Gewonnen';
          const isLost = stage==='Verloren';
          const accent = STAGE_COLOR[stage] || 'var(--primary)';
          const isDragTarget = dragOver === stage;
          return (
            <div key={stage} className="board-col" style={{minWidth:190}}
              onDragOver={e=>onDragOver(e,stage)} onDrop={e=>onDrop(e,stage)} onDragLeave={()=>setDragOver(null)}>
              <div className="col-hd" style={{borderTop:`3px solid ${accent}`}}>
                <span className="col-hd-title" style={{color:isWon?'var(--ok)':isLost?'var(--danger)':''}}>{isWon?'✓ ':isLost?'✗ ':''}{stage}</span>
                <span className="col-count">{sdeals.length}</span>
              </div>
              <div style={{fontSize:10,color:'var(--ink3)',padding:'3px 10px 3px',background:'var(--bg)',border:'1px solid var(--border)',borderTop:'none',borderBottom:'none'}}>
                {fmt(colVal(stage))} gew.
              </div>
              <div className="col-body" style={{
                background:isWon?'rgba(5,150,105,.06)':isLost?'rgba(220,38,38,.04)':isDragTarget?'var(--primary-lt)':'var(--bg)',
                border:`1px solid ${isDragTarget?'var(--primary)':'var(--border)'}`,
                minHeight:160,
              }}>
                {sdeals.map(deal=>(
                  <div key={deal.id} className="deal-card"
                    draggable onDragStart={e=>onDragStart(e,deal)} onDragEnd={onDragEnd}
                    style={{opacity:dragging===deal.id?.5:1,cursor:'grab',borderLeft:`3px solid ${accent}`}}
                    onClick={()=>setEditDeal(deal)}>
                    <div className="deal-name">{deal.name}</div>
                    <div className="deal-co">{deal.company||customers.find(c=>c.id===deal.customer_id)?.name||'–'}</div>
                    <div className="deal-val" style={{color:accent}}>{fmt(deal.value)}</div>
                    <div className="deal-foot">
                      <span className="muted sm" style={{fontSize:10}}>{deal.probability}%</span>
                      <span className="muted sm" style={{fontSize:10}}>{fmt(deal.value*deal.probability/100)}</span>
                    </div>
                  </div>
                ))}
                {isDragTarget && sdeals.length===0 && (
                  <div style={{textAlign:'center',padding:'20px 8px',color:'var(--primary)',fontSize:12,border:'2px dashed var(--primary)',borderRadius:'var(--r)',opacity:.6}}>
                    Hierher ziehen
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editDeal && <DealModal deal={editDeal} customers={customers} onClose={()=>setEditDeal(null)} onDone={()=>{setEditDeal(null);load();}} onCreateInvoice={(d)=>{setEditDeal(null);createInvoiceFromDeal(d);}}/>}

      {showNew&&<Modal title="Neues Angebot" onClose={()=>setShowNew(false)} footer={<><button className="btn btn-secondary" onClick={()=>setShowNew(false)}>Abbrechen</button><button className="btn btn-primary" onClick={create}><Plus size={13}/>Anlegen</button></>}>
        <div className="form-group"><label className="form-label">Bezeichnung *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus/></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Wert (€)</label><input className="form-input" type="number" value={form.value} onChange={e=>setForm(f=>({...f,value:e.target.value}))}/></div>
          <div className="form-group"><label className="form-label">Wahrscheinlichkeit %</label><input className="form-input" type="number" min="0" max="100" value={form.probability} onChange={e=>setForm(f=>({...f,probability:e.target.value}))}/></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Kunde</label><select className="form-select" value={form.customer_id} onChange={e=>setForm(f=>({...f,customer_id:e.target.value}))}><option value="">–</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Phase</label><select className="form-select" value={form.stage} onChange={e=>setForm(f=>({...f,stage:e.target.value}))}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="form-group"><label className="form-label">Ansprechpartner</label><input className="form-input" value={form.contact_person} onChange={e=>setForm(f=>({...f,contact_person:e.target.value}))}/></div>
      </Modal>}
    </div>
  );
}


// ── Tax FAQ data ──────────────────────────────────────────────────────────────
const TAX_FAQ = {
  de: [
    { q: 'Welche Belege muss ich aufbewahren?', a: 'Alle Eingangs- und Ausgangsrechnungen, Kontoauszüge, Quittungen und Verträge müssen für 10 Jahre aufbewahrt werden (§ 147 AO). Digital oder in Papierform – beides ist zulässig, solange die Lesbarkeit gewährleistet ist.' },
    { q: 'Was muss auf eine korrekte Rechnung?', a: 'Pflichtangaben laut § 14 UStG: vollständiger Name und Anschrift beider Parteien, Steuernummer oder USt-IdNr., Rechnungsdatum, fortlaufende Rechnungsnummer, Leistungsbeschreibung, Menge/Umfang, Nettobetrag, Steuersatz und Steuerbetrag, Bruttobetrag.' },
    { q: 'Wann muss ich Umsatzsteuer ausweisen?', a: 'Als umsatzsteuerpflichtiger Unternehmer immer. Ausnahme: Kleinunternehmer (§ 19 UStG) mit Jahresumsatz unter 22.000 € dürfen keine USt ausweisen. Standard-Steuersatz 19 %, ermäßigt 7 % für Lebensmittel, Bücher etc.' },
    { q: 'Was ist der Unterschied zwischen Netto und Brutto?', a: 'Netto = Rechnungsbetrag ohne Mehrwertsteuer. Brutto = Netto + Mehrwertsteuer. Beispiel: 1.000 € netto + 19 % MwSt. = 1.190 € brutto. Unternehmen können Vorsteuer (gezahlte MwSt.) vom Finanzamt zurückfordern.' },
    { q: 'Was ist Vorsteuer?', a: 'Vorsteuer ist die Mehrwertsteuer, die Sie beim Einkauf gezahlt haben. Diese kann vom Finanzamt zurückgefordert werden (Vorsteuerabzug), sofern Sie Unternehmer sind und die Ausgabe betrieblich veranlasst ist.' },
    { q: 'Wann muss die Umsatzsteuer-Voranmeldung abgegeben werden?', a: 'Monatlich oder quartalsweise (je nach Vorjahresumsatz) bis zum 10. des Folgemonats beim Finanzamt. Bei Dauerfristverlängerung (+1 Monat). Abgabe über ELSTER.' },
    { q: 'Was sind steuerlich absetzbare Betriebsausgaben?', a: 'Alle Ausgaben, die betrieblich veranlasst sind: Miete, Büromaterial, Fahrtkosten, Personalkosten, Werbung, Telefon, Fachliteratur, Versicherungen, Softwarelizenzen. Privat veranlasste Kosten sind nicht absetzbar.' },
    { q: 'Was ist der Unterschied zwischen Einnahmen-Überschuss-Rechnung (EÜR) und Bilanz?', a: 'EÜR: Einfache Gegenüberstellung von Einnahmen und Ausgaben. Für Selbstständige und kleine Unternehmen bis 600.000 € Umsatz. Bilanz: Doppelte Buchführung mit Aktiva/Passiva. Pflicht für Kapitalgesellschaften (GmbH, AG) und größere Unternehmen.' },
    { q: 'Was bedeutet GoBD?', a: 'Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern, Aufzeichnungen und Unterlagen in elektronischer Form (GoBD). Vorschriften des Finanzamts für digitale Buchhaltung: Unveränderbarkeit, Vollständigkeit, Richtigkeit der Buchungen.' },
    { q: 'Was ist DATEV?', a: 'DATEV ist ein Software- und IT-Dienstleistungsanbieter für Steuerberater. Das DATEV-Format ist der Standard für den Datenaustausch zwischen Unternehmen und Steuerberater in Deutschland.' },
    { q: 'Wie funktioniert die Kleinunternehmerregelung?', a: 'Bei Jahresumsatz bis 22.000 € im Vorjahr und voraussichtlich max. 50.000 € im laufenden Jahr: keine Umsatzsteuerpflicht, kein Vorsteuerabzug. Auf Rechnungen: "Kein Steuerausweis gemäß § 19 UStG".' },
    { q: 'Was ist eine Mahnung und welche Stufen gibt es?', a: '1. Zahlungserinnerung (freundlich, keine Gebühr), 2. Erste Mahnung (7-14 Tage nach Fälligkeit), 3. Zweite Mahnung (mit Mahngebühr ggf. 5-10 €), 4. Letzte Mahnung vor gerichtlichem Mahnverfahren / Inkasso.' },
  ],
  en: [
    { q: 'What receipts do I need to keep?', a: 'All invoices (incoming and outgoing), bank statements, receipts and contracts must be retained for 10 years (§ 147 AO). Digital or paper format — both are acceptable as long as legibility is ensured.' },
    { q: 'What must appear on a correct invoice?', a: 'Mandatory information per § 14 UStG: full name and address of both parties, tax number or VAT ID, invoice date, consecutive invoice number, service description, quantity/scope, net amount, tax rate and tax amount, gross amount.' },
    { q: 'When do I need to show VAT?', a: 'As a VAT-liable entrepreneur, always. Exception: small businesses (§ 19 UStG) with annual turnover under €22,000 may not charge VAT. Standard rate 19%, reduced rate 7% for food, books etc.' },
    { q: 'What is the difference between net and gross?', a: 'Net = invoice amount without VAT. Gross = net + VAT. Example: €1,000 net + 19% VAT = €1,190 gross. Businesses can reclaim input VAT (Vorsteuer) paid on purchases from the tax office.' },
    { q: 'What is input tax (Vorsteuer)?', a: 'Input tax is the VAT you paid when making purchases. This can be reclaimed from the tax office (input tax deduction), provided you are an entrepreneur and the expense is business-related.' },
    { q: 'When is the VAT advance return due?', a: 'Monthly or quarterly (depending on previous year\'s turnover) by the 10th of the following month. With permanent extension of deadline (+1 month). Submission via ELSTER.' },
    { q: 'What business expenses are tax-deductible?', a: 'All expenses incurred for business purposes: rent, office supplies, travel costs, personnel costs, advertising, telephone, specialist literature, insurance, software licences. Privately motivated costs are not deductible.' },
    { q: 'What is a Einnahmen-Überschuss-Rechnung (EÜR)?', a: 'EÜR (income-surplus statement): Simple comparison of income and expenses. For self-employed and small businesses up to €600,000 turnover. Balance sheet: double-entry bookkeeping. Mandatory for limited companies (GmbH, AG) and larger businesses.' },
    { q: 'What does GoBD mean?', a: 'GoBD: Principles for the proper keeping and storage of books, records and documents in electronic form. Tax authority regulations for digital accounting: immutability, completeness, accuracy of entries.' },
    { q: 'How does the small business rule work?', a: 'With annual turnover up to €22,000 in the previous year and max. €50,000 in the current year: no VAT obligation, no input tax deduction. On invoices: "No tax pursuant to § 19 UStG".' },
  ],
};

// ── AI Chat ───────────────────────────────────────────────────────────────────
export function AIChat({ apiKey, onGoSettings }) {
  const { t, lang } = useLang();
  const [tab,setTab]       = useState(apiKey ? 'chat' : 'faq');
  const [msgs,setMsgs]     = useState([{role:'bot',text: lang==='en' ? 'Hello! I\'m your AI assistant for accounting, CRM and business strategy. How can I help you?' : 'Hallo! Ich bin Ihr KI-Assistent für Buchhaltung, CRM und Strategie. Wie kann ich Ihnen heute helfen?'}]);
  const [input,setInput]   = useState('');
  const [loading,setLoading] = useState(false);
  const [faqOpen,setFaqOpen] = useState(null);
  const bottomRef = useRef(null);
  const faqs = TAX_FAQ[lang] || TAX_FAQ.de;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput('');
    setMsgs(m => [...m, {role:'user', text:msg}]);
    setLoading(true);
    const reply = await api.claude(msg, apiKey);
    setMsgs(m => [...m, {role:'bot', text:reply}]);
    setLoading(false);
  };

  const chips = lang === 'en'
    ? ['How do I create an invoice?','What goes on a German invoice?','LIFO vs FIFO explained','Debt collection tips','What is a Jahresabschluss?']
    : ['Wie erstelle ich eine Rechnung?','Was muss auf eine Rechnung?','LIFO vs FIFO – Erklärung','Tipps für Mahnwesen','Was ist ein Jahresabschluss?'];

  return (
    <div>
      <div className="tabs" style={{marginBottom:0}}>
        <button className={`tab${tab==='faq'?' active':''}`} onClick={()=>setTab('faq')}>
          📚 {t('qa_title')}
        </button>
        {apiKey
          ? <button className={`tab${tab==='chat'?' active':''}`} onClick={()=>setTab('chat')}>🤖 {t('ai_title')}</button>
          : <button className="tab" style={{color:'var(--ink4)',cursor:'not-allowed'}} title={t('ai_locked_msg')}>🔒 KI-Chat (inaktiv)</button>
        }
      </div>

      {/* FAQ tab */}
      {tab==='faq' && (
        <div>
          <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14,fontSize:13,color:'var(--ink2)'}}>
            📚 {t('qa_subtitle')}
            {!apiKey && <span style={{marginLeft:8,color:'var(--warn)',fontWeight:600}}>· {t('ai_disabled_label')}</span>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {faqs.map((item, i) => (
              <div key={i} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
                <button
                  onClick={() => setFaqOpen(faqOpen===i ? null : i)}
                  style={{width:'100%',textAlign:'left',padding:'13px 16px',background:'none',border:'none',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'var(--font)',fontSize:13,fontWeight:600,color:'var(--ink)'}}>
                  <span>{item.q}</span>
                  <span style={{fontSize:16,color:'var(--primary)',flexShrink:0,marginLeft:8,transition:'transform .2s',transform:faqOpen===i?'rotate(180deg)':'rotate(0deg)'}}>▾</span>
                </button>
                {faqOpen===i && (
                  <div style={{padding:'0 16px 14px',fontSize:13,lineHeight:1.75,color:'var(--ink2)',borderTop:'1px solid var(--border2)',paddingTop:12}}>
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!apiKey && (
            <div style={{background:'var(--info-bg)',border:'1px solid var(--info)',borderRadius:'var(--r)',padding:'14px 16px',marginTop:16,fontSize:13,color:'var(--info)',lineHeight:1.7}}>
              <div className="bold" style={{marginBottom:6}}>🤖 {t('ai_title')} — {lang==='en'?'not active':'nicht aktiv'}</div>
              {t('ai_locked_msg')}
              <button className="btn btn-secondary btn-sm" style={{marginTop:10}} onClick={onGoSettings}>
                {t('ai_contact_admin')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Chat tab */}
      {tab==='chat' && apiKey && (
        <div className="chat-wrap" style={{marginTop:0,borderTop:'none',borderRadius:'0 0 var(--r-xl) var(--r-xl)'}}>
          <div className="chat-msgs">
            {msgs.map((m,i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
            {loading && <div className="msg bot" style={{color:'var(--ink3)'}}>⏳ {lang==='en'?'Claude is thinking…':'Claude denkt nach…'}</div>}
            <div ref={bottomRef}/>
          </div>
          {msgs.length===1 && (
            <div style={{padding:'0 18px 8px',display:'flex',gap:6,flexWrap:'wrap'}}>
              {chips.map(c=><button key={c} className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>setInput(c)}>{c}</button>)}
            </div>
          )}
          <div className="chat-foot">
            <input className="form-input" style={{flex:1}} value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()} placeholder={t('ask_placeholder')} disabled={loading}/>
            <button className="btn btn-primary" onClick={send} disabled={!input.trim()||loading}>{t('send')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

