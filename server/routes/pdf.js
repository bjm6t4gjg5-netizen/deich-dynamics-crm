/**
 * routes/pdf.js — Real PDF generation that mirrors the HTML preview.
 *
 * pdfkit is used because it is light + deterministic. Both the invoice and
 * the quote render use the same header / line-item / totals helpers so they
 * stay visually consistent. Header includes the firm's phone + email so
 * customers can answer back. Cancelled invoices get a large red diagonal
 * watermark.
 */

const express = require('express');
const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');
const { getDb } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

// Tausenderpunkte + Komma-Dezimal nach deutscher Schreibweise.
const _eurFmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtEUR(n) {
  return `€ ${_eurFmt.format(Number(n || 0))}`;
}
function fmtDate(s) {
  if (!s) return '–';
  try { return new Date(s).toLocaleDateString('de-DE'); } catch { return s; }
}

function getInvoiceContext(userId, invoiceId) {
  const db = getDb();
  const sme = db.get('SELECT * FROM unternehmen WHERE user_id = ?', [userId]);
  if (!sme) return null;
  const inv = db.get('SELECT * FROM invoices WHERE id = ? AND unternehmen_id = ?', [invoiceId, sme.id]);
  if (!inv) return null;
  const customer = inv.customer_id
    ? db.get('SELECT * FROM customers WHERE id = ?', [inv.customer_id])
    : null;
  return { sme, inv, customer };
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#1d3f36');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [29, 63, 54];
}

/** Shared brand header (logo + firm + contact + title block). Returns the y
 *  cursor after the separator line. */
