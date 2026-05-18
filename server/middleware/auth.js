/**
 * auth.js — JWT authentication middleware.
 *
 * Reads `config.jwt.secret` (validated at startup) and refuses unsigned or
 * tampered tokens. Role checks are advisory — supply an array of allowed
 * roles to gate an endpoint:
 *
 *   router.get('/foo', auth(['superadmin']), handler)
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

function auth(roles = []) {
  return (req, res, next) => {
    const hdr = req.headers.authorization;
    if (!hdr || !hdr.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    try {
      const payload = jwt.verify(hdr.slice(7), config.jwt.secret);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Keine Berechtigung' });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
    }
  };
}

function sign(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

module.exports = { auth, sign };
