
## ./infra/docker/base/Dockerfile
```
# syntax=docker/dockerfile:1
# Shared base image for all Stockix Node.js services (api, dashboard, pos-backend, pos-frontend2).
# Does NOT include docker-cli — the infra-worker has its own base stage for that.
# Published to GHCR as: ghcr.io/<org>/stockix/base:node22-<sha>
# Rebuilt in build-and-publish.yml whenever this file changes.

FROM node:22-alpine

RUN apk add --no-cache \
      libc6-compat \
      dumb-init \
    && apk upgrade --no-cache \
    && corepack enable \
    && corepack prepare pnpm@9.15.9 --activate \
    && node --version \
    && pnpm --version

WORKDIR /app

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

```

## ./infra/worker-service/Dockerfile
```
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
COPY packages/config/package.json             ./packages/config/
COPY packages/db/package.json                 ./packages/db/
COPY packages/auth/package.json               ./packages/auth/
COPY packages/shared/package.json             ./packages/shared/
COPY infra/worker-service/package.json        ./infra/worker-service/
# apps/api owns tsup.worker.config.ts and has tsup as a devDep — its manifest
# must be present so `pnpm --filter api exec tsup` can resolve the package.
COPY apps/api/package.json                    ./apps/api/

# Install deps for api (owns tsup devDep), auth, and shared (built before bundling).
# infra/worker-service has no package name so cannot be used as a pnpm filter.
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter api --filter @repo/auth --filter @repo/shared

# Copy source for packages the worker needs
COPY packages/config/    ./packages/config/
COPY packages/db/        ./packages/db/
COPY packages/auth/      ./packages/auth/
COPY packages/shared/    ./packages/shared/
COPY infra/worker-service/ ./infra/worker-service/
# The worker tsup config lives in apps/api — only this file is needed (not the full app source).
COPY apps/api/tsup.worker.config.ts ./apps/api/

# Build shared packages then bundle the worker
RUN pnpm --filter @repo/auth build \
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

# Copy the compiled bundle and all dynamic-import chunks produced by tsup splitting
COPY --from=build /app/infra/worker-service/.runtime/ ./

EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "worker.js"]

```

## ./apps/pos-backend/Dockerfile
```
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
# Install tsx before removing npm — required to execute .ts files (globalErrorHandler.ts, etc.)
RUN npm install -g tsx
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
CMD ["tsx", "app.js"]

```

## ./apps/dashboard/Dockerfile
```
# syntax=docker/dockerfile:1
ARG BASE_IMAGE=ghcr.io/iamtheghost69mess-byte/stockix/stockix-base:node22
FROM ${BASE_IMAGE} AS build
ENV NODE_OPTIONS=--max-old-space-size=3072
ENV NEXT_TELEMETRY_DISABLED=1

# ── Phase 1: manifests only — install cache survives source changes ──
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/dashboard/package.json              ./apps/dashboard/
COPY packages/config/package.json             ./packages/config/
COPY packages/shared/package.json             ./packages/shared/
COPY packages/ui/package.json                 ./packages/ui/
COPY packages/ui-core/package.json            ./packages/ui-core/
COPY packages/theme/package.json              ./packages/theme/
COPY packages/eslint-config/package.json      ./packages/eslint-config/
COPY packages/typescript-config/package.json  ./packages/typescript-config/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter dashboard...

# ── Phase 2: source — only busts install layer when manifests change ──
COPY . .

ARG NEXT_PUBLIC_STOCKIX_API_URL=https://api.stockix.cloud
ENV NEXT_PUBLIC_STOCKIX_API_URL=${NEXT_PUBLIC_STOCKIX_API_URL}

ARG NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=stockix.cloud
ENV NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=${NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN}

ARG NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=https
ENV NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=${NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME}

ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}

RUN pnpm --filter dashboard build
RUN test -f apps/dashboard/.next/standalone/apps/dashboard/server.js

FROM ${BASE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/dashboard/.next/standalone ./
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /app/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]

```

## ./apps/api/Dockerfile
```
# syntax=docker/dockerfile:1
ARG BASE_IMAGE=ghcr.io/iamtheghost69mess-byte/stockix/stockix-base:node22
FROM ${BASE_IMAGE} AS build
RUN apk add --no-cache libc6-compat
ENV NODE_OPTIONS=--max-old-space-size=3072

# ── Phase 1: manifests only — install cache survives source changes ──
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json                            ./apps/api/
COPY packages/auth/package.json                       ./packages/auth/
COPY packages/config/package.json                     ./packages/config/
COPY packages/db/package.json                         ./packages/db/
COPY packages/events/package.json                     ./packages/events/
COPY packages/shared/package.json                     ./packages/shared/
COPY packages/typescript-config/package.json          ./packages/typescript-config/
COPY packages/eslint-config/package.json              ./packages/eslint-config/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter api...

# ── Phase 2: source — only busts install layer when manifests change ──
COPY . .

# @repo/auth ships dist/; other @repo/* are bundled from TypeScript source via tsup.
RUN pnpm --filter @repo/auth build
RUN pnpm --filter api build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm deploy --filter api --prod /deploy

FROM ${BASE_IMAGE} AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy /app

EXPOSE 4000
CMD ["node", "dist/index.js"]

```

## ./apps/pos-frontend2/Dockerfile
```
# Build context: Stockix repo root (STOCKIX_REPO_ROOT).
# Uses pnpm (same as pos-backend) — it understands workspace: protocol natively.

FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ && apk upgrade --no-cache

WORKDIR /pos

# Workspace manifests first — isolated layer for install caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ui-core/package.json ./packages/ui-core/package.json
COPY packages/ui-shared/package.json ./packages/ui-shared/package.json
COPY apps/pos-frontend2/package.json ./apps/pos-frontend2/package.json
COPY apps/pos-frontend2/patches ./apps/pos-frontend2/patches

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Hoist all packages to root node_modules so webpack can resolve ui-core/ui-shared
# devDeps (lucide-react, sonner, clsx, etc.) from any directory during transpilation.
# ui-core ships TS source; its devDeps are installed via pos-frontend2 but pnpm's
# strict isolation would hide them from packages/ui-core/src/ without hoisting.
RUN echo 'public-hoist-pattern[]=*' > .npmrc

# Install only this app and its workspace deps (pnpm resolves workspace:* natively)
RUN pnpm install --frozen-lockfile --filter ./apps/pos-frontend2

# Copy source after install to avoid busting the install cache on every code change
COPY packages/ui-core ./packages/ui-core
COPY packages/ui-shared ./packages/ui-shared
COPY apps/pos-frontend2 ./apps/pos-frontend2

WORKDIR /pos/apps/pos-frontend2

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_POS_API_ORIGIN=http://localhost:8010
ENV NEXT_PUBLIC_POS_API_ORIGIN=${NEXT_PUBLIC_POS_API_ORIGIN}

RUN pnpm run build

FROM node:22-alpine AS runner

RUN apk update && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /pos/apps/pos-frontend2/.next/standalone ./
COPY --from=build /pos/apps/pos-frontend2/.next/static ./apps/pos-frontend2/.next/static
COPY --from=build /pos/apps/pos-frontend2/public ./apps/pos-frontend2/public

EXPOSE 3000

CMD ["node", "apps/pos-frontend2/server.js"]

```

## ./services/pms/frontend/Dockerfile
```
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]

```

## ./services/pms/Dockerfile
```
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3003
CMD ["node", "dist/index.js"]

```

