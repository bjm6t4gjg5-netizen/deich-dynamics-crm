/**
 * services/crypto.js — AES-256-GCM for at-rest secrets (mail passwords).
 *
 * Format of an encrypted value (base64 single string):
 *   IV (12 bytes) | AUTH_TAG (16 bytes) | CIPHERTEXT
 *
 * The encryption key is derived from `MAIL_ENC_KEY` env var via scrypt so any
 * passphrase length works. In production set MAIL_ENC_KEY to a long random
 * string and back it up — losing it means stored mail passwords are
 * unrecoverable (which is the point).
 */

const crypto = require('crypto');
const config = require('../config');

let _key = null;

function getKey() {
  if (_key) return _key;
  const raw = config.mail.encKey || 'deich-dynamics-dev-passphrase-rotate-in-prod';
  // Deterministic derivation so the same passphrase always produces the same key.
  _key = crypto.scryptSync(raw, 'mein-dynamics-salt-v1', 32);
  return _key;
}

function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(blob) {
  if (!blob) return null;
  try {
    const buf = Buffer.from(blob, 'base64');
    if (buf.length < 28) return null;
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (err) {
    // Wrong key or tampered ciphertext — surface as a clear error rather than
    // returning garbage.
    // eslint-disable-next-line no-console
    console.error('[crypto] decrypt failed:', err.message);
    return null;
  }
}

module.exports = { encrypt, decrypt };
