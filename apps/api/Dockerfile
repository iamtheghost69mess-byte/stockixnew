# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
RUN apk add --no-cache libc6-compat \
  && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=3072

COPY . .

RUN pnpm install --frozen-lockfile --filter api...
# @repo/* packages export ./dist/* — must be compiled before API tsup bundles them.
RUN pnpm --filter @repo/auth build \
  && pnpm --filter @repo/config build \
  && pnpm --filter @repo/db build \
  && pnpm --filter @repo/shared build
# Prefer host-built dist from deploy (see .dockerignore); rebuild only if missing from context.
RUN if [ -f apps/api/dist/index.js ]; then \
      echo "Using API dist from deploy host build"; \
    else \
      pnpm --filter api build; \
    fi
RUN pnpm deploy --filter api --prod /deploy

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy /app

EXPOSE 4000
CMD ["node", "dist/index.js"]
