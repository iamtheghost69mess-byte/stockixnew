FROM node:20-bookworm-slim AS build

USER root

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml lerna.json .npmrc ./
COPY packages/webapp/package.json ./packages/webapp/
COPY shared/bigcapital-utils/package.json ./shared/bigcapital-utils/
COPY shared/email-components/package.json ./shared/email-components/
COPY shared/pdf-templates/package.json ./shared/pdf-templates/
COPY shared/sdk-ts/package.json ./shared/sdk-ts/

# Pin pnpm to satisfy root package.json "pnpm": "^9.0.5" (Corepack activates this exact minor).
RUN corepack enable \
  && corepack prepare pnpm@9.15.9 --activate \
  && pnpm --version \
  && pnpm install --no-frozen-lockfile --filter @stockix/webapp...

COPY ./lerna.json /app/lerna.json
COPY ./packages/webapp /app/packages/webapp
COPY ./shared /app/shared
RUN pnpm --filter @stockix/utils run build \
  && pnpm --filter @stockix/webapp run build

FROM nginx:1.27-alpine

COPY ./packages/webapp/nginx/sites/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/webapp/dist /usr/share/nginx/html