## ./services/chatlive/docker/Dockerfile
```
# pre-build stage
FROM node:24-alpine as node
FROM ruby:3.4.4-alpine3.21 AS pre-builder

ARG NODE_VERSION="24.13.0"
ARG PNPM_VERSION="10.2.0"
ENV NODE_VERSION=${NODE_VERSION}
ENV PNPM_VERSION=${PNPM_VERSION}

# ARG default to production settings
# For development docker-compose file overrides ARGS
ARG BUNDLE_WITHOUT="development:test"
ENV BUNDLE_WITHOUT ${BUNDLE_WITHOUT}
ENV BUNDLER_VERSION=2.5.16

ARG RAILS_SERVE_STATIC_FILES=true
ENV RAILS_SERVE_STATIC_FILES ${RAILS_SERVE_STATIC_FILES}

ARG RAILS_ENV=production
ENV RAILS_ENV ${RAILS_ENV}

ARG NODE_OPTIONS="--max-old-space-size=4096 --openssl-legacy-provider"
ENV NODE_OPTIONS ${NODE_OPTIONS}

ENV BUNDLE_PATH="/gems"

RUN apk update && apk add --no-cache \
  openssl \
  tar \
  build-base \
  tzdata \
  postgresql-dev \
  postgresql-client \
  git \
  curl \
  xz \
  && mkdir -p /var/app \
  && gem install bundler -v "$BUNDLER_VERSION"

COPY --from=node /usr/local/bin/node /usr/local/bin/
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

RUN npm install -g pnpm@${PNPM_VERSION}

RUN echo 'export PNPM_HOME="/root/.local/share/pnpm"' >> /root/.shrc \
  && echo 'export PATH="$PNPM_HOME:$PATH"' >> /root/.shrc \
  && export PNPM_HOME="/root/.local/share/pnpm" \
  && export PATH="$PNPM_HOME:$PATH" \
  && pnpm --version

# Persist the environment variables in Docker
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

COPY Gemfile Gemfile.lock ./

# natively compile grpc and protobuf to support alpine musl (dialogflow-docker workflow)
# https://github.com/googleapis/google-cloud-ruby/issues/13306
# adding xz as nokogiri was failing to build libxml
# https://github.com/chatwoot/chatwoot/issues/4045
RUN apk update && apk add --no-cache build-base musl ruby-full ruby-dev gcc make musl-dev openssl openssl-dev g++ linux-headers xz vips
RUN bundle config set --local force_ruby_platform true

# Do not install development or test gems in production
RUN if [ "$RAILS_ENV" = "production" ]; then \
  bundle config set without 'development test'; bundle install -j 4 -r 3; \
  else bundle install -j 4 -r 3; \
  fi

COPY package.json pnpm-lock.yaml ./
RUN pnpm i

COPY . /app

# creating a log directory so that image wont fail when RAILS_LOG_TO_STDOUT is false
# https://github.com/chatwoot/chatwoot/issues/701
RUN mkdir -p /app/log

# generate production assets if production environment
RUN if [ "$RAILS_ENV" = "production" ]; then \
  SECRET_KEY_BASE=precompile_placeholder RAILS_LOG_TO_STDOUT=enabled bundle exec rake assets:precompile \
  && rm -rf spec node_modules tmp/cache; \
  fi

# Generate .git_sha file with current commit hash
RUN (git rev-parse HEAD 2>/dev/null || echo "local-dev") > /app/.git_sha

# Remove unnecessary files
RUN rm -rf /gems/ruby/3.4.0/cache/*.gem \
  && find /gems/ruby/3.4.0/gems/ \( -name "*.c" -o -name "*.o" \) -delete \
  && rm -rf .git \
  && rm .gitignore

# final build stage
FROM ruby:3.4.4-alpine3.21

ARG NODE_VERSION="24.13.0"
ARG PNPM_VERSION="10.2.0"
ENV NODE_VERSION=${NODE_VERSION}
ENV PNPM_VERSION=${PNPM_VERSION}

ARG BUNDLE_WITHOUT="development:test"
ENV BUNDLE_WITHOUT ${BUNDLE_WITHOUT}
ENV BUNDLER_VERSION=2.5.16

ARG EXECJS_RUNTIME="Disabled"
ENV EXECJS_RUNTIME ${EXECJS_RUNTIME}

ARG RAILS_SERVE_STATIC_FILES=true
ENV RAILS_SERVE_STATIC_FILES ${RAILS_SERVE_STATIC_FILES}

ARG BUNDLE_FORCE_RUBY_PLATFORM=1
ENV BUNDLE_FORCE_RUBY_PLATFORM ${BUNDLE_FORCE_RUBY_PLATFORM}

ARG RAILS_ENV=production
ENV RAILS_ENV ${RAILS_ENV}
ENV BUNDLE_PATH="/gems"

RUN apk update && apk add --no-cache \
  build-base \
  openssl \
  tzdata \
  postgresql-client \
  imagemagick \
  git \
  vips \
  && gem install bundler -v "$BUNDLER_VERSION"

COPY --from=node /usr/local/bin/node /usr/local/bin/
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN if [ "$RAILS_ENV" != "production" ]; then \
  apk add --no-cache curl \
  && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && npm install -g pnpm@${PNPM_VERSION} \
  && pnpm --version; \
  fi

COPY --from=pre-builder /gems/ /gems/
COPY --from=pre-builder /app /app

# Copy .git_sha file from pre-builder stage
COPY --from=pre-builder /app/.git_sha /app/.git_sha

WORKDIR /app

EXPOSE 3000

```

## ./services/stockix-finance/packages/server/Dockerfile
```
# Build context: services/stockix-finance (see scripts/prebuild-tenant-images.mjs).
# packages/shared is synced from monorepo root before docker build.
# Targets: runtime | migration-runtime

FROM node:22-alpine AS deps

USER root

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && chown node:node /

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV NODE_OPTIONS="--max-old-space-size=6144"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/server/package.json ./packages/server/
COPY packages/webapp/package.json ./packages/webapp/
COPY packages/shared/package.json ./packages/shared/
COPY shared ./shared

RUN pnpm install --frozen-lockfile

FROM deps AS build-webapp
COPY packages/webapp ./packages/webapp
COPY packages/shared ./packages/shared
RUN pnpm --filter @stockix/utils run build \
  && pnpm --filter @stockix/email-components run build \
  && pnpm --filter @stockix/webapp run build

FROM build-webapp AS build-app
COPY packages/server ./packages/server
COPY packages/shared ./packages/shared
RUN pnpm --filter @stockix/server run build:app:strict \
  && mkdir -p packages/i18n \
  && cp -r packages/server/src/i18n/. packages/i18n/ \
  && cd packages/server && node ./scripts/compile-tenant-migrations.mjs \
  && mkdir -p build/database/tenant \
  && cp -r src/database/tenant/migrations build/database/tenant/ \
  && find build/database/tenant/migrations -name '*.ts' -delete

FROM build-app AS prod-deps
RUN pnpm prune --prod && \
    rm -rf /app/node_modules/babel-loader \
    /app/node_modules/gulp \
    /app/node_modules/gulp-postcss \
    /app/node_modules/gulp-rename \
    /app/node_modules/gulp-sass

FROM deps AS migration-source
COPY packages/server/scripts ./packages/server/scripts
COPY packages/server/src/database/system ./packages/server/src/database/system

FROM migration-source AS migration-prod-deps
RUN pnpm prune --prod

FROM node:22-alpine AS migration-runtime

ENV NODE_ENV=production
WORKDIR /app/packages/server

RUN addgroup -g 1001 -S stockix && adduser -S stockix -u 1001 -G stockix

COPY --from=migration-prod-deps /app/node_modules /app/node_modules
COPY --from=migration-prod-deps /app/packages/server/package.json ./package.json
COPY --from=migration-source /app/packages/server/scripts ./scripts
COPY --from=migration-source /app/packages/server/src/database/system ./src/database/system

USER stockix
CMD ["node", "./scripts/run-system-migrate.mjs"]

# runtime MUST remain the final stage so `docker build` without --target is safe.
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 -S stockix && adduser -S stockix -u 1001 -G stockix

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=prod-deps /app/packages/server/package.json ./packages/server/package.json
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build-app /app/packages/shared ./packages/shared
COPY --from=build-app /app/packages/server/build ./packages/server/build
COPY --from=build-webapp /app/packages/webapp/dist ./packages/server/webapp-dist
COPY --from=build-app /app/packages/i18n ./packages/i18n
COPY --from=build-app /app/packages/server/public ./packages/server/public
COPY --from=build-app /app/packages/server/static ./packages/server/static

USER stockix
CMD ["node", "./packages/server/build/index.js"]
```

## ./services/stockix-finance/docker/mongo/Dockerfile
```
FROM mongo:5.0
```

## ./services/stockix-finance/docker/mariadb/Dockerfile
```
FROM mariadb:10.2

# The official MariaDB image already handles MYSQL_USER, MYSQL_PASSWORD, etc.
# We only need to provide an init script to grant global privileges 
# if the tenant needs to create additional databases.

COPY ./init.sh /docker-entrypoint-initdb.d/init.sh
RUN chmod +x /docker-entrypoint-initdb.d/init.sh
COPY ./my.cnf /etc/mysql/conf.d/stockix.cnf

CMD ["mysqld"]
EXPOSE 3306
```

## ./services/stockix-finance/docker/redis/Dockerfile
```
FROM redis:6.2.21

COPY redis.conf /usr/local/etc/redis/redis.conf

CMD [ "redis-server", "/usr/local/etc/redis/redis.conf" ]
```

## ./services/stockix-finance/docker/nginx/Dockerfile
```
FROM nginx:1.11

RUN mkdir /etc/nginx/sites-available && rm /etc/nginx/conf.d/default.conf
ADD nginx.conf /etc/nginx/

COPY scripts /root/scripts/
COPY certs /etc/ssl/

COPY sites /etc/nginx/templates

ARG SERVER_PROXY_PORT=3000
ARG WEB_SSL=false
ARG SELF_SIGNED=false

ENV SERVER_PROXY_PORT=$SERVER_PROXY_PORT
ENV WEB_SSL=$WEB_SSL
ENV SELF_SIGNED=$SELF_SIGNED

RUN /bin/bash /root/scripts/build-nginx.sh

CMD nginx
```

