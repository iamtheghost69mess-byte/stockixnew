# POS backend Dockerfile
#
# Fix: was FROM node:22 (Debian bookworm-slim, ~900MB).
# Now: FROM node:22-alpine (~150MB). Saves ~750MB per image.
# Build context: repo root (STOCKIX_REPO_ROOT).

FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ \
    && apk upgrade --no-cache

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/posnew/apps/pos-backend/package.json ./services/posnew/apps/pos-backend/package.json
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# package-lock.json is superseded by pnpm-lock.yaml at monorepo root
# Do not commit package-lock.json
RUN pnpm install --frozen-lockfile --filter pos-backend --prod --ignore-scripts

COPY services/posnew/apps/pos-backend ./services/posnew/apps/pos-backend
WORKDIR /app/services/posnew/apps/pos-backend

# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache dumb-init \
    && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
WORKDIR /app

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

COPY --from=build --chown=nodejs:nodejs /app/services/posnew/apps/pos-backend ./

EXPOSE 8010

HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8010/api/ping || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]
