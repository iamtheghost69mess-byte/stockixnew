# POS backend Dockerfile
#
# Build context: repo root (STOCKIX_REPO_ROOT).

FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ \
    && apk upgrade --no-cache

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/auth/dist ./packages/auth/dist
COPY apps/pos-backend/package.json ./apps/pos-backend/package.json
COPY packages/domain-access/package.json ./packages/domain-access/package.json
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN pnpm install --frozen-lockfile --filter pos-backend... --prod --ignore-scripts

COPY packages/domain-access ./packages/domain-access
COPY apps/pos-backend ./apps/pos-backend
WORKDIR /app/apps/pos-backend

# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache dumb-init eudev-libs \
    && apk upgrade --no-cache
RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Preserve pnpm workspace layout so node_modules symlinks resolve (/app/node_modules/.pnpm).
COPY --from=build --chown=nodejs:nodejs /app/node_modules /app/node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages/auth /app/packages/auth
COPY --from=build --chown=nodejs:nodejs /app/packages/domain-access /app/packages/domain-access
COPY --from=build --chown=nodejs:nodejs /app/apps/pos-backend /app/apps/pos-backend

USER nodejs
WORKDIR /app/apps/pos-backend

EXPOSE 8010

HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8010/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]
