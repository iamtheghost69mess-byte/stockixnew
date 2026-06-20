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
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy only the packages the worker imports at runtime
COPY packages/config/package.json                    ./packages/config/
COPY packages/db/package.json                        ./packages/db/
COPY packages/auth/package.json                      ./packages/auth/
COPY packages/shared/package.json                    ./packages/shared/
COPY packages/typescript-config/package.json         ./packages/typescript-config/
COPY packages/platform-worker-shared/package.json    ./packages/platform-worker-shared/
COPY infra/worker-service/package.json               ./infra/worker-service/
# apps/api owns tsup.worker.config.ts and has tsup as a devDep — its manifest
# must be present so `pnpm --filter api exec tsup` can resolve the package.
COPY apps/api/package.json                    ./apps/api/

# Install deps for api (owns tsup devDep), auth, and shared (built before bundling).
# infra/worker-service has no package name so cannot be used as a pnpm filter.
# @repo/typescript-config is a devDep of auth (needed by tsup to resolve tsconfig
# extends). Including it in the filter ensures pnpm creates the workspace-root
# node_modules/@repo/typescript-config symlink so load-tsconfig can resolve it.
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter api --filter @repo/auth --filter @repo/shared --filter @repo/typescript-config \
 && mkdir -p ./node_modules/@repo \
 && ln -sf ../../packages/typescript-config ./node_modules/@repo/typescript-config

# Copy source for packages the worker needs
COPY packages/config/               ./packages/config/
COPY packages/db/                   ./packages/db/
COPY packages/auth/                 ./packages/auth/
COPY packages/shared/               ./packages/shared/
COPY packages/typescript-config/    ./packages/typescript-config/
COPY packages/platform-worker-shared/ ./packages/platform-worker-shared/
COPY infra/worker-service/          ./infra/worker-service/
# The worker tsup config lives in apps/api — only this file is needed (not the full app source).
COPY apps/api/tsup.worker.config.ts ./apps/api/

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
