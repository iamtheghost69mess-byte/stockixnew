FROM node:20-alpine as deps

USER root

ARG MAIL_HOST= \
  MAIL_USERNAME= \
  MAIL_PASSWORD= \
  MAIL_PORT= \
  MAIL_SECURE= \
  MAIL_FROM_NAME= \
  MAIL_FROM_ADDRESS= \
  DB_HOST= \
  DB_USER= \
  DB_PASSWORD= \
  DB_CHARSET= \
  SYSTEM_DB_NAME= \
  SYSTEM_DB_PASSWORD= \
  SYSTEM_DB_USER= \
  SYSTEM_DB_HOST= \
  SYSTEM_DB_CHARSET= \
  TENANT_DB_USER= \
  TENANT_DB_PASSWORD= \
  TENANT_DB_HOST= \
  TENANT_DB_NAME_PERFIX= \
  TENANT_DB_CHARSET= \
  MONGODB_DATABASE_URL= \
  JWT_SECRET= \
  BASE_URL= \
  AGENDASH_AUTH_USER=agendash \
  AGENDASH_AUTH_PASSWORD=123123 \
  SIGNUP_DISABLED= \
  SIGNUP_ALLOWED_DOMAINS= \
  SIGNUP_ALLOWED_EMAILS=

ENV MAIL_HOST=$MAIL_HOST \
  MAIL_USERNAME=$MAIL_USERNAME \
  MAIL_PASSWORD=$MAIL_PASSWORD \
  MAIL_PORT=$MAIL_PORT \
  MAIL_SECURE=$MAIL_SECURE \
  MAIL_FROM_NAME=$MAIL_FROM_NAME \
  MAIL_FROM_ADDRESS=$MAIL_FROM_ADDRESS \
  DB_HOST=$DB_HOST \
  DB_USER=$DB_USER \
  DB_PASSWORD=$DB_PASSWORD \
  DB_CHARSET=$DB_CHARSET \
  SYSTEM_DB_HOST=$SYSTEM_DB_HOST \
  SYSTEM_DB_USER=$SYSTEM_DB_USER \
  SYSTEM_DB_PASSWORD=$SYSTEM_DB_PASSWORD \
  SYSTEM_DB_NAME=$SYSTEM_DB_NAME \
  SYSTEM_DB_CHARSET=$SYSTEM_DB_CHARSET \
  TENANT_DB_NAME_PERFIX=$TENANT_DB_NAME_PERFIX \
  TENANT_DB_HOST=$TENANT_DB_HOST \
  TENANT_DB_PASSWORD=$TENANT_DB_PASSWORD \
  TENANT_DB_USER=$TENANT_DB_USER \
  TENANT_DB_CHARSET=$TENANT_DB_CHARSET \
  JWT_SECRET=$JWT_SECRET \
  AGENDASH_AUTH_USER=$AGENDASH_AUTH_USER \
  AGENDASH_AUTH_PASSWORD=$AGENDASH_AUTH_PASSWORD \
  MONGODB_DATABASE_URL=$MONGODB_DATABASE_URL \
  BASE_URL=$BASE_URL \
  SIGNUP_DISABLED=$SIGNUP_DISABLED \
  SIGNUP_ALLOWED_DOMAINS=$SIGNUP_ALLOWED_DOMAINS \
  SIGNUP_ALLOWED_EMAILS=$SIGNUP_ALLOWED_EMAILS

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
CMD ["/bin/bash", "-c", "until (node ./build/commands.js system:migrate:unlock 2>/dev/null; node ./build/commands.js system:migrate:latest); do echo 'Waiting for database to be ready...'; sleep 5; done"]

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
