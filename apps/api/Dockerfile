# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
RUN apk add --no-cache libc6-compat \
  && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=3072

COPY . .

RUN pnpm install --frozen-lockfile --filter api...
# Built on the host during deploy (pnpm --filter api build). Re-running tsup here
# often OOMs when compose builds api, dashboard, infra-worker, and chatwoot in parallel.
RUN test -f apps/api/dist/index.js \
  || (echo "Missing apps/api/dist/index.js — run: pnpm --filter api build" && exit 1)
RUN pnpm deploy --filter api --prod /deploy

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy /app

EXPOSE 4000
CMD ["node", "dist/index.js"]
