/**
 * routes/mail.js — Live IMAP/SMTP routes per Unternehmen.
 *
 * Design intent (per product decision):
 *   - NO local mail storage. Every list/read hits IMAP live. Trade-off:
 *     simpler, but a bit slower per request and no full-text history search.
 *   - SMTP via nodemailer for sending. Reuses the user's own account so the
 *     "From" address is consistent with the inbox they see.
 *
 * Per-tenant credentials live encrypted on the `unternehmen` row (see
 *   services/crypto.js).
 */

const express = require('express');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const { getDb } = require('../db/db');
const { auth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { encrypt, decrypt } = require('../services/crypto');

const router  = express.Router();
const smeAuth = auth(['unternehmen', 'steuerberater', 'superadmin']);

function getSme(userId) {
  return getDb().get('SELECT * FROM unternehmen WHERE user_id = ?', [userId]);
}

function imapConfigured(sme) {
  return !!(sme && sme.mail_imap_host && sme.mail_imap_user && sme.mail_imap_pass_enc);
}
function smtpConfigured(sme) {
  return !!(sme && sme.mail_smtp_host && sme.mail_smtp_user && sme.mail_smtp_pass_enc);
}

async function withImap(sme, fn) {
  const pass = decrypt(sme.mail_imap_pass_enc);
  if (!pass) throw httpError(400, 'IMAP-Passwort konnte nicht entschlüsselt werden — bitte erneut speichern');

  const client = new ImapFlow({
    host:   sme.mail_imap_host,
    port:   sme.mail_imap_port || 993,
    secure: !!(sme.mail_imap_tls ?? 1),
    auth:   { user: sme.mail_imap_user, pass },
    logger: false,
  });
  await client.connect();
  try { return await fn(client); }
  finally { await client.logout().catch(() => { /* ignore */ }); }
}

function makeSmtp(sme) {
  const pass = decrypt(sme.mail_smtp_pass_enc);
  if (!pass) throw httpError(400, 'SMTP-Passwort konnte nicht entschlüsselt werden — bitte erneut speichern');
  return nodemailer.createTransport({
    host:   sme.mail_smtp_host,
    port:   sme.mail_smtp_port || 587,
    secure: (sme.mail_smtp_port || 587) === 465,
    requireTLS: !!(sme.mail_smtp_tls ?? 1) && (sme.mail_smtp_port || 587) !== 465,
    auth:   { user: sme.mail_smtp_user, pass },
  });
}

// ── GET /api/sme/mail/status ────────────────────────────────────────────
router.get('/status', smeAuth, asyncHandler(async (req, res) => {
  const sme = getSme(req.user.id);
  res.json({
    imapConfigured: imapConfigured(sme),
    smtpConfigured: smtpConfigured(sme),
    demoMode: !imapConfigured(sme),  // Inbox falls back to demo data
    address: sme?.mail_address || null,
    displayName: sme?.mail_display_name || null,
  });
}));

// ── PUT /api/sme/mail/config — save IMAP+SMTP, encrypts passwords ──────
router.put('/config', smeAuth, asyncHandler(async (req, res) => {
  const db  = getDb();
  const sme = getSme(req.user.id);
  if (!sme) throw httpError(404, 'Unternehmen nicht gefunden');

  const b = req.body || {};
  // Only re-encrypt passwords if a non-empty value was sent — empty field
  // means "keep existing".
  const imapPassEnc = b.imap_pass ? encrypt(b.imap_pass) : sme.mail_imap_pass_enc;
  const smtpPassEnc = b.smtp_pass ? encrypt(b.smtp_pass) : sme.mail_smtp_pass_enc;

  db.run(`
    UPDATE unternehmen SET
      mail_imap_host=?, mail_imap_port=?, mail_imap_user=?, mail_imap_pass_enc=?, mail_imap_tls=?,
      mail_smtp_host=?, mail_smtp_port=?, mail_smtp_user=?, mail_smtp_pass_enc=?, mail_smtp_tls=?,
      mail_address=?, mail_display_name=?
    WHERE id=?`,
    [
      b.imap_host || null, parseInt(b.imap_port) || 993, b.imap_user || null, imapPassEnc, b.imap_tls === false ? 0 : 1,
      b.smtp_host || null, parseInt(b.smtp_port) || 587, b.smtp_user || null, smtpPassEnc, b.smtp_tls === false ? 0 : 1,
      b.mail_address || null, b.mail_display_name || null,
      sme.id,
    ]
  );
  res.json({ ok: true });
}));

// ── POST /api/sme/mail/test — open IMAP + SMTP, return diag ────────────
router.post('/test', smeAuth, asyncHandler(async (req, res) => {
  const sme = getSme(req.user.id);
  if (!imapConfigured(sme) || !smtpConfigured(sme)) {
    return res.status(400).json({ ok: false, error: 'Mail noch nicht konfiguriert' });
  }
  const result = { imap: { ok: false }, smtp: { ok: false } };
  try {
    await withImap(sme, async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try { result.imap = { ok: true, exists: client.mailbox.exists }; }
      finally { lock.release(); }
    });
  } catch (e) { result.imap = { ok: false, error: e.message }; }
  try {
    const transport = makeSmtp(sme);
    await transport.verify();
    result.smtp = { ok: true };
  } catch (e) { result.smtp = { ok: false, error: e.message }; }
  res.json(result);
}));

