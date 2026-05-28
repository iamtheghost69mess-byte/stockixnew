# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN apk add --no-cache docker-cli docker-cli-compose \
    && apk upgrade --no-cache \
    && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile --filter api...
# Bundle is produced on the host before compose (pnpm infra:worker:build). Re-running
# tsup inside the image often OOMs on small VPS hosts when many services build in parallel.
RUN test -f infra/worker-service/.runtime/worker.js \
  || (echo "Missing infra/worker-service/.runtime/worker.js — run: pnpm infra:worker:build" && exit 1)

FROM node:22-alpine AS worker
# Patch Alpine OS packages; drop bundled npm (build uses pnpm via corepack in the build stage only).
RUN apk add --no-cache docker-cli docker-cli-compose \
    && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app .

EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "infra/worker-service/.runtime/worker.js"]