function drawHeader(doc, sme, { title, number }) {
  const brandHex = sme.theme_color || '#1d3f36';
  let cursorY = 50;

  if (sme.logo_url) {
    try {
      const filePath = path.join(__dirname, '..', sme.logo_url.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        doc.image(filePath, 50, cursorY, { height: 36 });
        cursorY += 42;
      }
    } catch { /* ignore */ }
  }
  doc.fontSize(16).fillColor(brandHex).font('Helvetica-Bold').text(sme.firm_name || '', 50, cursorY);
  doc.fontSize(9).fillColor('#666').font('Helvetica').text(
    [sme.address, [sme.plz, sme.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    50, cursorY + 22
  );

  // Contact line: phone + email so customers can answer back about this doc.
  const contactParts = [];
  if (sme.phone) contactParts.push(`Tel.: ${sme.phone}`);
  if (sme.email) contactParts.push(sme.email);
  if (sme.website) contactParts.push(sme.website);
  if (contactParts.length > 0) {
    doc.fontSize(8).fillColor('#888').text(contactParts.join(' · '), 50, cursorY + 34);
  }
  if (sme.ust_id) {
    const ustY = contactParts.length > 0 ? cursorY + 45 : cursorY + 34;
    doc.fontSize(8).fillColor('#aaa').text(`USt-IdNr.: ${sme.ust_id}`, 50, ustY);
  }

  doc.fontSize(24).fillColor(brandHex).font('Helvetica-Bold')
     .text(title, 350, cursorY, { width: 200, align: 'right' });
  doc.fontSize(10).fillColor('#666').font('Helvetica')
     .text(number, 350, cursorY + 30, { width: 200, align: 'right' });

  const sepY = cursorY + 75;
  doc.moveTo(50, sepY).lineTo(545, sepY).lineWidth(2).strokeColor(brandHex).stroke();
  return sepY + 20;
}

/** Diagonal red "STORNIERT" watermark across the current page. */
function drawCancelWatermark(doc) {
  doc.save();
  doc.fillColor('#dc2626').opacity(0.18);
  doc.font('Helvetica-Bold').fontSize(90);
  doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.text('STORNIERT', 0, doc.page.height / 2 - 50, {
    width: doc.page.width, align: 'center',
  });
  doc.rotate(30, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.opacity(1);
  doc.restore();
}

// ── Invoice ──────────────────────────────────────────────────────────────────
router.get('/invoice/:id', smeAuth, asyncHandler(async (req, res) => {
  const ctx = getInvoiceContext(req.user.id, req.params.id);
  if (!ctx) throw httpError(404, 'Rechnung nicht gefunden');
  const { sme, inv, customer } = ctx;

  let items = [];
  try { items = JSON.parse(inv.line_items || '[]'); } catch { items = []; }
  const useItems = items.length > 0;
  const itemsByRate = {};
  let totalNet = 0;
  if (useItems) {
    for (const it of items) {
      const qty = parseFloat(it.qty) || 0;
      const up  = parseFloat(it.unit_price) || 0;
      const r   = parseFloat(it.vat_rate ?? inv.vat_rate ?? 19);
      const lineNet = qty * up;
      totalNet += lineNet;
      itemsByRate[r] = (itemsByRate[r] || 0) + lineNet;
    }
  } else {
    totalNet = parseFloat(inv.net) || 0;
    itemsByRate[parseFloat(inv.vat_rate) || 19] = totalNet;
  }
  const totalVat = Object.entries(itemsByRate).reduce((s, [r, n]) => s + n * (+r) / 100, 0);
  const totalGross = totalNet + totalVat;

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${inv.invoice_number}.pdf"`);
  doc.pipe(res);
  doc.page.margins.bottom = 80;

  const brandHex = sme.theme_color || '#1d3f36';
  const titleSuffix = inv.status === 'Storniert' ? 'Storno-Rechnung' : 'Rechnung';
  let cursorY = drawHeader(doc, sme, { title: titleSuffix, number: inv.invoice_number });

  // Recipient + Meta
  const boxH = 100;
  doc.roundedRect(50, cursorY, 240, boxH, 6).fillColor('#f8f9fa').fill();
  doc.fillColor('#999').fontSize(8).text('RECHNUNGSEMPFÄNGER', 60, cursorY + 10);
  doc.fillColor('#000').fontSize(11).font('Helvetica-Bold')
     .text((customer?.company || inv.client_name || ''), 60, cursorY + 24, { width: 220 });
  doc.font('Helvetica').fontSize(9).fillColor('#333');
  let recY = cursorY + 40;
  if (customer?.name && customer.name !== inv.client_name) {
    doc.text(customer.name, 60, recY, { width: 220 }); recY += 12;
  }
  if (customer?.address) { doc.text(customer.address, 60, recY, { width: 220 }); recY += 12; }
  if (customer?.plz || customer?.city) {
    doc.text([customer.plz, customer.city].filter(Boolean).join(' '), 60, recY, { width: 220 }); recY += 12;
  }
  if (customer?.email) doc.fontSize(8).fillColor('#888').text(customer.email, 60, recY, { width: 220 });

  doc.roundedRect(305, cursorY, 240, boxH, 6).fillColor('#f8f9fa').fill();
  doc.fillColor('#999').fontSize(8).text('DETAILS', 315, cursorY + 10);
  doc.fillColor('#333').fontSize(10).font('Helvetica');
  doc.text(`Nummer:  ${inv.invoice_number}`, 315, cursorY + 26);
  doc.text(`Datum:   ${fmtDate(inv.date)}`,   315, cursorY + 42);
  doc.text(`Fällig:  ${fmtDate(inv.due_date)}`, 315, cursorY + 58);
  doc.text(`Status:  ${inv.status}`,          315, cursorY + 74);
  cursorY += boxH + 24;

  // Cancellation banner
  if (inv.status === 'Storniert') {
    doc.roundedRect(50, cursorY, 495, 36, 6).fillColor('#fef2f2').fill().strokeColor('#dc2626').lineWidth(1).stroke();
    doc.fillColor('#dc2626').fontSize(11).font('Helvetica-Bold').text('Diese Rechnung wurde storniert.', 60, cursorY + 8);
    if (inv.cancellation_reason) {
      doc.fontSize(9).font('Helvetica').fillColor('#7f1d1d').text(`Grund: ${inv.cancellation_reason}`, 60, cursorY + 22);
    }
    cursorY += 48;
  }

  // Line items
  const tableX = 50, tableW = 495;
  const cols = {
    desc: { x: 60,  w: 240 }, qty: { x: 305, w: 50  },
    unit: { x: 360, w: 70  }, vat: { x: 435, w: 40  }, total: { x: 480, w: 65 },
  };
  doc.rect(tableX, cursorY, tableW, 24).fillColor(brandHex).fill();
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
  doc.text('Position',  cols.desc.x,  cursorY + 8, { width: cols.desc.w });
  doc.text('Menge',     cols.qty.x,   cursorY + 8, { width: cols.qty.w,   align: 'right' });
  doc.text('Einzel',    cols.unit.x,  cursorY + 8, { width: cols.unit.w,  align: 'right' });
  doc.text('MwSt.',     cols.vat.x,   cursorY + 8, { width: cols.vat.w,   align: 'right' });
  doc.text('Gesamt',    cols.total.x, cursorY + 8, { width: cols.total.w, align: 'right' });
  cursorY += 24;

  doc.font('Helvetica').fontSize(9).fillColor('#000');
  let zebra = false;
  const renderRow = (desc, qty, unitPrice, rate, lineNet) => {
    if (zebra) doc.rect(tableX, cursorY, tableW, 22).fillColor('#fafbfc').fill();
    doc.fillColor('#222').text(desc || '', cols.desc.x, cursorY + 6, { width: cols.desc.w });
    doc.text(String(qty),         cols.qty.x,   cursorY + 6, { width: cols.qty.w,   align: 'right' });
    doc.text(fmtEUR(unitPrice),   cols.unit.x,  cursorY + 6, { width: cols.unit.w,  align: 'right' });
    doc.text(`${rate}%`,          cols.vat.x,   cursorY + 6, { width: cols.vat.w,   align: 'right' });
    doc.font('Helvetica-Bold').text(fmtEUR(lineNet), cols.total.x, cursorY + 6, { width: cols.total.w, align: 'right' });
    doc.font('Helvetica');
    cursorY += 22;
    zebra = !zebra;
  };

  if (useItems) {
    for (const it of items) {
      const qty = parseFloat(it.qty) || 0;
      const up  = parseFloat(it.unit_price) || 0;
      const r   = parseFloat(it.vat_rate ?? inv.vat_rate ?? 19);
      renderRow(it.description || '', qty, up, r, qty * up);
    }
  } else {
    renderRow(inv.description || 'Leistung', 1, inv.net, inv.vat_rate || 19, inv.net);
  }
  cursorY += 14;

  // Totals
  const totalsX = 340, totalsW = 205;
  doc.roundedRect(totalsX, cursorY, totalsW, 24 + Object.keys(itemsByRate).length * 16 + 26, 6)
     .lineWidth(1.5).strokeColor(brandHex).stroke();
  doc.fontSize(10).fillColor('#444').font('Helvetica');
  doc.text('Nettobetrag', totalsX + 12, cursorY + 10);
  doc.font('Helvetica-Bold').text(fmtEUR(totalNet), totalsX + 12, cursorY + 10, { width: totalsW - 24, align: 'right' });
  cursorY += 26;
  doc.font('Helvetica');
  for (const [rate, net] of Object.entries(itemsByRate)) {
    const vat = net * (+rate) / 100;
    doc.text(`MwSt. ${rate}% auf ${fmtEUR(net)}`, totalsX + 12, cursorY + 4, { width: totalsW - 12 });
    doc.text(fmtEUR(vat), totalsX + 12, cursorY + 4, { width: totalsW - 24, align: 'right' });
    cursorY += 16;
  }
  doc.rect(totalsX, cursorY, totalsW, 26).fillColor(brandHex).fill();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(12);
  doc.text('Gesamtbetrag', totalsX + 12, cursorY + 8);
  doc.text(fmtEUR(totalGross), totalsX + 12, cursorY + 8, { width: totalsW - 24, align: 'right' });
  cursorY += 40;

  // Payment
  if (inv.status !== 'Storniert') {
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text('Zahlungshinweis', 50, cursorY);
    cursorY += 18;
    doc.font('Helvetica').fontSize(10).fillColor('#444')
       .text(`Bitte überweisen Sie den Betrag bis zum ${fmtDate(inv.due_date)}.`, 50, cursorY);
    cursorY += 14;
    if (sme.iban) {
      doc.text(`IBAN: ${sme.iban}${sme.bic ? ` · BIC: ${sme.bic}` : ''}`, 50, cursorY);
      cursorY += 14;
    }
    doc.fontSize(9).fillColor('#888').text(`Verwendungszweck: ${inv.invoice_number}`, 50, cursorY);
  } else {
    doc.fillColor('#7f1d1d').font('Helvetica').fontSize(10).text(
      'Diese Rechnung ist storniert. Bitte nicht überweisen. Falls bereits gezahlt: Rückerstattung folgt separat.',
      50, cursorY, { width: 495 }
    );
  }

  // Footer
  const footerLine = [
    sme.firm_name || '',
    sme.legal_form,
    sme.phone ? `Tel. ${sme.phone}` : null,
    sme.email,
    sme.ust_id ? `USt-IdNr.: ${sme.ust_id}` : null,
  ].filter(Boolean).join(' · ');

  doc.flushPages();
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    if (inv.status === 'Storniert') drawCancelWatermark(doc);
    doc.fontSize(8).fillColor('#aaa').text(
      footerLine, 50, doc.page.height - 40, { width: doc.page.width - 100, align: 'center' }
    );
  }
  doc.end();
}));

// ── Quote (from pipeline deal) ───────────────────────────────────────────────
router.get('/quote/:id', smeAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const sme = db.get('SELECT * FROM unternehmen WHERE user_id = ?', [req.user.id]);
  if (!sme) throw httpError(404, 'Unternehmen nicht gefunden');
  const d = db.get(`
    SELECT d.*, s.name AS stage_name
    FROM deals d
    LEFT JOIN pipeline_stages s ON s.unternehmen_id = d.unternehmen_id AND s.name = d.stage
    WHERE d.id = ? AND d.unternehmen_id = ?
  `, [req.params.id, sme.id]);
  if (!d) throw httpError(404, 'Angebot nicht gefunden');
  const customer = d.customer_id ? db.get('SELECT * FROM customers WHERE id = ?', [d.customer_id]) : null;
  const campaign = d.campaign_id ? db.get('SELECT * FROM campaigns WHERE id = ?', [d.campaign_id]) : null;

  let items = [];
  try { items = JSON.parse(d.line_items || '[]'); } catch { items = []; }
  const vatRate = 19;
  let totalNet = items.length > 0
    ? items.reduce((s, it) => s + ((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)), 0)
    : (d.value || 0);
  if (totalNet === 0 && items.length === 0) totalNet = d.value || 0;
  const totalVat = totalNet * vatRate / 100;
  const totalGross = totalNet + totalVat;
  const quoteNumber = `AN-${(d.created_at || '').slice(0, 4) || new Date().getFullYear()}-${(d.id || '').slice(-4).toUpperCase()}`;

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${quoteNumber}.pdf"`);
  doc.pipe(res);
  doc.page.margins.bottom = 80;

  const brandHex = sme.theme_color || '#1d3f36';
  let cursorY = drawHeader(doc, sme, { title: 'Angebot', number: quoteNumber });

  // Recipient
  const boxH = 100;
  doc.roundedRect(50, cursorY, 240, boxH, 6).fillColor('#f8f9fa').fill();
  doc.fillColor('#999').fontSize(8).text('ANGEBOTSEMPFÄNGER', 60, cursorY + 10);
  doc.fillColor('#000').fontSize(11).font('Helvetica-Bold')
     .text((customer?.company || d.company || d.name || ''), 60, cursorY + 24, { width: 220 });
  doc.font('Helvetica').fontSize(9).fillColor('#333');
  let recY = cursorY + 40;
  if (customer?.name && customer.name !== (customer.company || d.name)) {
    doc.text(customer.name, 60, recY, { width: 220 }); recY += 12;
  }
  if (d.contact_person) { doc.text(`Ansprechpartner: ${d.contact_person}`, 60, recY, { width: 220 }); recY += 12; }
  if (customer?.address) { doc.text(customer.address, 60, recY, { width: 220 }); recY += 12; }
  if (customer?.plz || customer?.city) {
    doc.text([customer?.plz, customer?.city].filter(Boolean).join(' '), 60, recY, { width: 220 }); recY += 12;
  }

  // Details
  doc.roundedRect(305, cursorY, 240, boxH, 6).fillColor('#f8f9fa').fill();
  doc.fillColor('#999').fontSize(8).text('DETAILS', 315, cursorY + 10);
  doc.fillColor('#333').fontSize(10).font('Helvetica');
  doc.text(`Nummer:    ${quoteNumber}`,                     315, cursorY + 26);
  doc.text(`Datum:     ${fmtDate(d.created_at)}`,           315, cursorY + 42);
  doc.text(`Gültig:    ${fmtDate(d.expected_close)}`,        315, cursorY + 58);
  doc.text(`Status:    ${d.stage_name || d.stage || '–'}`,  315, cursorY + 74);
  cursorY += boxH + 24;

  if (campaign) {
    doc.fontSize(8).fillColor('#999').text(`Im Rahmen von: ${campaign.name}`, 50, cursorY);
    cursorY += 16;
  }

  // Description
  if (d.name) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(d.name, 50, cursorY, { width: 495 });
    cursorY += 22;
  }

  // Line items
  const tableX = 50, tableW = 495;
  const cols = {
    desc: { x: 60,  w: 240 }, qty: { x: 305, w: 50  },
    unit: { x: 360, w: 70  }, vat: { x: 435, w: 40  }, total: { x: 480, w: 65 },
  };
  doc.rect(tableX, cursorY, tableW, 24).fillColor(brandHex).fill();
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
  doc.text('Position',  cols.desc.x,  cursorY + 8, { width: cols.desc.w });
  doc.text('Menge',     cols.qty.x,   cursorY + 8, { width: cols.qty.w,   align: 'right' });
  doc.text('Einzel',    cols.unit.x,  cursorY + 8, { width: cols.unit.w,  align: 'right' });
  doc.text('MwSt.',     cols.vat.x,   cursorY + 8, { width: cols.vat.w,   align: 'right' });
  doc.text('Gesamt',    cols.total.x, cursorY + 8, { width: cols.total.w, align: 'right' });
  cursorY += 24;

  doc.font('Helvetica').fontSize(9).fillColor('#000');
  let zebra = false;
  const renderRow = (desc, qty, unitPrice, rate, lineNet) => {
    if (zebra) doc.rect(tableX, cursorY, tableW, 22).fillColor('#fafbfc').fill();
    doc.fillColor('#222').text(desc || '', cols.desc.x, cursorY + 6, { width: cols.desc.w });
    doc.text(String(qty),         cols.qty.x,   cursorY + 6, { width: cols.qty.w,   align: 'right' });
    doc.text(fmtEUR(unitPrice),   cols.unit.x,  cursorY + 6, { width: cols.unit.w,  align: 'right' });
    doc.text(`${rate}%`,          cols.vat.x,   cursorY + 6, { width: cols.vat.w,   align: 'right' });
    doc.font('Helvetica-Bold').text(fmtEUR(lineNet), cols.total.x, cursorY + 6, { width: cols.total.w, align: 'right' });
    doc.font('Helvetica');
    cursorY += 22;
    zebra = !zebra;
  };
  if (items.length > 0) {
    for (const it of items) {
      const qty = parseFloat(it.qty) || 0;
      const up  = parseFloat(it.unit_price) || 0;
      const r   = parseFloat(it.vat_rate ?? vatRate);
      renderRow(it.description || '', qty, up, r, qty * up);
    }
  } else {
    renderRow(d.name || 'Leistung', 1, totalNet, vatRate, totalNet);
  }
  cursorY += 14;

  // Totals
  const totalsX = 340, totalsW = 205;
  doc.roundedRect(totalsX, cursorY, totalsW, 24 + 16 + 26, 6).lineWidth(1.5).strokeColor(brandHex).stroke();
  doc.fontSize(10).fillColor('#444').font('Helvetica');
  doc.text('Nettobetrag', totalsX + 12, cursorY + 10);
  doc.font('Helvetica-Bold').text(fmtEUR(totalNet), totalsX + 12, cursorY + 10, { width: totalsW - 24, align: 'right' });
  cursorY += 26;
  doc.font('Helvetica');
  doc.text(`MwSt. ${vatRate}% auf ${fmtEUR(totalNet)}`, totalsX + 12, cursorY + 4, { width: totalsW - 12 });
  doc.text(fmtEUR(totalVat), totalsX + 12, cursorY + 4, { width: totalsW - 24, align: 'right' });
  cursorY += 16;
  doc.rect(totalsX, cursorY, totalsW, 26).fillColor(brandHex).fill();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(12);
  doc.text('Gesamtbetrag', totalsX + 12, cursorY + 8);
  doc.text(fmtEUR(totalGross), totalsX + 12, cursorY + 8, { width: totalsW - 24, align: 'right' });
  cursorY += 40;

  // Terms
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text('Bedingungen', 50, cursorY);
  cursorY += 18;
  doc.font('Helvetica').fontSize(10).fillColor('#444');
  doc.text('Dieses Angebot ist freibleibend und unverbindlich.', 50, cursorY); cursorY += 14;
  if (d.expected_close) {
    doc.text(`Gültig bis ${fmtDate(d.expected_close)}.`, 50, cursorY); cursorY += 14;
  }
  doc.text('Annahme erfolgt formlos schriftlich (E-Mail oder Unterschrift auf einer Kopie dieses Angebots).', 50, cursorY, { width: 495 });
  cursorY += 28;
  if (d.notes) {
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(10).text('Anmerkungen', 50, cursorY);
    cursorY += 14;
    doc.font('Helvetica').fillColor('#555').text(d.notes, 50, cursorY, { width: 495 });
  }

  // Footer
  const footerLine = [
    sme.firm_name || '',
    sme.legal_form,
    sme.phone ? `Tel. ${sme.phone}` : null,
    sme.email,
    sme.ust_id ? `USt-IdNr.: ${sme.ust_id}` : null,
  ].filter(Boolean).join(' · ');

  doc.flushPages();
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fontSize(8).fillColor('#aaa').text(
      footerLine, 50, doc.page.height - 40, { width: doc.page.width - 100, align: 'center' }
    );
  }
  doc.end();
}));

module.exports = router;
