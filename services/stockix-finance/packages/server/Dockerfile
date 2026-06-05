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
# Alpine has /bin/sh (ash), not bash — node entrypoint prepends `node` when the CMD binary is missing.
CMD ["/bin/sh", "-c", "until (node ./build/commands.js system:migrate:unlock 2>/dev/null; node ./build/commands.js system:migrate:latest); do echo 'Waiting for database to be ready...'; sleep 5; done"]

# -----------------------------------------------------------------------------
# Full API server image: resources + app + CLI bundles.
# -----------------------------------------------------------------------------
FROM deps AS build-app
COPY --chown=node:node ./packages/server ./packages/server
RUN pnpm run build:server --skip-nx-cache \
  && mkdir -p packages/i18n \
  && cp -r packages/server/src/i18n/. packages/i18n/

FROM build-app AS app
CMD [ "node", "./packages/server/build/index.js" ]
