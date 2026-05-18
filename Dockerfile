# syntax=docker/dockerfile:1.7
#
# Single-stage build. Multi-stage was failing in production (client/dist
# wasn't reaching the runtime container despite a green build), so we keep
# everything in one image — slightly larger, much harder to misconfigure.
#
# Order is deliberate:
#   1. Install client deps + build → produces client/dist
#   2. Install server prod deps
#   3. Copy server source
# Done in this order so Docker's layer cache stays useful: package.json files
# are copied separately from source so source edits don't bust the deps layer.

FROM node:20-alpine

WORKDIR /app

# ── Client: deps then build ──────────────────────────────────────────────────
COPY client/package*.json ./client/
RUN cd client && npm install --no-audit --no-fund
COPY client ./client
RUN cd client && npm run build && ls -la /app/client/dist /app/client/dist/assets

# ── Server: prod deps only ───────────────────────────────────────────────────
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

# ── Server: source ───────────────────────────────────────────────────────────
COPY server ./server

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O- http://localhost:8080/api/health || exit 1

# init.js is idempotent — skips re-seed if a superadmin already exists.
CMD ["sh", "-c", "node /app/server/db/init.js || true && exec node /app/server/index.js"]
