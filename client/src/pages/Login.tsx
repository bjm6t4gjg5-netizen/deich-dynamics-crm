import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, STORAGE } from '../api';
import { BRAND } from '../brand';
import { Shield, BarChart3, Building2, Sparkles } from 'lucide-react';

/**
 * Login screen — split layout: a Nordsee-themed brand panel on the left, the
 * actual form on the right. The brand panel uses a layered SVG wave instead of
 * a raster image so it stays crisp at any DPR. On mobile (< 900px) the panel
 * collapses to a slim header.
 */
export default function Login() {
  const { login } = useApp();
  const [mode, setMode]         = useState('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [firmName, setFirmName] = useState('');
  const [stbCode, setStbCode]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const demos = [
    { Icon: Shield,    label: 'Super-Admin',   email: 'admin@deich-dynamics.com',      password: 'Admin2025!' },
    { Icon: BarChart3, label: 'Steuerberater', email: 'demo-stb@deich-dynamics.com',   password: 'Demo2025!'  },
    { Icon: Building2, label: 'Unternehmen',   email: 'demo-firma@deich-dynamics.com', password: 'Demo2025!'  },
    { Icon: Building2, label: 'Solo-Firma',    email: 'demo-solo@deich-dynamics.com',  password: 'Demo2025!'  },
  ];

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        const d = await api.auth.register({
          email,
          password,
          name,
          firm_name: firmName,
          stb_code: stbCode || undefined,
        });
        try { localStorage.setItem(STORAGE.TOKEN_KEY, d.token); } catch { /* ignore */ }
        window.location.reload();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      {/* ── Brand panel ─────────────────────────────────────────────────── */}
      <aside className="login-brand" aria-hidden="false">
        <div className="login-brand-inner">
          <div className="login-mark" aria-label={BRAND.product}>
            <div className="login-mark-badge">M</div>
            <div>
              <div className="login-mark-name">{BRAND.name}</div>
              <div className="login-mark-sub">von {BRAND.company}</div>
            </div>
          </div>

          <div className="login-headline">
            <h1>Buchhaltung & CRM <br/>aus St. Peter-Ording.</h1>
            <p>Mandanten, Rechnungen, Belege und Inventar — in einer Anwendung, gehostet in Deutschland.</p>
          </div>

          <ul className="login-features">
            <li><span className="dot"/> Mandanten-Workflow für Steuerberater</li>
            <li><span className="dot"/> GoBD-konforme Rechnungen & Belege</li>
            <li><span className="dot"/> Modulare Berechtigungen pro Mandant</li>
            <li><span className="dot"/> KI-Assistent integriert (Bring-your-own-key)</li>
          </ul>

          <div className="login-foot">
            <span>🔐 bcrypt · ✓ DSGVO · 🇩🇪 Hosting in Deutschland</span>
          </div>
        </div>

        {/* Decorative waves */}
        <svg className="login-waves" viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 120 C 150 70, 300 170, 450 110 S 700 70, 800 120 L 800 200 L 0 200 Z" fill="rgba(255,255,255,0.06)"/>
          <path d="M0 150 C 150 110, 300 200, 450 140 S 700 100, 800 150 L 800 200 L 0 200 Z" fill="rgba(255,255,255,0.09)"/>
          <path d="M0 180 C 150 150, 300 210, 450 170 S 700 140, 800 180 L 800 200 L 0 200 Z" fill="rgba(255,255,255,0.13)"/>
        </svg>
      </aside>

      {/* ── Form panel ──────────────────────────────────────────────────── */}
      <main className="login-form-wrap">
        <div className="login-form-card">
          <div className="login-tabs">
            <button className={`login-tab${mode === 'login' ? ' active' : ''}`} onClick={() => setMode('login')} type="button">
              Anmelden
            </button>
            <button className={`login-tab${mode === 'register' ? ' active' : ''}`} onClick={() => setMode('register')} type="button">
              Konto erstellen
            </button>
          </div>

          <form onSubmit={submit} className="login-form">
            {mode === 'register' && (
              <>
                <Field label="Ihr Name" required>
                  <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Muster" required />
                </Field>
                <Field label="Firmenname" required>
                  <input className="form-input" value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Muster GmbH" required />
                </Field>
              </>
            )}

            <Field label="E-Mail-Adresse" required>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@firma.de"
                required
                autoComplete="email"
                autoFocus={mode === 'login'}
              />
            </Field>

            <Field label="Passwort" required>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Mindestens 8 Zeichen' : '••••••••'}
                required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={mode === 'register' ? 8 : 1}
              />
            </Field>

            {mode === 'register' && (
              <Field label="Steuerberater-Code (optional)" hint="Falls Sie von einem Steuerberater eingeladen wurden, tragen Sie dessen ID hier ein.">
                <input className="form-input" value={stbCode} onChange={(e) => setStbCode(e.target.value)} placeholder="ID des Steuerberaters" />
              </Field>
            )}

            {error && <div className="login-error">{error}</div>}

            <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
              {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>

          {mode === 'login' && (
            <div className="login-demo">
              <div className="login-demo-label">
                <Sparkles size={12} /> Produktdemo
              </div>
              <div className="login-demo-grid">
                {demos.map(({ Icon, label, email: e, password: p }) => (
                  <button
                    key={e}
                    className="login-demo-chip"
                    type="button"
                    onClick={() => { setEmail(e); setPassword(p); }}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="login-legal">
          © {new Date().getFullYear()} {BRAND.company} · <a href={BRAND.website} target="_blank" rel="noreferrer">{BRAND.domain}</a>
        </div>
      </main>
    </div>
  );
}

function Field({ label, hint, required, children }: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}{required && <span aria-hidden="true" style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {children}
      {hint && <p className="form-hint">{hint}</p>}
    </div>
  );
}
