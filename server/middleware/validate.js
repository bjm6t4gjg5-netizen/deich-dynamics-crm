/**
 * validate.js — Tiny dependency-free body validator.
 *
 * Why not zod? We already have zero validation; pulling in a 50KB dep for a
 * handful of fields is overkill. This is a 30-line schema runner that handles
 * the cases this app actually has (string/number/bool, required, min length,
 * email format, enum). If we ever need real type-system rigour we can swap to
 * zod without touching call sites — just keep the same `{ field: rules }` shape.
 *
 * Usage:
 *
 *   router.post('/foo', validate({
 *     email:    { type: 'email', required: true },
 *     password: { type: 'string', required: true, min: 8 },
 *     role:     { type: 'enum', values: ['admin','user'] },
 *   }), handler)
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function check(value, rule, field) {
  if (value === undefined || value === null || value === '') {
    if (rule.required) return `${field} ist erforderlich`;
    return null;
  }
  switch (rule.type) {
    case 'email':
      if (typeof value !== 'string' || !EMAIL_RE.test(value)) return `${field}: ungültige E-Mail`;
      break;
    case 'string':
      if (typeof value !== 'string') return `${field}: muss Text sein`;
      if (rule.min && value.length < rule.min) return `${field}: mindestens ${rule.min} Zeichen`;
      if (rule.max && value.length > rule.max) return `${field}: maximal ${rule.max} Zeichen`;
      break;
    case 'number':
      if (typeof value !== 'number' && Number.isNaN(parseFloat(value))) return `${field}: muss eine Zahl sein`;
      break;
    case 'bool':
      if (typeof value !== 'boolean') return `${field}: muss true/false sein`;
      break;
    case 'enum':
      if (!rule.values.includes(value)) return `${field}: muss einer von ${rule.values.join(', ')} sein`;
      break;
    default:
      // Unknown type — accept silently
      break;
  }
  return null;
}

function validate(schema) {
  return (req, res, next) => {
    const body = req.body || {};
    const errors = [];
    for (const [field, rule] of Object.entries(schema)) {
      const err = check(body[field], rule, field);
      if (err) errors.push(err);
    }
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    next();
  };
}

module.exports = { validate };