## ./infra/shared/docker-compose.yml
```
# Stockix shared infrastructure — started once, used by ALL tenant stacks.
# Run from repo root:
#   docker compose -f infra/shared/docker-compose.yml --env-file infra/prod/.env \
#     -p stockix-shared up -d
#
# All tenant app containers join the `stockix-shared` external network.
# Tenant containers reference databases by hostname:
#   MySQL   → stockix-mysql-proxy:6033 (ProxySQL) → stockix-mysql:3306
#             database: stockix_{slug}_finance  user: tenant_{slug}
#   MongoDB → stockix-mongo:27017  database: {slug}_pos
#   Redis   → stockix-redis:6379   key prefix: tenant:{slug}:
#
# Env vars that drive hostnames (set in infra/prod/.env):
#   SHARED_MYSQL_HOST=stockix-mysql          (worker root DDL only)
#   MYSQL_PROXY_HOST=stockix-mysql-proxy     (tenant app connections)
#   MYSQL_PROXY_PORT=6033
#   SHARED_MONGO_HOST=stockix-mongo
#   TENANT_REDIS_HOST=stockix-redis
#
# Provisioner responsibility:
#   On CREATE: CREATE DATABASE + CREATE USER + GRANT on MySQL; Mongo DB auto-created on first write.
#   On DELETE: DROP DATABASE + DROP USER on MySQL; dropDatabase() via mongosh exec.

name: stockix-shared

services:

  # ─────────────────────────────────────────────────────────────
  # MySQL 8 — one database per tenant (stockix_{slug}_finance)
  # Service name = DNS hostname inside stockix-shared network
  # ─────────────────────────────────────────────────────────────
  stockix-mysql:
    image: mysql:8.0-bookworm
    restart: unless-stopped
    hostname: stockix-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${SHARED_MYSQL_ROOT_PASSWORD}
      MYSQL_CHARACTER_SET_SERVER: utf8mb4
      MYSQL_COLLATION_SERVER: utf8mb4_unicode_ci
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password
      - --max_connections=1000
      - --wait_timeout=60
      - --interactive_timeout=60
      - --connect_timeout=10
      - --innodb-buffer-pool-size=256M
      - --innodb-log-file-size=64M
      - --slow-query-log=ON
      - --long-query-time=2
      # Binary log — required for replication to stockix-mysql-replica
      - --server-id=1
      - --log_bin=mysql-bin
      - --binlog_format=ROW
      - --binlog_expire_logs_seconds=604800
    volumes:
      - shared_mysql_data:/var/lib/mysql
      - ./mysql/init:/docker-entrypoint-initdb.d:ro
    networks:
      stockix-shared:
        aliases:
          - shared-mysql
          - stockix-mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-u", "root", "--password=${SHARED_MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    oom_kill_disable: false
    security_opt:
      - no-new-privileges:true
    deploy:
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 512m
          cpus: "0.5"

  # ─────────────────────────────────────────────────────────────
  # ProxySQL — connection pooler for tenant Finance/POS MySQL traffic.
  # Tenant apps connect on :6033; worker root DDL uses stockix-mysql:3306 directly.
  # Admin interface :6032 on stockix_internal only.
  # ─────────────────────────────────────────────────────────────
  stockix-mysql-proxy:
    image: proxysql/proxysql:2.6.2
    restart: unless-stopped
    hostname: stockix-mysql-proxy
    depends_on:
      stockix-mysql:
        condition: service_healthy
    environment:
      SHARED_MYSQL_ROOT_PASSWORD: ${SHARED_MYSQL_ROOT_PASSWORD}
    volumes:
      - ./proxysql.cnf.template:/etc/proxysql.cnf.template:ro
      - ./proxysql-entrypoint.sh:/usr/local/bin/proxysql-entrypoint.sh:ro
      - shared_proxysql_data:/var/lib/proxysql
    entrypoint: ["/bin/sh", "/usr/local/bin/proxysql-entrypoint.sh"]
    networks:
      stockix-shared:
        aliases:
          - stockix-mysql-proxy
          - mysql-proxy
      stockix_internal:
    healthcheck:
      test:
        - CMD-SHELL
        - mysql -h127.0.0.1 -P6033 -uroot -p"$$SHARED_MYSQL_ROOT_PASSWORD" -e "SELECT 1" || exit 1
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s
    mem_limit: 256m
    cpus: "0.25"
    mem_swappiness: 0
    security_opt:
      - no-new-privileges:true
    deploy:
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 256m
          cpus: "0.25"

  # ─────────────────────────────────────────────────────────────
  # MySQL replica — async read replica of stockix-mysql.
  # ProxySQL routes SELECT traffic here (hostgroup 1); writes stay on primary (hostgroup 0).
  # Bootstrap replication after first deploy — see ops/bootstrap-mysql-replica.sh.
  # Trigger: deploy when active tenant count >= 50 or p95 Finance report > 3s.
  # ─────────────────────────────────────────────────────────────
  stockix-mysql-replica:
    image: mysql:8.0-bookworm
    restart: unless-stopped
    hostname: stockix-mysql-replica
    depends_on:
      stockix-mysql:
        condition: service_healthy
    environment:
      MYSQL_ROOT_PASSWORD: ${SHARED_MYSQL_ROOT_PASSWORD}
      MYSQL_ROOT_HOST: "%"
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password
      - --server-id=2
      - --log_bin=mysql-bin
      - --binlog_format=ROW
      - --relay_log=relay-bin
      - --read_only=ON
      - --super_read_only=ON
      - --skip_name_resolve
      - --max_connections=500
      - --innodb_buffer_pool_size=512M
    volumes:
      - shared_mysql_replica_data:/var/lib/mysql
    networks:
      stockix-shared:
        aliases:
          - stockix-mysql-replica
          - mysql-replica
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-u", "root", "--password=${SHARED_MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 60s
    mem_limit: 640m
    cpus: "0.5"
    mem_swappiness: 0
    oom_kill_disable: false
    security_opt:
      - no-new-privileges:true
    deploy:
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 640m
          cpus: "0.5"

  # ─────────────────────────────────────────────────────────────
  # MongoDB 6 — one database per tenant ({slug}_pos)
  # Single node replica set (rs0) — required by POS connection string
  # (?replicaSet=rs0). On upgrade to multi-server, add members to rs.
  #
  # Bootstrap is two-phase (do not require rs.status in mongo healthcheck):
  #   1. stockix-mongo healthcheck = mongod ping (process listening)
  #   2. stockix-mongo-rs-init runs rs.initiate() then waits for PRIMARY
  # ─────────────────────────────────────────────────────────────
  stockix-mongo:
    image: mongo:6.0
    restart: unless-stopped
    hostname: stockix-mongo
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all", "--wiredTigerCacheSizeGB", "0.25"]
    volumes:
      - shared_mongo_data:/data/db
    networks:
      stockix-shared:
        aliases:
          - shared-mongo
          - stockix-mongo
    healthcheck:
      test:
        - CMD-SHELL
        - 'mongosh --quiet --eval "quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)"'
      interval: 15s
      timeout: 15s
      retries: 10
      start_period: 45s
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    oom_kill_disable: false
    security_opt:
      - no-new-privileges:true

  # One-shot: initiates rs0 after mongod is up; idempotent on restarts.
  # In Swarm mode this task runs once and exits — swarm-init.sh runs the RS init
  # via `docker run --network stockix-shared` instead, so this service is a no-op
  # when deployed via docker stack deploy. Kept for `docker compose up` compatibility.
  stockix-mongo-rs-init:
    image: mongo:6.0
    restart: "no"
    depends_on:
      stockix-mongo:
        condition: service_healthy
    networks:
      - stockix-shared
    entrypoint:
      - bash
      - /scripts/rs-init.sh
    volumes:
      - ./mongo/rs-init.sh:/scripts/rs-init.sh:ro
    deploy:
      restart_policy:
        condition: none
      # No resource cap: one-shot job; mongosh 2.x needs >128m

  # ─────────────────────────────────────────────────────────────
  # Tenant Redis — BullMQ + Finance Agenda jobs for ALL tenants.
  # Kept separate from control-plane-redis (stockix_internal network).
  # Key convention enforced by tenant-env.ts:
  #   tenant:{slug}:queue:*    BullMQ (POS bigcapital-sync)
  #   tenant:{slug}:agenda:*   Finance Agenda scheduler
  #   tenant:{slug}:session:*  Finance sessions
  # ─────────────────────────────────────────────────────────────
  stockix-redis:
    image: redis:7-alpine
    restart: unless-stopped
    hostname: stockix-redis
    environment:
      TENANT_REDIS_PASSWORD: ${TENANT_REDIS_PASSWORD}
    command:
      - redis-server
      - --requirepass
      - ${TENANT_REDIS_PASSWORD}
      - --maxmemory
      - 512mb
      - --maxmemory-policy
      - noeviction
      - --save
      - "900 1"
      - --save
      - "300 10"
      - --appendonly
      - "yes"
      - --auto-aof-rewrite-percentage
      - "100"
      - --auto-aof-rewrite-min-size
      - "64mb"
    volumes:
      - shared_tenant_redis_data:/data
    networks:
      stockix-shared:
        aliases:
          - tenant-redis
          - stockix-redis
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$$TENANT_REDIS_PASSWORD\" ping | grep -q PONG"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 5s
    mem_limit: 576m
    cpus: "0.25"
    mem_swappiness: 0
    oom_kill_disable: false
    security_opt:
      - no-new-privileges:true
    deploy:
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 576m
          cpus: "0.25"

  # ─────────────────────────────────────────────────────────────
  # Gotenberg — shared PDF renderer (Chromium-based).
  # One instance for ALL tenants: stateless HTML→PDF, no tenant data stored.
  # Reachable by all tenant Finance servers via stockix-shared network:
  #   GOTENBERG_URL=http://stockix-gotenberg:3000
  # Port is NOT published to the host — use dev-ports override for local dev.
  # ─────────────────────────────────────────────────────────────
  stockix-gotenberg:
    image: gotenberg/gotenberg:7
    restart: unless-stopped
    hostname: stockix-gotenberg
    expose:
      - '3000'
    networks:
      stockix-shared:
        aliases:
          - stockix-gotenberg
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    security_opt:
      - no-new-privileges:true
    deploy:
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 512m
          cpus: "0.5"

volumes:
  shared_mysql_data:
    name: stockix_shared_mysql
  shared_mysql_replica_data:
    name: stockix_shared_mysql_replica
  shared_mongo_data:
    name: stockix_shared_mongo
  shared_tenant_redis_data:
    name: stockix_shared_tenant_redis
  shared_proxysql_data:
    name: stockix_shared_proxysql

networks:
  # overlay + attachable: non-Swarm per-tenant containers can join via `external: true`
  # Created by swarm-init.sh before this stack deploys — do not let compose create it.
  stockix-shared:
    name: stockix-shared
    driver: overlay
    attachable: true
    external: true
  stockix_internal:
    name: stockix_internal
    external: true
```

