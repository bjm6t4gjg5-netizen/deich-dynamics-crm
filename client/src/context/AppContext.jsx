import { createContext, useContext, useState, useEffect } from 'react';
import { api, STORAGE } from '../api.js';
import { BRAND } from '../brand.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKeyRaw] = useState(() => {
    try { return localStorage.getItem(STORAGE.CLAUDE_KEY) || ''; } catch { return ''; }
  });

  const setApiKey = (k) => {
    setApiKeyRaw(k);
    try {
      if (k) localStorage.setItem(STORAGE.CLAUDE_KEY, k);
      else   localStorage.removeItem(STORAGE.CLAUDE_KEY);
    } catch { /* ignore */ }
  };

  // Theme is derived live from the profile — no save round-trip needed for the
  // preview in the appearance editor.
  const theme = {
    color:  profile?.theme_color  || profile?.stb_color  || BRAND.primary,
    accent: profile?.theme_accent || profile?.stb_accent || BRAND.accent,
    mode:   profile?.theme_mode   || 'light',
    logo:   profile?.logo_url     || profile?.stb_logo   || null,
    firm:   profile?.firm_name    || BRAND.product,
  };

  // Project theme into CSS variables so every component picks it up
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--primary',      theme.color);
    r.style.setProperty('--primary-dark', theme.color + 'dd');
    r.style.setProperty('--accent',       theme.accent);
    r.style.setProperty('--primary-lt',   theme.color + '22');
    if (theme.mode === 'dark') r.classList.add('dark');
    else                       r.classList.remove('dark');
  }, [theme.color, theme.accent, theme.mode]);

  // Resume session on load
  useEffect(() => {
    let cancelled = false;
    const t = localStorage.getItem(STORAGE.TOKEN_KEY);
    if (!t) { setLoading(false); return undefined; }
    api.auth.me()
      .then((d) => {
        if (cancelled) return;
        setUser(d.user);
        setProfile(d.profile);
      })
      .catch(() => {
        try { localStorage.removeItem(STORAGE.TOKEN_KEY); } catch { /* ignore */ }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const login = async (email, password) => {
    const d = await api.auth.login(email, password);
    try { localStorage.setItem(STORAGE.TOKEN_KEY, d.token); } catch { /* ignore */ }
    setUser(d.user);
    setProfile(d.profile);
    return d;
  };

  const logout = () => {
    try { localStorage.removeItem(STORAGE.TOKEN_KEY); } catch { /* ignore */ }
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    const d = await api.auth.me();
    setProfile(d.profile);
  };

  /** Pages can patch the profile locally for instant theme preview without a
   *  server round-trip. The server save happens separately. */
  const patchProfile = (patch) => setProfile((p) => (p ? { ...p, ...patch } : patch));

  return (
    <Ctx.Provider
      value={{
        user, profile, loading, login, logout,
        theme, apiKey, setApiKey, refreshProfile, patchProfile,
        brand: BRAND,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
