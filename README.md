# Deich Dynamics CRM

> Buchhaltung & CRM für deutsche KMU und Steuerberater — aus St. Peter-Ording.

Multi-tenant SaaS-Plattform mit drei Nutzerrollen (Super-Admin · Steuerberater · Unternehmen), Mandantenverwaltung, Rechnungen, Belegen, Inventar, Pipeline und optionalem KI-Assistenten. Hosting in Deutschland, DSGVO- und GoBD-konform.

[![CI](https://github.com/bjm6t4gjg5-netizen/deich-dynamics-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/bjm6t4gjg5-netizen/deich-dynamics-crm/actions/workflows/ci.yml)

## Schnellstart (lokal)

```bash
# Voraussetzungen: Node 20+, npm

# Terminal 1 — Backend
cd server
cp .env.example .env          # einmalig — Werte anpassen
npm install
npm run db:init               # legt SQLite-DB + Demo-Daten an
npm run dev                   # → http://localhost:3001

# Terminal 2 — Frontend
cd client
npm install
npm run dev                   # → http://localhost:5173
```

Im Browser öffnen: <http://localhost:5173>

## Demo-Zugänge

| Rolle              | E-Mail                              | Passwort     |
| :----------------- | :---------------------------------- | :----------- |
| Super-Admin        | `admin@deich-dynamics.com`          | `Admin2025!` |
| Steuerberater      | `demo-stb@deich-dynamics.com`       | `Demo2025!`  |
| Unternehmen + StB  | `demo-firma@deich-dynamics.com`     | `Demo2025!`  |
| Solo-Unternehmen   | `demo-solo@deich-dynamics.com`      | `Demo2025!`  |

> Demo-Passwörter sind nur für die lokale Entwicklung gedacht. Vor jedem Public-Deploy unbedingt ändern oder per `SEED_ADMIN_*` in `.env` überschreiben.

## Architektur

```
deich-dynamics-crm/
├── client/                  React 18 + Vite, Lucide-Icons, vollständig themeable
│   └── src/
│       ├── brand.js         Produktname/Farben/Domain — White-Label-Kontrollpunkt
│       ├── api.js           Fetch-Wrapper, JWT in localStorage
│       ├── context/         AppContext (User+Theme), LangContext (DE/EN)
│       └── pages/           admin/, stb/, sme/ — eine Datei pro Bildschirm
├── server/                  Node 20 + Express + node-sqlite3-wasm
│   ├── config.js            zentralisierte, validierte Env-Konfiguration
│   ├── db/                  Schema + Demo-Seed
│   ├── middleware/          auth (JWT), errors, validate, mailer
│   ├── routes/              auth · admin · stb · sme
│   └── services/            audit-log
├── Dockerfile               Multi-stage build (client + server in einem Image)
├── render.yaml              One-click Deploy auf Render (Frankfurt-Region)
├── fly.toml                 Deploy auf Fly.io mit Volume für SQLite
└── .github/workflows/ci.yml Lint + Build bei jedem Push
```

### Rollen & Datenmodell

* **Super-Admin** verwaltet Steuerberater (StB), schaltet Features pro StB frei, sieht Plattform-Provisionen.
* **Steuerberater** legt eigene Mandanten an, steuert deren Modul-Berechtigungen (`{contacts, pipeline, invoices, expenses, inventory, ai}`), bekommt prozentuale Provision auf bezahlte Rechnungen seiner Mandanten.
* **Unternehmen (Mandant)** nutzt sein eigenes Portal — Kunden, Rechnungen, Belege, Inventar, Pipeline. Kann sich an einen StB binden oder solo arbeiten.

Theming, Logo und Mailserver sind pro StB konfigurierbar. Mandanten erben das Branding ihres StB, können aber eigenes Logo überschreiben.

## Sicherheit

* Passwörter via `bcryptjs` mit Cost-Faktor 12 — niemals als Klartext gespeichert.
* JWT (HS256) mit erzwungener Mindestlänge von 32 Zeichen in Production. Server startet **nicht**, wenn `JWT_SECRET` fehlt oder zu schwach ist.
* `helmet` setzt Security-Header, `express-rate-limit` drosselt `/api/auth/*` (Default 20 Versuche / 15 min pro IP) und `/api/**` (300 Anfragen / 15 min).
* CORS-Whitelist über `CLIENT_URL`.
* Strukturiertes Audit-Log (`audit_log`-Tabelle) für sicherheitsrelevante Aktionen (Login, Registrierung, Passwortwechsel).
* Fehler-Output in Production minimal — kein Stack-Trace, keine internen Pfade.
* DSGVO-konform: Hosting & Daten in Deutschland (Render Frankfurt oder Fly fra).

## Deployment

### Option A — Render (empfohlen für Demo)

1. Render-Konto verbinden, Repo importieren.
2. Render erkennt `render.yaml` automatisch und legt den Service an.
3. Nach dem ersten Deploy: `CLIENT_URL` auf die finale Render-URL setzen.
4. Redeploy auslösen — fertig.

### Option B — Fly.io

```bash
fly launch --no-deploy
fly secrets set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
fly secrets set CLIENT_URL=https://<dein-app>.fly.dev
fly volumes create deich_data --size 1 --region fra
fly deploy
```

### Option C — Eigener Server (Docker)

```bash
docker build -t deich-dynamics-crm .
docker run -d -p 8080:8080 \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") \
  -e CLIENT_URL=https://crm.deich-dynamics.com \
  -v deich_data:/data \
  --name deich-crm \
  deich-dynamics-crm
```

## White-Label

Alle markenspezifischen Werte sind an zwei Stellen zentralisiert:

* `client/src/brand.js` — Produktname, Farben, Domain im Frontend.
* `server/config.js` (`config.brand`) — Backend-Defaults für E-Mails, Exporte.

Logo, Farben und Mailserver sind zusätzlich **pro Steuerberater** konfigurierbar und überschreiben die globalen Defaults im laufenden Betrieb.

## Lizenz

Proprietary © Deich Dynamics Solutions. Alle Rechte vorbehalten.
