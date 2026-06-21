# syntax=docker/dockerfile:1
#
# Worker image build
#
# Build stage: installs API deps (only) so pnpm deploy can produce a flat
# production node_modules, then compiles the worker bundle.
# Runtime stage: node_modules from pnpm deploy + compiled bundle + docker CLI.
#
# node_modules are required because the worker bundle marks npm packages
# (ioredis, drizzle-orm, postgres, bullmq, @sentry/node, execa, zod, etc.)
# as external — they are not inlined by tsup.

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
COPY packages/eslint-config/package.json             ./packages/eslint-config/
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
    pnpm install --frozen-lockfile --filter api --filter @repo/auth --filter @repo/shared --filter @repo/typescript-config --filter @repo/platform-worker-shared

# Copy source for packages the worker needs
COPY packages/config/               ./packages/config/
COPY packages/db/                   ./packages/db/
COPY packages/auth/                 ./packages/auth/
COPY packages/shared/               ./packages/shared/
COPY packages/typescript-config/    ./packages/typescript-config/
COPY packages/platform-worker-shared/ ./packages/platform-worker-shared/
COPY infra/worker-service/            ./infra/worker-service/
# apps/api/src is needed: platform-worker-shared imports api/worker-public which
# resolves to apps/api/src/worker-public.ts (TypeScript source, no pre-build step).
COPY apps/api/src/        ./apps/api/src/
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/tsup.worker.config.ts ./apps/api/

# Build shared packages then bundle the worker
RUN pnpm --filter @repo/auth build \
 && pnpm --filter @repo/shared build \
 && pnpm infra:worker:build

# Verify bundle was produced
RUN test -f infra/worker-service/.runtime/worker.js

# Create a flat production node_modules from the api package (which shares all
# deps the worker bundle needs at runtime: ioredis, drizzle-orm, postgres,
# bullmq, @sentry/node, execa, zod, nodemailer, dotenv, etc.)
# apps/api/package.json has "files":["dist"] — create the dir so pnpm deploy
# doesn't skip the package when dist hasn't been built in this stage.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    mkdir -p apps/api/dist && pnpm deploy --filter api --prod /api-deploy

# ─────────────────────────────────────────────────────────────
# Runtime stage — bundle + node_modules + docker CLI
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS worker

RUN apk add --no-cache docker-cli docker-cli-compose \
    && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
WORKDIR /app

# Production node_modules (flat, no pnpm symlinks) — needed by the worker bundle
# because tsup keeps npm packages external (not inlined).
COPY --from=build /api-deploy/node_modules ./node_modules

# Compiled worker bundle — worker.js + chunk-*.js siblings
COPY --from=build /app/infra/worker-service/.runtime/ ./

EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "worker.js"]