// Synthetic demo data — returned when no IMAP is configured so the inbox UI
// has something to render during evaluation / sales demos.
const DEMO_INBOX = [
  { uid: 1001, subject: 'Re: Rechnung RE-2025-002 — Frage zur USt', from: [{ name: 'Peter König', address: 'p.koenig@koenig-sanitaer.de' }], to: [{ address: 'demo@deich-dynamics.com' }], date: new Date(Date.now() - 1 * 3600e3).toISOString(), size: 4200, seen: false, flagged: false,
    body: 'Sehr geehrte Damen und Herren,\n\nvielen Dank für die Rechnung. Eine Frage: warum sind 19% USt auf den Wartungsvertrag — ich dachte das wäre nicht ausgewiesen? Bitte um kurze Klärung.\n\nBeste Grüße\nPeter König' },
  { uid: 1002, subject: 'Bestellbestätigung #4521 von Amazon Business', from: [{ name: 'Amazon Business', address: 'no-reply@amazon-business.de' }], to: [{ address: 'demo@deich-dynamics.com' }], date: new Date(Date.now() - 5 * 3600e3).toISOString(), size: 12400, seen: true, flagged: false,
    body: 'Vielen Dank für Ihre Bestellung bei Amazon Business.\n\nBestell-Nr.: 305-4521234-9876543\nGesamtbetrag: € 234,90\nVoraussichtliche Lieferung: morgen.\n\nIhr Amazon Business Team' },
  { uid: 1003, subject: 'Angebot Wartungsvertrag 2026 — bitte um Rückmeldung', from: [{ name: 'Anna Schmidt', address: 'a.schmidt@schmidt.de' }], to: [{ address: 'demo@deich-dynamics.com' }], date: new Date(Date.now() - 26 * 3600e3).toISOString(), size: 5600, seen: true, flagged: true,
    body: 'Hallo,\n\nwir haben Ihr Angebot vom 12.5. erhalten und finden es grundsätzlich gut. Können wir die Laufzeit auf 24 Monate verlängern? Dafür hätten wir gerne 5% Nachlass.\n\nGruß\nAnna Schmidt' },
  { uid: 1004, subject: 'Zahlungseingang RE-2025-001 — Hoffmann & Söhne', from: [{ name: 'Commerzbank', address: 'kontoauszug@commerzbank.de' }], to: [{ address: 'demo@deich-dynamics.com' }], date: new Date(Date.now() - 50 * 3600e3).toISOString(), size: 1200, seen: true, flagged: false,
    body: 'Zahlungseingang: € 2.856,00\nAbsender: Hoffmann & Söhne KG\nVerwendungszweck: RE-2025-001\nKonto: DE89 ... 0000\n\nIhr Banking-Team' },
  { uid: 1005, subject: 'Newsletter: Steuerrecht im Q2 2026', from: [{ name: 'Haufe Steuern', address: 'newsletter@haufe.de' }], to: [{ address: 'demo@deich-dynamics.com' }], date: new Date(Date.now() - 72 * 3600e3).toISOString(), size: 22000, seen: false, flagged: false,
    body: 'Neuigkeiten aus dem Steuerrecht...\n• E-Rechnungspflicht ab 2027 — was Unternehmen jetzt tun müssen\n• Investitionsabzugsbetrag: neue Höchstgrenzen\n• ELSTER-API: kommende Änderungen' },
  { uid: 1006, subject: 'Re: Termin nächste Woche', from: [{ name: 'Klaus Hoffmann', address: 'k.hoffmann@hoffmann-kg.de' }], to: [{ address: 'demo@deich-dynamics.com' }], date: new Date(Date.now() - 96 * 3600e3).toISOString(), size: 1800, seen: true, flagged: false,
    body: 'Hallo,\n\npasst Dienstag um 14:00 für Sie?\n\nGruß\nK. Hoffmann' },
];

