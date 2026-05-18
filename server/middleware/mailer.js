/**
 * mailer.js — Email sender + branded templates.
 *
 * Provider selection per Steuerberater (SMTP / SendGrid / Resend). Falls back
 * to platform defaults (config.mail) when no Steuerberater config is present.
 */

const nodemailer = require('nodemailer');
const config = require('../config');

async function sendEmail({ stb, firm, to, subject, html }) {
  const provider = stb?.mail_provider || 'smtp';
  const fromName = stb?.firm_name || firm?.firm_name || config.mail.fromNameDefault;
  const fromAddr = stb?.mail_from || config.mail.fromDefault;

  if (provider === 'sendgrid' && stb?.sendgrid_key) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stb.sendgrid_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromAddr, name: fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    if (!r.ok) throw new Error(`SendGrid: ${r.status}`);
    return;
  }

  if (provider === 'resend' && stb?.resend_key) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stb.resend_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: `${fromName} <${fromAddr}>`, to, subject, html }),
    });
    if (!r.ok) throw new Error(`Resend: ${r.status}`);
    return;
  }

  // SMTP
  if (!stb?.mail_host) {
    throw new Error('Kein Mailserver konfiguriert. Bitte in Einstellungen hinterlegen.');
  }
  const t = nodemailer.createTransport({
    host: stb.mail_host,
    port: stb.mail_port || 587,
    secure: (stb.mail_port || 587) === 465,
    auth: stb.mail_user ? { user: stb.mail_user, pass: stb.mail_pass } : undefined,
  });
  await t.sendMail({ from: `"${fromName}" <${fromAddr}>`, to, subject, html });
}

function invoiceEmail({ invoice, firm, stb }) {
  const color = stb?.theme_color || firm?.theme_color || config.brand.primary;
  const name  = stb?.firm_name || firm?.firm_name || config.brand.name;
  return `<!DOCTYPE html><html lang="de"><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
<div style="background:${color};color:#fff;padding:24px;border-radius:8px 8px 0 0">
  <h1 style="margin:0;font-size:22px">${name}</h1>
  <p style="margin:4px 0 0;opacity:.8">Rechnung ${invoice.invoice_number}</p>
</div>
<div style="background:#f9f9f9;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  <p>Sehr geehrte Damen und Herren,</p>
  <p>anbei Ihre Rechnung <strong>${invoice.invoice_number}</strong> vom ${invoice.date} über <strong>€ ${Number(invoice.gross).toFixed(2).replace('.', ',')}</strong>.</p>
  <p style="background:#fff;border-left:4px solid ${color};padding:12px 16px;border-radius:0 8px 8px 0">
    Bitte überweisen Sie den Betrag bis zum <strong>${invoice.due_date}</strong>.${firm?.iban ? '<br>IBAN: ' + firm.iban : ''}
  </p>
  <p>Mit freundlichen Grüßen,<br><strong>${name}</strong></p>
</div>
<p style="text-align:center;color:#999;font-size:11px;margin-top:14px">Versendet via ${config.brand.name}</p>
</body></html>`;
}

function reminderEmail({ invoice, firm, stb, level }) {
  const labels = ['', 'Erste Zahlungserinnerung', 'Zweite Mahnung', 'Letzte Mahnung vor Inkasso'];
  const label = labels[level] || 'Zahlungserinnerung';
  const color = level > 1 ? '#8b1a1a' : '#7d4e00';
  const name  = stb?.firm_name || firm?.firm_name || config.brand.name;
  return `<!DOCTYPE html><html lang="de"><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
<div style="background:${color};color:#fff;padding:24px;border-radius:8px 8px 0 0">
  <h1 style="margin:0;font-size:20px">${label}</h1>
  <p style="margin:4px 0 0;opacity:.8">${name}</p>
</div>
<div style="background:#fdf2f2;border:1px solid #f0c0c0;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  <p>Sehr geehrte Damen und Herren,</p>
  <p>folgende Rechnung ist noch offen:</p>
  <div style="background:#fff;padding:14px;border-radius:8px;margin:16px 0">
    <div><b>Nummer:</b> ${invoice.invoice_number}</div>
    <div><b>Betrag:</b> € ${Number(invoice.gross).toFixed(2).replace('.', ',')}</div>
    <div><b>Fällig seit:</b> ${invoice.due_date}</div>
  </div>
  <p>${level > 1 ? '<strong>Bitte überweisen Sie den Betrag umgehend.</strong>' : 'Bitte begleichen Sie den offenen Betrag zeitnah.'}</p>
  <p>Mit freundlichen Grüßen,<br><strong>${name}</strong></p>
</div>
<p style="text-align:center;color:#999;font-size:11px;margin-top:14px">Versendet via ${config.brand.name}</p>
</body></html>`;
}

module.exports = { sendEmail, invoiceEmail, reminderEmail };
