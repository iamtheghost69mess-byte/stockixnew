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

RUN chown node:node /

# Migration / API images do not run Puppeteer in these containers; skipping Chromium
# saves hundreds of MB and avoids install timeouts or Alpine glibc mismatches during `npm install`.
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml lerna.json ./
COPY packages/server/package.json ./packages/server/
COPY shared/bigcapital-utils/package.json ./shared/bigcapital-utils/
COPY shared/email-components/package.json ./shared/email-components/
COPY shared/pdf-templates/package.json ./shared/pdf-templates/
COPY shared/sdk-ts/package.json ./shared/sdk-ts/

# Pin pnpm to satisfy root package.json "pnpm": "^9.0.5" (Corepack activates this exact minor).
RUN corepack enable \
  && corepack prepare pnpm@9.0.5 --activate \
  && pnpm --version \
  && pnpm install --frozen-lockfile --filter @stockix/server...

# -----------------------------------------------------------------------------
# Migration image: Nest CLI build emits dist/cli.js (nest-commander).
# -----------------------------------------------------------------------------
FROM deps AS build-migration
COPY --chown=node:node ./packages/server ./packages/server
COPY --chown=node:node ./shared ./shared
RUN pnpm --filter @stockix/utils run build \
  && pnpm --filter @stockix/pdf-templates run build \
  && pnpm --filter @stockix/email-components run build \
  && pnpm --filter @stockix/server run build

FROM build-migration AS migration
USER root
RUN apk add --no-cache bash git \
  && git clone --depth 1 https://github.com/vishnubob/wait-for-it.git /wait-for-it
WORKDIR /app/packages/server
CMD ["/bin/bash", "/wait-for-it/wait-for-it.sh", "mysql:3306", "--", "node", "./dist/cli.js", "system:migrate:latest"]

# -----------------------------------------------------------------------------
# Full API server image: resources + app + CLI bundles.
# -----------------------------------------------------------------------------
FROM deps AS build-app
COPY --chown=node:node ./packages/server ./packages/server
COPY --chown=node:node ./shared ./shared
RUN pnpm --filter @stockix/utils run build \
  && pnpm --filter @stockix/pdf-templates run build \
  && pnpm --filter @stockix/email-components run build \
  && pnpm --filter @stockix/server run build

FROM build-app AS app
WORKDIR /app/packages/server
CMD [ "node", "dist/main.js" ]
