# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config ./packages/eslint-config
COPY apps/api ./apps/api
COPY packages/db ./packages/db

RUN pnpm install --frozen-lockfile
RUN pnpm --filter api build
RUN pnpm deploy --filter api --prod /deploy

FROM node:20-alpine AS runner
RUN apk add --no-cache curl docker-cli \
  && mkdir -p /usr/local/lib/docker/cli-plugins \
  && ARCH="$(uname -m)" \
  && case "$ARCH" in aarch64) DC_ARCH=aarch64 ;; *) DC_ARCH=x86_64 ;; esac \
  && curl -fsSL "https://github.com/docker/compose/releases/download/v2.31.0/docker-compose-linux-${DC_ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose \
  && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy /app

EXPOSE 4000
CMD ["node", "dist/index.js"]