## ./infra/prod/docker-compose.yml
```
# Production stack: Traefik (TLS + routing), Postgres, Stockix API + Dashboard.
# Run from repo root on the server (e.g. /opt/stockix/stockixnew):
#   cd infra/prod && docker compose --env-file .env up -d --build
# Chat (Chatwoot): optional — see docker-compose.chat.yml (not used in deploy)
#
# Prerequisites:
#   1. Copy infra/prod/.env.example → infra/prod/.env and fill secrets (never commit .env).
#   2. On the server, sync env for worker dotenv fallback:
#        pnpm env:sync-prod   (copies infra/prod/.env → repo root .env)
#   3. Clone repo at STOCKIX_REPO (default /opt/stockix/stockixnew).
#   4. Start shared infra first:
#        docker compose -f infra/shared/docker-compose.yml --env-file infra/prod/.env \
#          -p stockix-shared up -d
#
# Env injection: platform variables are passed explicitly into api + infra-worker
# (Compose wins over mounted .env; see STOCKIX_LOAD_ROOT_ENV).

name: stockix

x-logging-limits: &logging-limits
  logging:
    driver: "json-file"
    options:
      max-size: "50m"
      max-file: "5"

# Shared runtime env for control plane (api + worker). Sourced from infra/prod/.env via compose substitution.
x-stockix-platform-env: &stockix-platform-env
  NODE_ENV: production
  ROOT_DOMAIN: ${ROOT_DOMAIN}
  PUBLIC_BASE_URL_SCHEME: ${PUBLIC_BASE_URL_SCHEME:-https}
  NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN: ${ROOT_DOMAIN}
  NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME: ${PUBLIC_BASE_URL_SCHEME:-https}
  DASHBOARD_URL: ${DASHBOARD_URL}
  CORS_ORIGINS: ${CORS_ORIGINS:-}
  CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS:-}
  SENTRY_DSN: ${SENTRY_DSN:-}
  SENTRY_ENVIRONMENT: ${SENTRY_ENVIRONMENT:-production}
  RELEASE_VERSION: ${RELEASE_VERSION:-}
  DB_POOL_MAX: ${DB_POOL_MAX:-20}
  DB_IDLE_TIMEOUT_SECONDS: ${DB_IDLE_TIMEOUT_SECONDS:-30}
  DB_CONNECT_TIMEOUT_SECONDS: ${DB_CONNECT_TIMEOUT_SECONDS:-10}
  DB_MAX_LIFETIME_SECONDS: ${DB_MAX_LIFETIME_SECONDS:-1800}
  STOCKIX_API_URL: ${STOCKIX_API_URL:-}
  PLATFORM_API_SECRET: ${PLATFORM_API_SECRET}
  WORKER_SECRET: ${WORKER_SECRET}
  INTERNAL_API_SECRET: ${INTERNAL_API_SECRET}
  SESSION_SECRET: ${SESSION_SECRET}
  AUTH_TOKEN_SECRET: ${AUTH_TOKEN_SECRET}
  DEPLOYMENT_SECRET_KEY: ${DEPLOYMENT_SECRET_KEY}
  LICENSE_SIGNING_SECRET: ${LICENSE_SIGNING_SECRET}
  CONTROL_PLANE_REDIS_URL: ${CONTROL_PLANE_REDIS_URL:-}
  JWT_SECRET: ${JWT_SECRET:-}
  SIGNUP_DISABLED: ${SIGNUP_DISABLED:-true}
  SIGNUP_ALLOWED_DOMAINS: ${SIGNUP_ALLOWED_DOMAINS:-}
  SIGNUP_ALLOWED_EMAILS: ${SIGNUP_ALLOWED_EMAILS:-}
  MAIL_HOST: ${MAIL_HOST:-}
  MAIL_PORT: ${MAIL_PORT:-587}
  MAIL_USERNAME: ${MAIL_USERNAME:-}
  MAIL_PASSWORD: ${MAIL_PASSWORD:-}
  MAIL_SECURE: ${MAIL_SECURE:-false}
  MAIL_FROM_NAME: ${MAIL_FROM_NAME:-Stockix}
  MAIL_FROM_ADDRESS: ${MAIL_FROM_ADDRESS:-}
  RESEND_WEBHOOK_SECRET: ${RESEND_WEBHOOK_SECRET:-}
  # Shared infra — used by worker to provision tenant databases.
  SHARED_MYSQL_HOST: stockix-mysql
  SHARED_MYSQL_ROOT_PASSWORD: ${SHARED_MYSQL_ROOT_PASSWORD}
  MYSQL_PROXY_HOST: ${MYSQL_PROXY_HOST:-stockix-mysql-proxy}
  MYSQL_PROXY_PORT: ${MYSQL_PROXY_PORT:-6033}
  WORKER_MYSQL_PROXY_PORT: ${WORKER_MYSQL_PROXY_PORT:-6033}
  WORKER_HEALTH_PORT: ${WORKER_HEALTH_PORT:-9090}
  SHARED_MONGO_HOST: stockix-mongo
  TENANT_REDIS_HOST: stockix-redis
  TENANT_REDIS_PASSWORD: ${TENANT_REDIS_PASSWORD:-}
  WORKER_CONCURRENCY: ${WORKER_CONCURRENCY:-2}
  MAX_TENANT_PORT: ${MAX_TENANT_PORT:-4999}
  WORKER_JOB_EXECUTION_TIMEOUT_MS: ${WORKER_JOB_EXECUTION_TIMEOUT_MS:-2700000}
  PROVISION_POLL_MS: ${PROVISION_POLL_MS:-2000}
  PROVISION_MAX_MS: ${PROVISION_MAX_MS:-2700000}
  METRICS_ENDPOINT: ${METRICS_ENDPOINT:-}
  METRICS_AUTH_TOKEN: ${METRICS_AUTH_TOKEN:-}
  POS_PLATFORM_API_KEY: ${POS_PLATFORM_API_KEY:-}
  # Distributed tracing — Grafana Tempo (OTLP HTTP). Optional; tracing disabled when unset.
  OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-http://tempo:4318/v1/traces}
  # Do not load repo-root .env inside containers (use explicit env below).
  STOCKIX_LOAD_ROOT_ENV: "0"

x-stockix-worker-env: &stockix-worker-env
  <<: *stockix-platform-env
  API_HOST: api
  REPO_ROOT: /opt/stockix/stockixnew
  STOCKIX_TENANT_APP_ROOT: ${STOCKIX_TENANT_APP_ROOT:-/opt/stockix/stockixnew/services/stockix-finance}
  TENANT_ENV_ROOT: ${TENANT_ENV_ROOT:-/opt/stockix/tenants}
  TRAEFIK_DYNAMIC_DIR: ${TRAEFIK_DYNAMIC_DIR:-/opt/stockix/traefik-dynamic}
  TRAEFIK_TENANT_UPSTREAM_HOST: ${TRAEFIK_TENANT_UPSTREAM_HOST:-host.docker.internal}
  TENANT_INTERNAL_HOST: ${TENANT_INTERNAL_HOST:-host.docker.internal}
  WORKER_INTERNAL_NETWORK: ${WORKER_INTERNAL_NETWORK:-stockix_internal}
  TRAEFIK_NETWORK: ${TRAEFIK_NETWORK:-stockix_public}
  TRAEFIK_LABELS_ENABLED: ${TRAEFIK_LABELS_ENABLED:-false}
  S3_REGION: ${S3_REGION:-}
  S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID:-}
  S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY:-}
  S3_BUCKET: ${S3_BUCKET:-}
  S3_ENDPOINT: ${S3_ENDPOINT:-}
  S3_FORCE_PATH_STYLE: ${S3_FORCE_PATH_STYLE:-true}
  AGENDASH_AUTH_USER: ${AGENDASH_AUTH_USER:-agendash}
  AGENDASH_AUTH_PASSWORD: ${AGENDASH_AUTH_PASSWORD:-}
  DOCKER_HOST: tcp://socket-proxy:2375

services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy:latest
    restart: unless-stopped
    <<: *logging-limits
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      CONTAINERS: 1
      NETWORKS: 1
      SERVICES: 1
      TASKS: 1
      VERSION: 1
      INFO: 1
      VOLUMES: 1
      IMAGES: 1
      NODES: 1
      SWARM: 1
      AUTH: 0
      SECRETS: 0
      CONFIGS: 0
      PLUGINS: 0
      POST: 1
      BUILD: 0
      EVENTS: 1
      LOG_LEVEL: warning
    networks:
      - socket_proxy_network
    mem_limit: 64m
    memswap_limit: 64m
    cpus: "0.1"
    mem_swappiness: 0
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /run
      - /tmp
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:2375/_ping 2>/dev/null | grep -q OK || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 5s
    deploy:
      placement:
        constraints:
          - node.role == manager
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 64m
          cpus: "0.1"

  traefik:
    image: traefik:v3.4
    restart: unless-stopped
    <<: *logging-limits
    mem_limit: 128m
    cpus: "0.25"
    ports:
      - "80:80"
      - "443:443"
      - "127.0.0.1:8080:8080"
    environment:
      CF_DNS_API_TOKEN: ${CF_DNS_API_TOKEN}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - traefik_letsencrypt:/letsencrypt
      - ${TRAEFIK_DYNAMIC_DIR:-/opt/stockix/traefik-dynamic}:/etc/traefik/dynamic
    command:
      - --api=true
      - --api.dashboard=true
      - --providers.swarm=true
      - --providers.swarm.endpoint=tcp://socket-proxy:2375
      - --providers.swarm.exposedbydefault=false
      - --providers.swarm.network=stockix_public
      - --providers.file.directory=/etc/traefik/dynamic
      - --providers.file.watch=true
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.cloudflare.acme.dnschallenge=true
      - --certificatesresolvers.cloudflare.acme.dnschallenge.provider=cloudflare
      - --certificatesresolvers.cloudflare.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.cloudflare.acme.storage=/letsencrypt/acme.json
      - --log.level=INFO
    networks:
      - stockix_public
      - stockix_internal
      - socket_proxy_network
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/ping 2>/dev/null | grep -q OK || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      placement:
        constraints:
          - node.role == manager
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 128m
          cpus: "0.25"
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.traefik-dashboard.rule=Host(`traefik.${ROOT_DOMAIN}`)"
        - "traefik.http.routers.traefik-dashboard.service=api@internal"
        - "traefik.http.routers.traefik-dashboard.entrypoints=websecure"
        - "traefik.http.routers.traefik-dashboard.tls.certresolver=cloudflare"
        - "traefik.http.routers.traefik-dashboard.middlewares=traefik-auth"
        - "traefik.http.middlewares.traefik-auth.basicauth.users=${TRAEFIK_DASHBOARD_BASIC_AUTH:-admin:$$2y$$05$$zQ5DREU7lBuxw3zL8U68O.wK.zQ5DREU7lBuxw3zL8U68O.wK.wK}"

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    <<: *logging-limits
    command:
      - "postgres"
      - "-c"
      - "shared_preload_libraries=pg_stat_statements"
      - "-c"
      - "pg_stat_statements.track=all"
      - "-c"
      - "max_connections=200"
      - "-c"
      - "shared_buffers=256MB"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: stockix_platform
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - stockix_internal
    ports:
      - "127.0.0.1:54330:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d stockix_platform"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    mem_limit: 1g
    cpus: "1.0"
    mem_swappiness: 0
    security_opt:
      - no-new-privileges:true
    deploy:
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 1g
          cpus: "1.0"

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:v0.15.0
    restart: unless-stopped
    <<: *logging-limits
    environment:
      DATA_SOURCE_NAME: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/stockix_platform?sslmode=disable
    networks:
      - stockix_internal
    depends_on:
      postgres:
        condition: service_healthy
    mem_limit: 128m
    cpus: "0.2"
    mem_swappiness: 0
    security_opt:
      - no-new-privileges:true
    deploy:
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 128m
          cpus: "0.2"

  pgbouncer:
    image: pgbouncer/pgbouncer:latest
    restart: unless-stopped
    <<: *logging-limits
    environment:
      DATABASES_HOST: postgres
      DATABASES_PORT: 5432
      DATABASES_DBNAME: stockix_platform
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 200
      PGBOUNCER_DEFAULT_POOL_SIZE: 20
      PGBOUNCER_AUTH_TYPE: any
      PGBOUNCER_LISTEN_PORT: 5432
    networks:
      - stockix_internal
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 128m
          cpus: "0.2"

  control-plane-redis:
    image: redis:7-alpine
    restart: unless-stopped
    <<: *logging-limits
    command:
      - redis-server
      - --maxmemory
      - 64mb
      - --maxmemory-policy
      - allkeys-lru
      - --save
      - ""
    volumes:
      - control_plane_redis_data:/data
    networks:
      - stockix_internal
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 5s
    mem_limit: 96m
    cpus: "0.1"
    mem_swappiness: 0
    security_opt:
      - no-new-privileges:true
    deploy:
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 96m
          cpus: "0.1"

  api:
    image: ${API_IMAGE:-stockix-api:latest}
    restart: unless-stopped
    <<: *logging-limits
    depends_on:
      pgbouncer:
        condition: service_healthy
      control-plane-redis:
        condition: service_healthy
    environment:
      <<: *stockix-platform-env
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform
      PORT: "4000"
      RUN_BULLMQ_CONSUMERS: "false"
    networks:
      - stockix_internal
      - stockix_public
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 20s
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    deploy:
      # Redis provision pub/sub is implemented (lib/provision-pubsub.ts).
      # Requires CONTROL_PLANE_REDIS_URL to be set in infra/prod/.env.
      replicas: 2
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 512m
          cpus: "0.5"
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.api.rule=Host(`api.${ROOT_DOMAIN}`)"
        - "traefik.http.routers.api.entrypoints=websecure"
        - "traefik.http.routers.api.tls.certresolver=cloudflare"
        - "traefik.http.services.api.loadbalancer.server.port=4000"
        - "traefik.http.services.api.loadbalancer.healthcheck.path=/health"
        - "traefik.http.services.api.loadbalancer.healthcheck.interval=10s"
        - "traefik.http.services.api.loadbalancer.healthcheck.timeout=5s"

  api-bullmq:
    image: ${API_IMAGE:-stockix-api:latest}
    restart: unless-stopped
    <<: *logging-limits
    depends_on:
      pgbouncer:
        condition: service_healthy
      control-plane-redis:
        condition: service_healthy
    environment:
      <<: *stockix-platform-env
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform
      PORT: "4001"
      RUN_BULLMQ_CONSUMERS: "true"
    networks:
      - stockix_internal
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \"const Redis=require('ioredis');const u=process.env.CONTROL_PLANE_REDIS_URL;if(!u)process.exit(0);const c=new Redis(u,{maxRetriesPerRequest:1,connectTimeout:3000,lazyConnect:true});c.connect().then(()=>c.ping()).then(()=>{c.disconnect();process.exit(0)}).catch(()=>process.exit(1))\"",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    deploy:
      replicas: 1
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 512m
          cpus: "0.5"

  dashboard:
    image: ${DASHBOARD_IMAGE:-stockix-dashboard:latest}
    restart: unless-stopped
    <<: *logging-limits
    depends_on:
      api:
        condition: service_healthy
    environment:
      <<: *stockix-platform-env
      NEXT_PUBLIC_API_URL: ${STOCKIX_API_URL}
    networks:
      - stockix_public
      - stockix_internal
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 20s
      timeout: 5s
      retries: 3
      start_period: 30s
    mem_limit: 256m
    cpus: "0.25"
    mem_swappiness: 0
    deploy:
      replicas: 2
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 256m
          cpus: "0.25"
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.dashboard.rule=Host(`app.${ROOT_DOMAIN}`)"
        - "traefik.http.routers.dashboard.entrypoints=websecure"
        - "traefik.http.routers.dashboard.tls.certresolver=cloudflare"
        - "traefik.http.services.dashboard.loadbalancer.server.port=3000"

  infra-worker:
    image: ${WORKER_IMAGE:-stockix-infra-worker:latest}
    restart: unless-stopped
    <<: *logging-limits
    depends_on:
      api:
        condition: service_healthy
      socket-proxy:
        condition: service_healthy
    environment:
      <<: *stockix-worker-env
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform
    volumes:
      - ${TENANT_ENV_ROOT:-/opt/stockix/tenants}:/opt/stockix/tenants
      - ${TRAEFIK_DYNAMIC_DIR:-/opt/stockix/traefik-dynamic}:/opt/stockix/traefik-dynamic
      - /opt/stockix/stockixnew:/opt/stockix/stockixnew:ro
    networks:
      - stockix_internal
      - socket_proxy_network
      - stockix-shared
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:9090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    deploy:
      placement:
        constraints:
          - node.role == manager
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 512m
          cpus: "0.5"

  node-exporter:
    image: prom/node-exporter:v1.8.0
    restart: unless-stopped
    <<: *logging-limits
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
      - node_exporter_textfile:/var/lib/node_exporter/textfile:ro
    command:
      - --path.procfs=/host/proc
      - --path.rootfs=/rootfs
      - --path.sysfs=/host/sys
      - --collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($|/)
      - --collector.textfile.directory=/var/lib/node_exporter/textfile
    networks:
      - stockix_internal
    mem_limit: 64m
    cpus: "0.1"
    deploy:
      mode: global
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 64m
          cpus: "0.1"

  redis-exporter:
    image: oliver006/redis_exporter:v1.62.0
    restart: unless-stopped
    <<: *logging-limits
    environment:
      REDIS_ADDR: redis://control-plane-redis:6379
    networks:
      - stockix_internal
    mem_limit: 32m
    cpus: "0.05"
    deploy:
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 32m
          cpus: "0.05"

  prometheus:
    image: prom/prometheus:v2.51.0
    restart: unless-stopped
    <<: *logging-limits
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus_data:/prometheus
    networks:
      - stockix_internal
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=15d"
    mem_limit: 256m
    cpus: "0.25"
    deploy:
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 256m
          cpus: "0.25"

  alertmanager:
    image: prom/alertmanager:v0.27.0
    restart: unless-stopped
    <<: *logging-limits
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    networks:
      - stockix_internal
      - stockix_public
    mem_limit: 64m
    cpus: "0.1"
    deploy:
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 64m
          cpus: "0.1"
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.alertmanager.rule=Host(`alertmanager.${ROOT_DOMAIN}`)"
        - "traefik.http.routers.alertmanager.entrypoints=websecure"
        - "traefik.http.routers.alertmanager.tls.certresolver=cloudflare"
        - "traefik.http.services.alertmanager.loadbalancer.server.port=9093"

  tempo:
    image: grafana/tempo:latest
    restart: unless-stopped
    <<: *logging-limits
    command: ["-config.file=/etc/tempo/tempo.yaml"]
    volumes:
      - ./monitoring/tempo.yaml:/etc/tempo/tempo.yaml:ro
      - tempo_data:/tmp/tempo
    networks:
      - stockix_internal
    mem_limit: 256m
    cpus: "0.25"
    deploy:
      restart_policy:
        condition: any
        delay: 5s
      resources:
        limits:
          memory: 256m
          cpus: "0.25"

  grafana:
    image: grafana/grafana:10.4.0
    restart: unless-stopped
    <<: *logging-limits
    depends_on:
      - tempo
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_SERVER_ROOT_URL: https://grafana.${ROOT_DOMAIN}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./grafana/datasources:/etc/grafana/provisioning/datasources:ro
    networks:
      - stockix_internal
      - stockix_public
    mem_limit: 256m
    cpus: "0.25"
    deploy:
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 256m
          cpus: "0.25"
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.grafana.rule=Host(`grafana.${ROOT_DOMAIN}`)"
        - "traefik.http.routers.grafana.entrypoints=websecure"
        - "traefik.http.routers.grafana.tls.certresolver=cloudflare"

  db-backup:
    image: alpine:3.20
    restart: unless-stopped
    <<: *logging-limits
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      BACKUP_B2_BUCKET: ${BACKUP_B2_BUCKET:-}
      BACKUP_B2_KEY_ID: ${BACKUP_B2_KEY_ID:-}
      BACKUP_B2_APP_KEY: ${BACKUP_B2_APP_KEY:-}
      BACKUP_B2_ENDPOINT: ${BACKUP_B2_ENDPOINT:-}
      BACKUP_B2_PREFIX: ${BACKUP_B2_PREFIX:-stockix-platform-backups}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-30}
      BACKUP_POSTGRES_CONTAINER: ${BACKUP_POSTGRES_CONTAINER:-stockix-postgres-1}
      BACKUP_MYSQL_CONTAINER: ${BACKUP_MYSQL_CONTAINER:-stockix-shared-stockix-mysql-1}
      BACKUP_MONGO_CONTAINER: ${BACKUP_MONGO_CONTAINER:-stockix-shared-stockix-mongo-1}
      SHARED_MYSQL_ROOT_PASSWORD: ${SHARED_MYSQL_ROOT_PASSWORD:-}
      HEALTH_REDIS_CONTAINER: ${HEALTH_REDIS_CONTAINER:-stockix-shared-stockix-redis-1}
      TENANT_REDIS_PASSWORD: ${TENANT_REDIS_PASSWORD:-}
      TRAEFIK_DYNAMIC_DIR: ${TRAEFIK_DYNAMIC_DIR:-/traefik-dynamic}
      TENANT_ENV_ROOT: ${TENANT_ENV_ROOT:-/tenant-envs}
      BACKUP_ENCRYPTION_KEY: ${BACKUP_ENCRYPTION_KEY:-}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-stockix_platform}
      TEXTFILE_COLLECTOR_DIR: /var/lib/node_exporter/textfile
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./backup:/backup:ro
      - ${TRAEFIK_DYNAMIC_DIR:-/opt/stockix/traefik-dynamic}:/traefik-dynamic:ro
      - ${TENANT_ENV_ROOT:-/opt/stockix/tenants}:/tenant-envs:ro
      - node_exporter_textfile:/var/lib/node_exporter/textfile
    networks:
      - stockix_internal
      - stockix-shared
    command:
      - /bin/sh
      - -c
      - |
        apk add --no-cache docker-cli aws-cli bash gzip mysql-client mongodb-tools gnupg >/dev/null
        chmod +x /backup/*.sh
        echo '0 2,14 * * * /backup/backup.sh >> /var/log/backup-cron.log 2>&1' > /tmp/cron.txt
        echo '5 2,14 * * * /backup/backup-runtime.sh >> /var/log/backup-runtime-cron.log 2>&1' >> /tmp/cron.txt
        crontab /tmp/cron.txt
        crond -f -l 8
    healthcheck:
      test: ["CMD-SHELL", "pgrep -x crond > /dev/null || exit 1"]
      interval: 60s
      timeout: 5s
      retries: 2
      start_period: 10s
    mem_limit: 128m
    cpus: "0.2"
    mem_swappiness: 0
    deploy:
      placement:
        constraints:
          - node.role == manager
      restart_policy:
        condition: any
        delay: 10s
        max_attempts: 3
      resources:
        limits:
          memory: 128m
          cpus: "0.2"

volumes:
  node_exporter_textfile:
    name: stockix_node_exporter_textfile
  postgres_data:
    name: stockix_postgres_data
  control_plane_redis_data:
    name: stockix_control_plane_redis
  traefik_letsencrypt:
    name: stockix_traefik_letsencrypt
  prometheus_data:
    name: stockix_prometheus_data
  grafana_data:
    name: stockix_grafana_data
  tempo_data:
    name: stockix_tempo_data

networks:
  stockix_public:
    name: stockix_public
    driver: overlay
  stockix_internal:
    name: stockix_internal
    driver: overlay
    internal: true
  socket_proxy_network:
    name: stockix_socket_proxy_network
    driver: overlay
    internal: true
  stockix-shared:
    name: stockix-shared
    external: true

# Docker Swarm secrets — created by infra/deploy/secrets-init.sh before first deploy.
# Each secret is mounted at /run/secrets/<name> inside the container.
secrets:
  postgres_password:
    external: true
  session_secret:
    external: true
  auth_token_secret:
    external: true
  jwt_secret:
    external: true
  license_signing_secret:
    external: true
  platform_api_secret:
    external: true
  worker_secret:
    external: true
  deployment_secret_key:
    external: true
  backup_encryption_key:
    external: true
  shared_mysql_root_password:
    external: true
```

