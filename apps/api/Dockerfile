# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
RUN apk add --no-cache libc6-compat \
  && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=3072

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter api...
# @repo/auth ships dist/; other @repo/* are bundled from TypeScript source via tsup.
RUN pnpm --filter @repo/auth build
RUN pnpm --filter api build
RUN pnpm deploy --filter api --prod /deploy

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy /app

EXPOSE 4000
CMD ["node", "dist/index.js"]
