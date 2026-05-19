/**
 * api.ts — Thin typed fetch wrapper for the Deich Dynamics CRM REST API.
 *
 * Storage keys are prefixed with `dd_` ("deich dynamics") so we avoid colliding
 * with anything else on the same host in dev. A legacy fallback reads old
 * `k_*` keys once, so users mid-session don't get logged out by the rebrand.
 */

import type {
  User, Profile, Customer, Invoice, Expense, Deal,
  InventoryItem, InventoryMovement, DashboardStats,
} from './types';

const BASE = '/api';

// Storage keys
const TOKEN_KEY  = 'dd_token';
const CLAUDE_KEY = 'dd_claude';

// Legacy fallback — read once, then migrate
function migrateLegacy(newKey: string, oldKey: string): void {
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

function token(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function req<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

export const STORAGE = { TOKEN_KEY, CLAUDE_KEY };

export interface LoginResponse {
  token: string;
  user: User;
  profile: Profile | null;
}

export interface MeResponse {
  user: User;
  profile: Profile | null;
}

export const api = {
  get:    <T = unknown>(path: string)             => req<T>('GET',    path),
  post:   <T = unknown>(path: string, body?: unknown) => req<T>('POST',   path, body),
  put:    <T = unknown>(path: string, body?: unknown) => req<T>('PUT',    path, body),
  patch:  <T = unknown>(path: string, body?: unknown) => req<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string, body?: unknown) => req<T>('DELETE', path, body),

  auth: {
    login:      (email: string, password: string) =>
      req<LoginResponse>('POST', '/auth/login', { email, password }),
    me:         () => req<MeResponse>('GET',  '/auth/me'),
    register:   (data: Record<string, unknown>) =>
      req<LoginResponse>('POST', '/auth/register', data),
    connectStb: (stb_id: string) =>
      req<{ ok: true; stb_firm: string }>('POST', '/auth/connect-stb', { stb_id }),
    password:   (current: string, np: string) =>
      req<{ ok: true }>('PUT', '/auth/password', { current, newPassword: np }),
  },

  admin: {
    stats:        () => req<Record<string, number>>('GET',    '/admin/stats'),
    stbs:         () => req<Profile[]>('GET',    '/admin/steuerberater'),
    createStb:    (d: Record<string, unknown>) => req('POST',   '/admin/steuerberater', d),
    updateStb:    (id: string, d: Record<string, unknown>) => req('PUT', `/admin/steuerberater/${id}`, d),
    deleteStb:    (id: string) => req('DELETE', `/admin/steuerberater/${id}`),
    smes:         () => req<Profile[]>('GET',    '/admin/unternehmen'),
    createSme:    (d: Record<string, unknown>) => req('POST',   '/admin/unternehmen', d),
    updateSme:    (id: string, d: Record<string, unknown>) => req('PUT', `/admin/unternehmen/${id}`, d),
    commissions:  () => req<Array<Record<string, unknown>>>('GET',    '/admin/commissions'),
  },

  stb: {
    profile:       ()        => req<Profile>('GET',  '/stb/profile'),
    updateProfile: (d: Record<string, unknown>) => req('PUT',  '/stb/profile', d),
    stats:         ()        => req<Record<string, number>>('GET',  '/stb/stats'),
    clients:       ()        => req<Profile[]>('GET',  '/stb/clients'),
    client:        (id: string) => req<{ client: Profile; invoices: Invoice[]; expenses: Expense[] }>('GET',  `/stb/clients/${id}`),
    createClient:  (d: Record<string, unknown>) => req('POST', '/stb/clients', d),
    setModules:    (id: string, m: Record<string, boolean>) => req('PUT',  `/stb/clients/${id}/modules`, m),
    commissions:   ()        => req<Array<Record<string, unknown>>>('GET',  '/stb/commissions'),
  },

  sme: {
    profile:        () => req<Profile>('GET',    '/sme/profile'),
    updateProfile:  (d: Record<string, unknown>) => req('PUT', '/sme/profile', d),
    dashboard:      () => req<DashboardStats>('GET',    '/sme/dashboard'),
    customers:      () => req<Customer[]>('GET',    '/sme/customers'),
    customer:       (id: string) => req<Customer & { invoices: Invoice[]; referrals: Customer[]; referredBy: Customer | null; files: unknown[] }>('GET',    `/sme/customers/${id}`),
    createCustomer: (d: Record<string, unknown>) => req<{ id: string }>('POST', '/sme/customers', d),
    updateCustomer: (id: string, d: Record<string, unknown>) => req('PUT', `/sme/customers/${id}`, d),
    deleteCustomer: (id: string) => req('DELETE', `/sme/customers/${id}`),
    invoices:       () => req<Invoice[]>('GET',    '/sme/invoices'),
    createInvoice:  (d: Record<string, unknown>) => req<{ id: string; invoice_number: string }>('POST', '/sme/invoices', d),
    updateInvoice:  (id: string, d: Record<string, unknown>) => req('PUT', `/sme/invoices/${id}`, d),
    sendInvoice:    (id: string, email: string) => req('POST',   `/sme/invoices/${id}/send`,   { email }),
    sendReminder:   (id: string, email: string) => req('POST',   `/sme/invoices/${id}/remind`, { email }),
    expenses:       () => req<Expense[]>('GET',    '/sme/expenses'),
    createExpense:  (d: Record<string, unknown>) => req<{ id: string }>('POST', '/sme/expenses', d),
    updateExpense:  (id: string, d: Record<string, unknown>) => req('PUT', `/sme/expenses/${id}`, d),
    inventory:      () => req<{ items: InventoryItem[]; allMovements: InventoryMovement[] }>('GET',    '/sme/inventory'),
    createItem:     (d: Record<string, unknown>) => req<{ id: string }>('POST', '/sme/inventory', d),
    moveStock:      (id: string, d: Record<string, unknown>) => req('POST',   `/sme/inventory/${id}/move`, d),
    deals:          () => req<Deal[]>('GET',    '/sme/deals'),
    createDeal:     (d: Record<string, unknown>) => req<{ id: string }>('POST', '/sme/deals', d),
    updateDeal:     (id: string, d: Record<string, unknown>) => req('PUT', `/sme/deals/${id}`, d),
    emails:         () => req<unknown[]>('GET',    '/sme/emails'),
  },

  /** Calls Anthropic's Messages API directly from the browser using the
   *  user-configured key. The `anthropic-dangerous-direct-browser-access`
   *  header is required because we're calling api.anthropic.com from a
   *  browser; in production users should provide their own key via Settings. */
  claude: async (prompt: string, apiKey: string | null | undefined): Promise<string> => {
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
      const d = await r.json() as { content?: Array<{ text: string }>; error?: { message: string } };
      if (d.error) return `Fehler: ${d.error.message}`;
      return d.content?.[0]?.text || 'Keine Antwort';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Verbindungsfehler: ${msg}`;
    }
  },
};

// ── Locale & number formatting ─────────────────────────────────────────────────
// Stored as JSON in localStorage so the user can pick the country style they
// prefer (Germany default: 1.234,56 €). Read on every render — the cost is
// negligible and we want changes to apply instantly across the app.
export interface LocaleSettings {
  locale: string;     // BCP 47 (e.g. 'de-DE', 'en-US', 'fr-FR')
  currency: string;   // ISO 4217 (e.g. 'EUR', 'USD', 'CHF')
}
const LOCALE_KEY = 'dd_locale_v1';
const DEFAULT_LOCALE: LocaleSettings = { locale: 'de-DE', currency: 'EUR' };

export function getLocaleSettings(): LocaleSettings {
  try {
    const raw = localStorage.getItem(LOCALE_KEY);
    if (!raw) return DEFAULT_LOCALE;
    const parsed = JSON.parse(raw);
    return {
      locale: parsed.locale || DEFAULT_LOCALE.locale,
      currency: parsed.currency || DEFAULT_LOCALE.currency,
    };
  } catch { return DEFAULT_LOCALE; }
}
export function setLocaleSettings(s: LocaleSettings): void {
  try { localStorage.setItem(LOCALE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export const fmt = (n: number | null | undefined): string => {
  const { locale, currency } = getLocaleSettings();
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n || 0);
};

/** Formats a number without currency — useful for input field display. */
export const fmtNum = (n: number | null | undefined, decimals = 2): string => {
  const { locale } = getLocaleSettings();
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);
};

/** Parses a locale-formatted string back to a number. Accepts both
 *  German ("1.234,56") and US ("1,234.56") style and tolerates spaces. */
export function parseNum(s: string | null | undefined): number {
  if (s == null) return 0;
  const str = String(s).trim().replace(/[^\d\-,.\s]/g, '').replace(/\s/g, '');
  if (!str) return 0;
  // Detect decimal separator: whichever appears last is the decimal one
  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) normalized = str;
  else if (lastComma > lastDot) {
    // German style: thousands = . , decimal = ,
    normalized = str.replace(/\./g, '').replace(',', '.');
  } else {
    // US style: thousands = , , decimal = .
    normalized = str.replace(/,/g, '');
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Fire-and-forget usage tracking. Failures are swallowed so analytics
 *  never disrupt the user flow. */
export function track(event_name: string, event_type: 'page' | 'click' | 'action' = 'click', metadata?: Record<string, unknown>): void {
  try {
    fetch(`${BASE}/usage/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      },
      body: JSON.stringify({ event_name, event_type, metadata }),
      keepalive: true,
    }).catch(() => { /* swallow */ });
  } catch { /* swallow */ }
}

export const fmtDate = (s: string | null | undefined): string => {
  if (!s) return '–';
  const { locale } = getLocaleSettings();
  try { return new Date(s).toLocaleDateString(locale); } catch { return s; }
};