## ./infra/prod/docker-compose.chat.yml
```
# Optional Chatwoot stack — NOT used by production deploy.
# Enable manually when needed:
#   cd infra/prod && docker compose -f docker-compose.yml -f docker-compose.chat.yml --env-file .env up -d

name: stockix

services:
  chatwoot:
    build:
      context: ../../services/chatlive
      dockerfile: docker/Dockerfile
    image: stockix-chatlive:local
    restart: unless-stopped
    mem_limit: 1g
    memswap_limit: 1g
    cpus: "0.75"
    mem_swappiness: 0
    command: ["bundle", "exec", "rails", "s", "-p", "3000", "-b", "0.0.0.0"]
    environment:
      - SECRET_KEY_BASE=${CHATWOOT_SECRET_KEY_BASE}
      - FRONTEND_URL=${CHATWOOT_FRONTEND_URL:-https://chat.${ROOT_DOMAIN}}
      - INSTALLATION_NAME=${CHATWOOT_INSTALLATION_NAME:-Stockix}
      - BRAND_NAME=${CHATWOOT_BRAND_NAME:-}
      - BRAND_URL=${CHATWOOT_BRAND_URL:-}
      - WIDGET_BRAND_URL=${CHATWOOT_WIDGET_BRAND_URL:-}
      - LOGO=${CHATWOOT_LOGO_URL:-/brand-assets/logo.svg}
      - LOGO_DARK=${CHATWOOT_LOGO_DARK_URL:-/brand-assets/logo_dark.svg}
      - LOGO_THUMBNAIL=${CHATWOOT_LOGO_THUMBNAIL_URL:-/brand-assets/logo_thumbnail.svg}
      - DISPLAY_MANIFEST=${CHATWOOT_DISPLAY_MANIFEST:-false}
      - HELPCENTER_URL=${CHATWOOT_HELPCENTER_URL:-}
      - POSTGRES_HOST=chatwoot-postgres
      - POSTGRES_DATABASE=chatwoot
      - POSTGRES_USERNAME=chatwoot
      - POSTGRES_PASSWORD=${CHATWOOT_DB_PASSWORD}
      - REDIS_URL=redis://chatwoot-redis:6379
      - MAILER_SENDER_EMAIL=${MAIL_FROM_ADDRESS:-}
      - SMTP_ADDRESS=${MAIL_HOST:-}
      - SMTP_PORT=${MAIL_PORT:-587}
      - SMTP_USERNAME=${MAIL_USERNAME:-}
      - SMTP_PASSWORD=${MAIL_PASSWORD:-}
    ports:
      - "127.0.0.1:3200:3000"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/auth/sign_in >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    depends_on:
      chatwoot-postgres:
        condition: service_healthy
      chatwoot-redis:
        condition: service_healthy
    networks:
      - stockix_internal

  chatwoot-sidekiq:
    build:
      context: ../../services/chatlive
      dockerfile: docker/Dockerfile
    image: stockix-chatlive:local
    restart: unless-stopped
    mem_limit: 512m
    memswap_limit: 512m
    cpus: "0.5"
    command: ["bundle", "exec", "sidekiq", "-C", "config/sidekiq.yml"]
    environment:
      - SECRET_KEY_BASE=${CHATWOOT_SECRET_KEY_BASE}
      - FRONTEND_URL=${CHATWOOT_FRONTEND_URL:-https://chat.${ROOT_DOMAIN}}
      - INSTALLATION_NAME=${CHATWOOT_INSTALLATION_NAME:-Stockix}
      - POSTGRES_HOST=chatwoot-postgres
      - POSTGRES_DATABASE=chatwoot
      - POSTGRES_USERNAME=chatwoot
      - POSTGRES_PASSWORD=${CHATWOOT_DB_PASSWORD}
      - REDIS_URL=redis://chatwoot-redis:6379
      - MAILER_SENDER_EMAIL=${MAIL_FROM_ADDRESS:-}
      - SMTP_ADDRESS=${MAIL_HOST:-}
      - SMTP_PORT=${MAIL_PORT:-587}
      - SMTP_USERNAME=${MAIL_USERNAME:-}
      - SMTP_PASSWORD=${MAIL_PASSWORD:-}
      - RAILS_ENV=production
      - INSTALLATION_ENV=docker
    depends_on:
      chatwoot-postgres:
        condition: service_healthy
      chatwoot-redis:
        condition: service_healthy
    networks:
      - stockix_internal

  chatwoot-postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    mem_limit: 512m
    memswap_limit: 512m
    cpus: "0.25"
    environment:
      - POSTGRES_DB=chatwoot
      - POSTGRES_USER=chatwoot
      - POSTGRES_PASSWORD=${CHATWOOT_DB_PASSWORD}
    volumes:
      - chatwoot_postgres:/var/lib/postgresql/data
    networks:
      - stockix_internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chatwoot -d chatwoot"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  chatwoot-redis:
    image: redis:7-alpine
    restart: unless-stopped
    mem_limit: 128m
    memswap_limit: 128m
    cpus: "0.1"
    volumes:
      - chatwoot_redis:/data
    networks:
      - stockix_internal
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 5s

networks:
  stockix_internal:
    name: stockix_internal
    external: true

volumes:
  chatwoot_postgres:
  chatwoot_redis:

```

