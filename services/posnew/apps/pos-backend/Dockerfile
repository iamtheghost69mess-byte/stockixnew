# POS backend Dockerfile
#
# Fix: was FROM node:20 (Debian bookworm-slim, ~900MB).
# Now: FROM node:20-alpine (~150MB). Saves ~750MB per image.
# Build context: repo root (STOCKIX_REPO_ROOT).

FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++ \
    && apk upgrade --no-cache

WORKDIR /app

# Copy package files first for layer caching
COPY services/posnew/apps/pos-backend/package.json ./package.json
COPY services/posnew/apps/pos-backend/package-lock.json* ./

RUN npm install --omit=dev --no-audit --no-fund

# Copy source
COPY services/posnew/apps/pos-backend/ ./

# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init \
    && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
WORKDIR /app

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

COPY --from=build --chown=nodejs:nodejs /app ./

EXPOSE 8010

HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8010/api/ping || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]