// ── GET /api/sme/mail/inbox?limit=50&search= ─────────────────────────────
router.get('/inbox', smeAuth, asyncHandler(async (req, res) => {
  const sme = getSme(req.user.id);
  if (!imapConfigured(sme)) {
    // Demo mode — synthesised inbox so the UI is testable without real creds.
    const q = (req.query.search || '').toLowerCase();
    const messages = DEMO_INBOX
      .filter((m) => !q || m.subject.toLowerCase().includes(q) || (m.body || '').toLowerCase().includes(q))
      .map(({ body: _b, ...rest }) => rest);
    return res.json({ messages, demo: true });
  }

  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const search = (req.query.search || '').trim();

  const messages = await withImap(sme, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = client.mailbox.exists;
      if (!total) return [];

      // For a search, IMAP server-side search. Otherwise: newest `limit` UIDs.
      let uids;
      if (search) {
        uids = await client.search({ or: [{ from: search }, { subject: search }, { body: search }] }, { uid: true });
        uids = (uids || []).slice(-limit);
      } else {
        const from = Math.max(1, total - limit + 1);
        uids = [];
        for await (const msg of client.fetch(`${from}:*`, { uid: true })) uids.push(msg.uid);
      }

      const out = [];
      for await (const msg of client.fetch(uids, { envelope: true, flags: true, internalDate: true, size: true }, { uid: true })) {
        const env = msg.envelope || {};
        out.push({
          uid: msg.uid,
          subject: env.subject || '(kein Betreff)',
          from: (env.from || []).map((a) => ({ name: a.name, address: a.address })),
          to:   (env.to   || []).map((a) => ({ name: a.name, address: a.address })),
          date: msg.internalDate || env.date || null,
          size: msg.size || 0,
          seen: msg.flags?.has('\\Seen') || false,
          flagged: msg.flags?.has('\\Flagged') || false,
        });
      }
      out.sort((a, b) => new Date(b.date) - new Date(a.date));
      return out;
    } finally {
      lock.release();
    }
  });
  res.json({ messages });
}));

// ── GET /api/sme/mail/:uid — full message body ──────────────────────────
router.get('/:uid', smeAuth, asyncHandler(async (req, res) => {
  const sme = getSme(req.user.id);
  const uid = parseInt(req.params.uid);
  if (!uid) return res.status(400).json({ error: 'UID erforderlich' });
  if (!imapConfigured(sme)) {
    // Demo path
    const m = DEMO_INBOX.find((x) => x.uid === uid);
    if (!m) return res.status(404).json({ error: 'Mail nicht gefunden' });
    return res.json({ uid: m.uid, subject: m.subject, from: m.from, to: m.to, cc: [], date: m.date, text: m.body, html: null, attachments: [] });
  }

  const data = await withImap(sme, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const { content } = await client.download(uid, undefined, { uid: true });
      const parsed = await simpleParser(content);
      // Mark as read
      try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch { /* ignore */ }
      return {
        uid,
        subject: parsed.subject || '(kein Betreff)',
        from: parsed.from?.value || [],
        to: parsed.to?.value || [],
        cc: parsed.cc?.value || [],
        date: parsed.date,
        text: parsed.text || '',
        html: parsed.html || null,
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename,
          size: a.size,
          contentType: a.contentType,
        })),
      };
    } finally {
      lock.release();
    }
  });
  res.json(data);
}));

// ── POST /api/sme/mail/send ─────────────────────────────────────────────
router.post('/send', smeAuth, asyncHandler(async (req, res) => {
  const sme = getSme(req.user.id);
  if (!smtpConfigured(sme)) return res.status(400).json({ error: 'SMTP nicht konfiguriert' });

  const { to, subject, text, html, inReplyTo } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: 'Empfänger und Betreff erforderlich' });

  const fromAddr = sme.mail_address || sme.mail_smtp_user;
  const fromName = sme.mail_display_name || sme.firm_name || '';
  const transport = makeSmtp(sme);

  const headers = {};
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo;

  const info = await transport.sendMail({
    from: fromName ? `"${fromName}" <${fromAddr}>` : fromAddr,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
    headers,
  });
  res.json({ ok: true, messageId: info.messageId });
}));

module.exports = router;
