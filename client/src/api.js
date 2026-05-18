/**
 * api.js — Thin fetch wrapper for the Deich Dynamics CRM REST API.
 *
 * Storage keys are prefixed with `dd_` ("deich dynamics") so we avoid colliding
 * with anything else on the same host in dev. A legacy fallback reads old
 * `k_*` keys once, so users mid-session don't get logged out by the rebrand.
 */

const BASE = '/api';

// Storage keys
const TOKEN_KEY  = 'dd_token';
const CLAUDE_KEY = 'dd_claude';

// Legacy fallback — read once, then migrate
function migrateLegacy(newKey, oldKey) {
  try {
    if (!localStorage.getItem(newKey)) {
      const legacy = localStorage.getItem(oldKey);
      if (legacy) {
        localStorage.setItem(newKey, legacy);
        localStorage.removeItem(oldKey);
      }
    }
  } catch { /* localStorage unavailable */ }
}
migrateLegacy(TOKEN_KEY,  'k_token');
migrateLegacy(CLAUDE_KEY, 'k_claude');

function token() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    window.location.reload();
    return undefined;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const STORAGE = { TOKEN_KEY, CLAUDE_KEY };

export const api = {
  get:    (path)       => req('GET',    path),
  post:   (path, body) => req('POST',   path, body),
  put:    (path, body) => req('PUT',    path, body),
  delete: (path)       => req('DELETE', path),

  auth: {
    login:      (email, password)  => req('POST', '/auth/login', { email, password }),
    me:         ()                 => req('GET',  '/auth/me'),
    register:   (data)             => req('POST', '/auth/register', data),
    connectStb: (stb_id)           => req('POST', '/auth/connect-stb', { stb_id }),
    password:   (current, np)      => req('PUT',  '/auth/password', { current, newPassword: np }),
  },

  admin: {
    stats:        ()       => req('GET',    '/admin/stats'),
    stbs:         ()       => req('GET',    '/admin/steuerberater'),
    createStb:    (d)      => req('POST',   '/admin/steuerberater', d),
    updateStb:    (id, d)  => req('PUT',    `/admin/steuerberater/${id}`, d),
    deleteStb:    (id)     => req('DELETE', `/admin/steuerberater/${id}`),
    smes:         ()       => req('GET',    '/admin/unternehmen'),
    createSme:    (d)      => req('POST',   '/admin/unternehmen', d),
    updateSme:    (id, d)  => req('PUT',    `/admin/unternehmen/${id}`, d),
    commissions:  ()       => req('GET',    '/admin/commissions'),
  },

  stb: {
    profile:       ()        => req('GET',  '/stb/profile'),
    updateProfile: (d)       => req('PUT',  '/stb/profile', d),
    stats:         ()        => req('GET',  '/stb/stats'),
    clients:       ()        => req('GET',  '/stb/clients'),
    client:        (id)      => req('GET',  `/stb/clients/${id}`),
    createClient:  (d)       => req('POST', '/stb/clients', d),
    setModules:    (id, m)   => req('PUT',  `/stb/clients/${id}/modules`, m),
    commissions:   ()        => req('GET',  '/stb/commissions'),
  },

  sme: {
    profile:        ()         => req('GET',    '/sme/profile'),
    updateProfile:  (d)        => req('PUT',    '/sme/profile', d),
    dashboard:      ()         => req('GET',    '/sme/dashboard'),
    customers:      ()         => req('GET',    '/sme/customers'),
    customer:       (id)       => req('GET',    `/sme/customers/${id}`),
    createCustomer: (d)        => req('POST',   '/sme/customers', d),
    updateCustomer: (id, d)    => req('PUT',    `/sme/customers/${id}`, d),
    deleteCustomer: (id)       => req('DELETE', `/sme/customers/${id}`),
    invoices:       ()         => req('GET',    '/sme/invoices'),
    createInvoice:  (d)        => req('POST',   '/sme/invoices', d),
    updateInvoice:  (id, d)    => req('PUT',    `/sme/invoices/${id}`, d),
    sendInvoice:    (id, e)    => req('POST',   `/sme/invoices/${id}/send`, { email: e }),
    sendReminder:   (id, e)    => req('POST',   `/sme/invoices/${id}/remind`, { email: e }),
    expenses:       ()         => req('GET',    '/sme/expenses'),
    createExpense:  (d)        => req('POST',   '/sme/expenses', d),
    updateExpense:  (id, d)    => req('PUT',    `/sme/expenses/${id}`, d),
    inventory:      ()         => req('GET',    '/sme/inventory'),
    createItem:     (d)        => req('POST',   '/sme/inventory', d),
    moveStock:      (id, d)    => req('POST',   `/sme/inventory/${id}/move`, d),
    deals:          ()         => req('GET',    '/sme/deals'),
    createDeal:     (d)        => req('POST',   '/sme/deals', d),
    updateDeal:     (id, d)    => req('PUT',    `/sme/deals/${id}`, d),
    emails:         ()         => req('GET',    '/sme/emails'),
  },

  /** Calls Anthropic's Messages API directly from the browser using the
   *  user-configured key. The `anthropic-dangerous-direct-browser-access`
   *  header is required because we're calling api.anthropic.com from a
   *  browser; in production users should provide their own key via Settings. */
  claude: async (prompt, apiKey) => {
    if (!apiKey) return '⚠️ Kein Claude API-Key. Bitte in Einstellungen → KI hinterlegen.';
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: 'Du bist ein professioneller Geschäftsassistent für deutschsprachige KMU. Antworte immer auf Deutsch, präzise und handlungsorientiert.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const d = await r.json();
      if (d.error) return `Fehler: ${d.error.message}`;
      return d.content?.[0]?.text || 'Keine Antwort';
    } catch (e) {
      return `Verbindungsfehler: ${e.message}`;
    }
  },
};

export const fmt = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);

export const fmtDate = (s) => {
  if (!s) return '–';
  try { return new Date(s).toLocaleDateString('de-DE'); } catch { return s; }
};
