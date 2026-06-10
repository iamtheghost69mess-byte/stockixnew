# Build context: monorepo root (see scripts/prebuild-tenant-images.mjs).
# @repo/shared is copied from packages/shared at repo root.
# Targets: runtime | migration-runtime

FROM node:22-alpine AS deps

USER root

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && chown node:node /

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV NODE_OPTIONS="--max-old-space-size=6144"

COPY services/stockix-finance/package.json services/stockix-finance/pnpm-lock.yaml services/stockix-finance/pnpm-workspace.yaml services/stockix-finance/lerna.json services/stockix-finance/.npmrc ./
COPY services/stockix-finance/packages/server/package.json ./packages/server/
COPY services/stockix-finance/packages/webapp/package.json ./packages/webapp/
COPY packages/shared/package.json ./packages/shared/
COPY services/stockix-finance/shared ./shared

RUN pnpm install --frozen-lockfile

FROM deps AS build-webapp
COPY services/stockix-finance/packages/webapp ./packages/webapp
COPY packages/shared ./packages/shared
RUN pnpm --filter @stockix/utils run build \
  && pnpm --filter @stockix/webapp run build

FROM build-webapp AS build-app
COPY services/stockix-finance/packages/server ./packages/server
COPY packages/shared ./packages/shared
RUN pnpm --filter @stockix/server run build:app:strict \
  && mkdir -p packages/i18n \
  && cp -r packages/server/src/i18n/. packages/i18n/ \
  && cd packages/server && node ./scripts/compile-tenant-migrations.mjs \
  && mkdir -p build/database/tenant \
  && cp -r src/database/tenant/migrations build/database/tenant/ \
  && find build/database/tenant/migrations -name '*.ts' -delete

FROM build-app AS prod-deps
RUN pnpm prune --prod

FROM deps AS migration-source
COPY services/stockix-finance/packages/server/scripts ./packages/server/scripts
COPY services/stockix-finance/packages/server/src/database/system ./packages/server/src/database/system

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

USER stockix
CMD ["node", "./packages/server/build/index.js"]
