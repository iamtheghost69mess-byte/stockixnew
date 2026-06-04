# syntax=docker/dockerfile:1
#
# Worker image build — target: under 200MB
#
# Problem with old Dockerfile:
#   COPY . .  →  copies entire monorepo including services/stockix-finance (large).
#   Then installs ALL workspace deps including api, dashboard, pms.
#   Result: 631MB image.
#
# Fix:
#   1. Copy only the packages the worker actually needs.
#   2. Install only --filter infra:worker:build chain.
#   3. Runtime stage copies only the compiled bundle + docker CLI.
#   4. Result: target ~180MB.

FROM node:22-alpine AS base
RUN apk add --no-cache docker-cli docker-cli-compose \
    && apk upgrade --no-cache \
    && corepack enable && corepack prepare pnpm@9.15.9 --activate

# ─────────────────────────────────────────────────────────────
# Build stage — installs only worker dependency chain
# ─────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app

# Copy workspace manifests first (layer-cache friendly)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy only the packages the worker imports at runtime
COPY packages/config/package.json             ./packages/config/
COPY packages/db/package.json                 ./packages/db/
COPY packages/auth/package.json               ./packages/auth/
COPY packages/shared/package.json             ./packages/shared/
COPY infra/worker-service/package.json        ./infra/worker-service/

# Copy tsup worker config (needed for build)
COPY infra/worker-service/tsup.worker.config.ts  ./infra/worker-service/

# Install only the worker dependency chain — not api, dashboard, pms, or finance
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter infra-worker...

# Copy source for packages the worker needs
COPY packages/config/    ./packages/config/
COPY packages/db/        ./packages/db/
COPY packages/auth/      ./packages/auth/
COPY packages/shared/    ./packages/shared/
COPY infra/worker-service/ ./infra/worker-service/

# Build shared packages then bundle the worker
RUN pnpm --filter @repo/auth build \
 && pnpm --filter @repo/shared build \
 && pnpm infra:worker:build

# Verify bundle was produced
RUN test -f infra/worker-service/.runtime/worker.js

# ─────────────────────────────────────────────────────────────
# Runtime stage — only the bundle + docker CLI
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS worker

RUN apk add --no-cache docker-cli docker-cli-compose \
    && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
WORKDIR /app

# Copy only the compiled bundle — not source, not node_modules
COPY --from=build /app/infra/worker-service/.runtime/worker.js ./worker.js

EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "worker.js"]
