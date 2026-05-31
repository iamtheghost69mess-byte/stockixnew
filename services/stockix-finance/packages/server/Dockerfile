FROM node:20-alpine as deps

USER root

ARG MAIL_HOST= \
  MAIL_USERNAME= \
  MAIL_PASSWORD= \
  MAIL_PORT= \
  MAIL_SECURE= \
  MAIL_FROM_NAME= \
  MAIL_FROM_ADDRESS= \
  # Database
  DB_HOST= \
  DB_USER= \
  DB_PASSWORD= \
  DB_CHARSET= \
  # System database.
  SYSTEM_DB_NAME= \
  SYSTEM_DB_PASSWORD= \
  SYSTEM_DB_USER= \
  SYSTEM_DB_HOST= \
  SYSTEM_DB_CHARSET= \
  # Tenant databases.
  TENANT_DB_USER= \
  TENANT_DB_PASSWORD= \
  TENANT_DB_HOST= \
  TENANT_DB_NAME_PERFIX= \
  TENANT_DB_CHARSET= \
  # MongoDB
  MONGODB_DATABASE_URL= \
  # Authentication
  JWT_SECRET= \
  # Application
  BASE_URL= \
  # Agendash
  AGENDASH_AUTH_USER=agendash \
  AGENDASH_AUTH_PASSWORD=123123 \
  # Sign-up restriction
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
  # Database
  DB_HOST=$DB_HOST \
  DB_USER=$DB_USER \
  DB_PASSWORD=$DB_PASSWORD \
  DB_CHARSET=$DB_CHARSET \
  # System database.
  SYSTEM_DB_HOST=$SYSTEM_DB_HOST \
  SYSTEM_DB_USER=$SYSTEM_DB_USER \
  SYSTEM_DB_PASSWORD=$SYSTEM_DB_PASSWORD \
  SYSTEM_DB_NAME=$SYSTEM_DB_NAME \
  SYSTEM_DB_CHARSET=$SYSTEM_DB_CHARSET \
  # Tenant databases.
  TENANT_DB_NAME_PERFIX=$TENANT_DB_NAME_PERFIX \
  TENANT_DB_HOST=$TENANT_DB_HOST \
  TENANT_DB_PASSWORD=$TENANT_DB_PASSWORD \
  TENANT_DB_USER=$TENANT_DB_USER \
  TENANT_DB_CHARSET=$TENANT_DB_CHARSET \
  # Authentication
  JWT_SECRET=$JWT_SECRET \
  # Agendash
  AGENDASH_AUTH_USER=$AGENDASH_AUTH_USER \
  AGENDASH_AUTH_PASSWORD=$AGENDASH_AUTH_PASSWORD \
  # MongoDB
  MONGODB_DATABASE_URL=$MONGODB_DATABASE_URL \
  # Application
  BASE_URL=$BASE_URL \
  # Sign-up restriction
  SIGNUP_DISABLED=$SIGNUP_DISABLED \
  SIGNUP_ALLOWED_DOMAINS=$SIGNUP_ALLOWED_DOMAINS \
  SIGNUP_ALLOWED_EMAILS=$SIGNUP_ALLOWED_EMAILS

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && chown node:node /

# Migration / API images do not run Puppeteer in these containers; skipping Chromium
# saves hundreds of MB and avoids install timeouts or Alpine glibc mismatches during `npm install`.
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY ./package*.json ./
COPY ./packages/server/package*.json ./packages/server/
COPY ./packages/webapp/package*.json ./packages/webapp/
COPY ./packages/shared/package*.json ./packages/shared/
COPY ./shared/pdf-templates/package*.json ./shared/pdf-templates/
COPY ./shared/sdk-ts/package*.json ./shared/sdk-ts/
COPY ./shared/bigcapital-utils/package*.json ./shared/bigcapital-utils/
COPY ./shared/email-components/package*.json ./shared/email-components/
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY ./.npmrc ./.npmrc

COPY ./lerna.json ./lerna.json

RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Migration image: only the CLI webpack bundle (`commands.js`). Skips Gulp/Sass
# and the main app webpack build — those often fail on musl/Alpine or OOM on small VPS.
# -----------------------------------------------------------------------------
FROM deps AS build-migration
COPY --chown=node:node ./packages/server ./packages/server
RUN cd packages/server && pnpm run build:commands

FROM build-migration AS migration
USER root
ADD https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh /wait-for-it.sh
RUN chmod +x /wait-for-it.sh

WORKDIR /app/packages/server
# Use a robust retry loop for the migration to handle DB startup delays
CMD ["/bin/bash", "-c", "until (node ./build/commands.js system:migrate:unlock 2>/dev/null; node ./build/commands.js system:migrate:latest); do echo 'Waiting for database to be ready...'; sleep 5; done"]

# -----------------------------------------------------------------------------
# Full API server image: resources + app + CLI bundles.
# -----------------------------------------------------------------------------
FROM deps AS build-app
COPY --chown=node:node ./packages/server ./packages/server
COPY --chown=node:node ./shared ./shared
RUN pnpm run build:server --skip-nx-cache

FROM build-app AS app
CMD [ "node", "./packages/server/build/index.js" ]