## ./infra/tenant-stack/docker-compose.yml
```
# Stockix per-tenant Finance stack (prod-shaped).
# Compose v2: `docker compose -p stockix-{slug} ...`
#
# BEFORE (old): nginx + webapp + server + mysql + mongo + redis = 6 containers per tenant.
# AFTER  (new): server only = 1 container per tenant.
#
# All database connections point to the shared infrastructure network (stockix-shared):
#   MySQL  → stockix-mysql-proxy:6033   DB: stockix_{slug}_finance  user: tenant_{slug}
#   MongoDB → stockix-mongo:27017  DB: {slug}_pos
#   Redis  → stockix-redis:6379   key prefix: tenant:{slug}:
#
# Finance UI is bundled into the server image (Vite dist → webapp-dist) with SPA fallback.
#
# Traefik terminates TLS. Tenant subdomain: {slug}.stockix.cloud

services:

  server:
    image: stockix-server:local
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/ping || exit 1"]
      interval: 20s
      timeout: 10s
      retries: 15
      start_period: 300s
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    oom_kill_disable: false
    read_only: true
    tmpfs:
      - /tmp
      - /app/packages/server/public/storage
    security_opt:
      - no-new-privileges:true
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - NODE_ENV=production
      - NEW_RELIC_ENABLED=false
      - NEW_RELIC_APP_NAME=stockix-tenant
      - SENTRY_DSN=${SENTRY_DSN:-}
      - SENTRY_ENVIRONMENT=${SENTRY_ENVIRONMENT:-tenant}
      # Mail — copied from platform env at provision time
      - MAIL_HOST=${MAIL_HOST:-}
      - MAIL_USERNAME=${MAIL_USERNAME:-}
      - MAIL_PASSWORD=${MAIL_PASSWORD:-}
      - MAIL_PORT=${MAIL_PORT:-}
      - MAIL_SECURE=${MAIL_SECURE:-}
      - MAIL_FROM_NAME=${MAIL_FROM_NAME:-}
      - MAIL_FROM_ADDRESS=${MAIL_FROM_ADDRESS:-}
      # ── Database (via ProxySQL → stockix-mysql) ─────────────────
      - DB_CLIENT=mysql
      - DB_HOST=${DB_HOST:-stockix-mysql-proxy}
      - DB_PORT=${DB_PORT:-6033}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_CHARSET=${DB_CHARSET:-utf8mb4}
      - SYSTEM_DB_CLIENT=mysql
      - SYSTEM_DB_HOST=${SYSTEM_DB_HOST:-${DB_HOST:-stockix-mysql-proxy}}
      - SYSTEM_DB_PORT=${SYSTEM_DB_PORT:-${DB_PORT:-6033}}
      - SYSTEM_DB_USER=${SYSTEM_DB_USER:-${DB_USER}}
      - SYSTEM_DB_PASSWORD=${SYSTEM_DB_PASSWORD:-${DB_PASSWORD}}
      - SYSTEM_DB_NAME=${SYSTEM_DB_NAME}
      - TENANT_DB_CLIENT=mysql
      - TENANT_DB_HOST=${TENANT_DB_HOST:-${DB_HOST:-stockix-mysql-proxy}}
      - TENANT_DB_PORT=${TENANT_DB_PORT:-${DB_PORT:-6033}}
      - TENANT_DB_USER=${TENANT_DB_USER:-${DB_USER}}
      - TENANT_DB_PASSWORD=${TENANT_DB_PASSWORD:-${DB_PASSWORD}}
      - TENANT_DB_NAME_PREFIX=${TENANT_DB_NAME_PREFIX:-stockix_tenant_}
      - TENANT_DB_CHARSET=${TENANT_DB_CHARSET:-utf8mb4}
      # ── MongoDB (stockix-mongo) ───────────────────────────────
      - MONGODB_DATABASE_URL=${MONGODB_DATABASE_URL}
      # ── Redis (stockix-redis) ─────────────────────────────────
      - REDIS_HOST=stockix-redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD:-}
      - REDIS_DB=0
      - REDIS_KEY_PREFIX=${REDIS_KEY_PREFIX}
      - QUEUE_HOST=stockix-redis
      - QUEUE_PORT=6379
      # ── Auth + identity ──────────────────────────────────────
      - JWT_SECRET=${JWT_SECRET}
      - APP_JWT_SECRET=${JWT_SECRET}
      - BASE_URL=${BASE_URL}
      - PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-${BASE_URL}}
      - PUBLIC_PROXY_PORT=${PUBLIC_PROXY_PORT}
      - SOCKET_ALLOWED_ORIGINS=${SOCKET_ALLOWED_ORIGINS:-}
      - INTERNAL_API_SECRET=${INTERNAL_API_SECRET}
      - DEPLOYMENT_SECRET_KEY=${DEPLOYMENT_SECRET_KEY}
      # ── S3 / Backblaze ───────────────────────────────────────
      - S3_REGION=${S3_REGION:-}
      - S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID:-}
      - S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY:-}
      - S3_ENDPOINT=${S3_ENDPOINT:-}
      - S3_BUCKET=${S3_BUCKET:-}
      - S3_FORCE_PATH_STYLE=${S3_FORCE_PATH_STYLE:-false}
      # ── Signup policy ────────────────────────────────────────
      - SIGNUP_DISABLED=${SIGNUP_DISABLED:-true}
      - SIGNUP_ALLOWED_DOMAINS=${SIGNUP_ALLOWED_DOMAINS:-}
      - SIGNUP_ALLOWED_EMAILS=${SIGNUP_ALLOWED_EMAILS:-}
      # ── Misc ─────────────────────────────────────────────────
      - AGENDASH_AUTH_USER=${AGENDASH_AUTH_USER:-agendash}
      - AGENDASH_AUTH_PASSWORD=${AGENDASH_AUTH_PASSWORD:-}
      - THROTTLE_GLOBAL_TTL=${THROTTLE_GLOBAL_TTL:-60000}
      - THROTTLE_GLOBAL_LIMIT=${THROTTLE_GLOBAL_LIMIT:-2000}
      - THROTTLE_AUTH_TTL=${THROTTLE_AUTH_TTL:-60000}
      - THROTTLE_AUTH_LIMIT=${THROTTLE_AUTH_LIMIT:-200}
      - BILLING_ENABLED=false
      # Branding — passed from tenant .env at provision time
      - REACT_APP_STOCKIX_API_URL=${REACT_APP_STOCKIX_API_URL:-}
      - REACT_APP_STOCKIX_TENANT_ID=${REACT_APP_STOCKIX_TENANT_ID:-}
      - REACT_APP_STOCKIX_DISCOVERY_SLUG=${REACT_APP_STOCKIX_DISCOVERY_SLUG:-}
      - REACT_APP_STOCKIX_APP_NAME=${REACT_APP_STOCKIX_APP_NAME:-}
      - REACT_APP_STOCKIX_LOGO_URL=${REACT_APP_STOCKIX_LOGO_URL:-}
      - REACT_APP_STOCKIX_PRIMARY_COLOR=${REACT_APP_STOCKIX_PRIMARY_COLOR:-}
      # ── Gotenberg PDF renderer (shared instance on stockix-shared network) ──
      - GOTENBERG_URL=${GOTENBERG_URL}
      # GOTENBERG_DOCS_URL is the base URL that Gotenberg fetches HTML assets FROM
      # (i.e., the Finance server's own /public/ endpoint, not Gotenberg's URL).
      - GOTENBERG_DOCS_URL=${GOTENBERG_DOCS_URL}
    ports:
      # Bind on all interfaces so the infra-worker container can reach this via host.docker.internal.
      - "0.0.0.0:${PUBLIC_PROXY_PORT}:3000"
    depends_on:
      database_migration:
        condition: service_completed_successfully
    networks:
      - stockix-shared
      - stockix_public

  database_migration:
    image: stockix-database-migration:local
    environment:
      - DB_CLIENT=mysql
      - DB_HOST=${DB_HOST:-stockix-mysql-proxy}
      - DB_PORT=${DB_PORT:-6033}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_CHARSET=${DB_CHARSET:-utf8mb4}
      - DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
      - SYSTEM_DB_CLIENT=mysql
      - SYSTEM_DB_HOST=${SYSTEM_DB_HOST:-${DB_HOST:-stockix-mysql-proxy}}
      - SYSTEM_DB_PORT=${SYSTEM_DB_PORT:-${DB_PORT:-6033}}
      - SYSTEM_DB_USER=${SYSTEM_DB_USER:-${DB_USER}}
      - SYSTEM_DB_PASSWORD=${SYSTEM_DB_PASSWORD:-${DB_PASSWORD}}
      - SYSTEM_DB_NAME=${SYSTEM_DB_NAME}
    restart: "no"
    networks:
      - stockix-shared
    mem_limit: 256m
    cpus: "0.25"
    mem_swappiness: 0

# No local volumes — all data lives in stockix-mysql and stockix-mongo.
volumes: {}

networks:
  # Shared infra network — external, managed by infra/shared/docker-compose.yml
  stockix-shared:
    name: stockix-shared
    external: true
  # Traefik public network — external, managed by infra/prod/docker-compose.yml
  stockix_public:
    name: stockix_public
    external: true

```

