# Mongoose upgraded to v6 — rebuild required (pnpm docker:prebuild:force) 2026-06-05
# SECURITY: No secrets in this Dockerfile.
# All credentials injected at runtime via --env-file.
# See infra/worker-service/domain/provisioning/tenant-env.ts

FROM node:22-alpine as deps

USER root

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && chown node:node /

ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml lerna.json .npmrc ./
COPY --chown=node:node packages/server/package.json ./packages/server/
COPY --chown=node:node shared ./shared

RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Migration image: only the CLI webpack bundle (`commands.js`).
# -----------------------------------------------------------------------------
FROM deps AS build-migration
COPY --chown=node:node ./packages/server ./packages/server
RUN cd packages/server && pnpm run build:commands

FROM build-migration AS migration
USER root
ADD https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh /wait-for-it.sh
RUN chmod +x /wait-for-it.sh

WORKDIR /app/packages/server
# Native Knex runner — webpack commands.js cannot require migration files from disk at runtime.
# Single run (no retry loop) — worker resets system DB before each migration attempt.
CMD ["node", "./scripts/run-system-migrate.mjs"]

# -----------------------------------------------------------------------------
# Full API server image: resources + app + CLI bundles.
# -----------------------------------------------------------------------------
FROM deps AS build-app
COPY --chown=node:node ./packages/server ./packages/server
RUN pnpm run build:server --skip-nx-cache \
  && mkdir -p packages/i18n \
  && cp -r packages/server/src/i18n/. packages/i18n/ \
  && cd packages/server && node ./scripts/compile-tenant-migrations.mjs

FROM build-app AS app
ENV TS_NODE_PROJECT=/app/packages/server/tsconfig.json
# ts-node at boot needs more heap than Node's default (~256MB) inside 512m cgroup.
ENV NODE_OPTIONS=--max-old-space-size=384
# ts-node: tenant seed files stay .ts and use @/ path aliases at org-build time.
CMD [ "node", "-r", "ts-node/register/transpile-only", "./packages/server/build/index.js" ]
