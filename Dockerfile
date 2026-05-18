# syntax=docker/dockerfile:1.7
#
# Single-stage multi-step build: install deps + build the frontend, then keep
# only what's needed at runtime. Server serves both /api and the built client
# from /server/index.js when NODE_ENV=production.

# ── Stage 1: build client ────────────────────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

# ── Stage 2: install server prod deps ────────────────────────────────────────
FROM node:20-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=server-deps  /app/server/node_modules ./server/node_modules
COPY server                                       ./server
COPY --from=client-build /app/client/dist         ./client/dist

# Persistent data lives in /data when mounted (Fly volume, Render disk).
# Fall back to ./server when no volume is mounted — fine for ephemeral demos.
RUN mkdir -p /data
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O- http://localhost:8080/api/health || exit 1

CMD ["node", "server/index.js"]