## ./infra/pos-tenant-stack/docker-compose.yml
```
# Per-tenant POS stack (provisioned when tenant modules includes "pos").
# Build: pnpm pos:images:build  (from repo root; sets STOCKIX_REPO_ROOT + POS_APP_ROOT)
#
# BEFORE (old): pos-backend + pos-frontend + pos-platform-worker + pos-bigcapital-worker
#               + pos-mongo + pos-redis + pos-mongo-init = 7 containers per POS tenant.
# AFTER  (new): pos-backend + pos-frontend + pos-platform-worker + pos-bigcapital-worker
#               = 4 containers per POS tenant.
#
# MongoDB → stockix-mongo:27017  DB: {slug}_pos   (key: MONGODB_URI in tenant .env)
# Redis   → stockix-redis:6379   key prefix: tenant:{slug}:queue:*
#
# Shared Mongo (stockix-mongo) lives in infra/shared compose — cross-project
# depends_on is not supported here. Readiness is enforced by worker preflight
# ensureSharedMongoReplicaSetReady() (rs-init + PRIMARY) before POS compose up.

services:
  pos-backend:
    image: stockix-pos-backend:local
    build:
      context: ${STOCKIX_REPO_ROOT}
      dockerfile: apps/pos-backend/Dockerfile
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8010/health || exit 1"]
      interval: 20s
      timeout: 5s
      retries: 3
      start_period: 30s
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - NODE_ENV=production
      - PORT=${POS_PORT:-8010}
      # Points to stockix-mongo, tenant-scoped DB name
      - MONGODB_URI=${MONGODB_URI}
      # Points to stockix-redis with key prefix
      - REDIS_URL=${REDIS_URL}
      - REDIS_KEY_PREFIX=${REDIS_KEY_PREFIX}
      - AUTH_TOKEN_SECRET=${AUTH_TOKEN_SECRET}
      - JWT_SECRET=${JWT_SECRET}
      - PLATFORM_JWT_SECRET=${PLATFORM_JWT_SECRET}
      - LICENSE_SIGNING_SECRET=${LICENSE_SIGNING_SECRET}
      - FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY:-}
      - POS_PLATFORM_API_KEY=${POS_PLATFORM_API_KEY}
      - TENANT_ID=${TENANT_ID}
      - POS_BACKEND_URL=${POS_BACKEND_URL}
      - POS_FRONTEND_URL=${POS_FRONTEND_URL}
      - PUBLIC_APP_URL=${POS_FRONTEND_URL}
      - ROOT_DOMAIN=${ROOT_DOMAIN:-localhost}
      - CORS_ORIGINS=${CORS_ORIGINS:-}
      - FINANCE_INTERNAL_BASE_URL=${FINANCE_INTERNAL_BASE_URL:-}
      - RESEND_API_KEY=${RESEND_API_KEY:-}
      - RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL:-}

    ports:
      - "127.0.0.1:${POS_HOST_PORT:-8010}:8010"
    networks:
      - stockix-shared
      - stockix_public
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    oom_kill_disable: false

  pos-platform-worker:
    image: stockix-pos-backend:local
    restart: unless-stopped
    command: tsx workers/platformWorker.js
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=${REDIS_URL}
      - REDIS_KEY_PREFIX=${REDIS_KEY_PREFIX}
      - AUTH_TOKEN_SECRET=${AUTH_TOKEN_SECRET}
      - JWT_SECRET=${JWT_SECRET}
      - PLATFORM_JWT_SECRET=${PLATFORM_JWT_SECRET}
      - LICENSE_SIGNING_SECRET=${LICENSE_SIGNING_SECRET}
      - FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY:-}
      - POS_PLATFORM_API_KEY=${POS_PLATFORM_API_KEY}
      - TENANT_ID=${TENANT_ID}
      - FINANCE_INTERNAL_BASE_URL=${FINANCE_INTERNAL_BASE_URL:-}
      - RESEND_API_KEY=${RESEND_API_KEY:-}
      - RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL:-}
      - PUBLIC_APP_URL=${POS_FRONTEND_URL}
      - TENANT_APP_ORIGIN=${POS_FRONTEND_URL}
    depends_on:
      pos-backend:
        condition: service_healthy
    networks:
      - stockix-shared
    mem_limit: 256m
    cpus: "0.25"
    mem_swappiness: 0
    oom_kill_disable: false
    healthcheck:
      test: ["CMD-SHELL", "pgrep -f 'node workers/platformWorker.js' > /dev/null && node -e \"const u=process.env.REDIS_URL;if(!u)process.exit(1);import('ioredis').then(({default:R})=>{const c=new R(u,{maxRetriesPerRequest:1,lazyConnect:true});return c.connect().then(()=>c.ping()).then((p)=>{c.disconnect();process.exit(p==='PONG'?0:1)}).catch(()=>process.exit(1))})\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  pos-bigcapital-worker:
    image: stockix-pos-backend:local
    restart: unless-stopped
    command: tsx workers/bigcapitalSyncWorker.js
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=${REDIS_URL}
      - REDIS_KEY_PREFIX=${REDIS_KEY_PREFIX}
      - AUTH_TOKEN_SECRET=${AUTH_TOKEN_SECRET}
      - JWT_SECRET=${JWT_SECRET}
      - PLATFORM_JWT_SECRET=${PLATFORM_JWT_SECRET}
      - LICENSE_SIGNING_SECRET=${LICENSE_SIGNING_SECRET}
      - FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY:-}
      - POS_PLATFORM_API_KEY=${POS_PLATFORM_API_KEY}
      - TENANT_ID=${TENANT_ID}
      - FINANCE_INTERNAL_BASE_URL=${FINANCE_INTERNAL_BASE_URL:-}
    depends_on:
      pos-backend:
        condition: service_healthy
    networks:
      - stockix-shared
    mem_limit: 256m
    cpus: "0.25"
    mem_swappiness: 0
    oom_kill_disable: false
    healthcheck:
      test: ["CMD-SHELL", "pgrep -f 'node workers/bigcapitalSyncWorker.js' > /dev/null && node -e \"const u=process.env.REDIS_URL;if(!u)process.exit(1);import('ioredis').then(({default:R})=>{const c=new R(u,{maxRetriesPerRequest:1,lazyConnect:true});return c.connect().then(()=>c.ping()).then((p)=>{c.disconnect();process.exit(p==='PONG'?0:1)}).catch(()=>process.exit(1))})\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  pos-frontend:
    image: stockix-pos-frontend:local
    build:
      context: ${STOCKIX_REPO_ROOT}
      dockerfile: apps/pos-frontend2/Dockerfile
      args:
        NEXT_PUBLIC_POS_API_ORIGIN: ${POS_BACKEND_URL:-http://localhost:8010}
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 45s
    environment:
      - NEXT_PUBLIC_POS_API_ORIGIN=${POS_BACKEND_URL:-http://localhost:8010}
    ports:
      - "127.0.0.1:${POS_FRONTEND_HOST_PORT:-3001}:3000"
    networks:
      - stockix_public
    mem_limit: 256m
    cpus: "0.25"
    mem_swappiness: 0
    oom_kill_disable: false

# No local volumes — all data lives in stockix-mongo and stockix-redis.
volumes: {}

networks:
  stockix-shared:
    name: stockix-shared
    external: true
  stockix_public:
    name: stockix_public
    external: true

```

