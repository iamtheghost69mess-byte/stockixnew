# Build context: services/stockix-finance (see scripts/prebuild-tenant-images.mjs).
# packages/shared is synced from monorepo root before docker build.
# Targets: runtime | migration-runtime

FROM node:22-bookworm-slim AS deps

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

FROM node:22-bookworm-slim AS migration-runtime

ENV NODE_ENV=production
WORKDIR /app/packages/server

RUN groupadd --system --gid 1001 stockix && useradd --system --uid 1001 --gid stockix stockix

COPY --from=migration-prod-deps /app/node_modules /app/node_modules
COPY --from=migration-prod-deps /app/packages/server/package.json ./package.json
COPY --from=migration-source /app/packages/server/scripts ./scripts
COPY --from=migration-source /app/packages/server/src/database/system ./src/database/system

USER stockix
CMD ["node", "./scripts/run-system-migrate.mjs"]

# runtime MUST remain the final stage so `docker build` without --target is safe.
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system --gid 1001 stockix && useradd --system --uid 1001 --gid stockix stockix

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