## ./infra/pms-tenant-stack/docker-compose.yml
```
services:
  pms-frontend:
    image: stockix-pms-frontend:local
    build:
      context: ${PMS_APP_ROOT}/frontend
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_PMS_API_URL=http://pms-api:3003
    ports:
      - "127.0.0.1:${PMS_FRONTEND_HOST_PORT:-3004}:3000"
    depends_on:
      pms-api:
        condition: service_healthy
    networks:
      - stockix_public
      - pms_internal
    mem_limit: 256m
    cpus: "0.25"
    mem_swappiness: 0
    oom_kill_disable: false

  pms-api:
    image: stockix-pms:local
    build:
      context: ${PMS_APP_ROOT}
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3003/health || exit 1"]
      interval: 20s
      timeout: 5s
      retries: 3
      start_period: 15s
    environment:
      - NODE_ENV=production
      - PMS_PORT=3003
      - DATABASE_URL=${DATABASE_URL}
      - AUTH_TOKEN_SECRET=${AUTH_TOKEN_SECRET}
      - PLATFORM_API_SECRET=${PLATFORM_API_SECRET}
      - TENANT_ID=${TENANT_ID}
    ports:
      - "127.0.0.1:${PMS_HOST_PORT:-3003}:3003"
    networks:
      - pms_internal
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    oom_kill_disable: false

volumes: {}

networks:
  # Traefik public network — external, managed by infra/prod/docker-compose.yml
  stockix_public:
    name: stockix_public
    external: true
  # Internal network scoped to this PMS tenant stack only
  pms_internal:
    driver: bridge
```

## ./infra/staging/docker-compose.yml
```
# ═══════════════════════════════════════════════════════
# STAGING ENVIRONMENT — NOT PRODUCTION
# Purpose: test deployments before production
# Data: reset regularly — no real customer data
# Subdomains: staging-api.* / staging.*
# ═══════════════════════════════════════════════════════

name: stockix-staging

include:
  - path: ../prod/docker-compose.yml

# Staging overrides: single API replica, reduced limits applied via deploy section
# where supported. Primary differences are in infra/staging/.env (domains, B2 prefix).

```

## ./infra/dev/docker-compose.yml
```
# Local Stockix control-plane database + shared Redis for POS dev.
# Compose v2: `docker compose -f infra/dev/docker-compose.yml up -d`
services:
  redis:
    image: redis:7-alpine
    mem_limit: 128m
    cpus: "0.25"
    mem_swappiness: 0
    oom_kill_disable: false
    ports:
      - "63790:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 5s
      retries: 10

  postgres:
    image: postgres:16-alpine
    mem_limit: 512m
    cpus: "0.5"
    mem_swappiness: 0
    oom_kill_disable: false
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: stockix_platform
    ports:
      # Host 5432 is often taken by a local Postgres install. Default 54330; on Windows Hyper-V
      # may reserve 54247–54346 — set POSTGRES_HOST_PORT=15432 in .env if bind fails.
      - "${POSTGRES_HOST_PORT:-54330}:5432"
    volumes:
      - stockix_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d stockix_platform"]
      interval: 3s
      timeout: 5s
      retries: 10

volumes:
  stockix_pg_data:

```

## ./services/chatlive/docker-compose.production.yaml
```
version: '3'

services:
  base: &base
    image: chatwoot/chatwoot:latest
    env_file: .env ## Change this file for customized env variables
    volumes:
      - storage_data:/app/storage

  rails:
    <<: *base
    depends_on:
      - postgres
      - redis
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      - NODE_ENV=production
      - RAILS_ENV=production
      - INSTALLATION_ENV=docker
    entrypoint: docker/entrypoints/rails.sh
    command: ['bundle', 'exec', 'rails', 's', '-p', '3000', '-b', '0.0.0.0']
    restart: always

  sidekiq:
    <<: *base
    depends_on:
      - postgres
      - redis
    environment:
      - NODE_ENV=production
      - RAILS_ENV=production
      - INSTALLATION_ENV=docker
    command: ['bundle', 'exec', 'sidekiq', '-C', 'config/sidekiq.yml']
    restart: always

  postgres:
    image: pgvector/pgvector:pg16
    restart: always
    ports:
      - '127.0.0.1:5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=chatwoot
      - POSTGRES_USER=postgres
      # Please provide your own password.
      - POSTGRES_PASSWORD=

  redis:
    image: redis:alpine
    restart: always
    command: ["sh", "-c", "redis-server --requirepass \"$REDIS_PASSWORD\""]
    env_file: .env
    volumes:
      - redis_data:/data
    ports:
      - '127.0.0.1:6379:6379'

volumes:
  storage_data:
  postgres_data:
  redis_data:

```

## ./services/stockix-finance/docker-compose.yml
```
# WARNING!
# This is a development version of THE Bigcapital docker-compose.yml file.
# Avoid using this file in your production environment.
# We're exposing here sensitive ports and mounting code volumes for rapid development and debugging of the server stack.

services:
  mariadb:
    build:
      context: ./docker/mariadb
    environment:
      - MYSQL_DATABASE=${SYSTEM_DB_NAME}
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASSWORD}
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
    volumes:
      - mysql:/var/lib/mysql
    expose:
      - '3306'
    ports:
      - '3306:3306'
    deploy:
      restart_policy:
        condition: unless-stopped

  redis:
    build:
      context: ./docker/redis
    expose:
      - '6379'
    ports:
      - '6379:6379'
    volumes:
      - redis:/data
    deploy:
      restart_policy:
        condition: unless-stopped

  gotenberg:
    image: gotenberg/gotenberg:7
    ports:
      # Override with GOTENBERG_HOST_PORT=9001 if 9000 is already in use locally.
      - '${GOTENBERG_HOST_PORT:-9000}:3000'

# Volumes
volumes:
  mysql:
    # Override with MYSQL_VOLUME_NAME in .env to isolate dev stacks from other Compose projects.
    name: ${MYSQL_VOLUME_NAME:-stockix_dev_mysql}
    driver: local

  redis:
    name: stockix_dev_redis
    driver: local

```
