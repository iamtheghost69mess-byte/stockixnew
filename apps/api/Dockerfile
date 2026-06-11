# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat \
  && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=3072

# ── Phase 1: manifests only — install cache survives source changes ──
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json                            ./apps/api/
COPY packages/auth/package.json                       ./packages/auth/
COPY packages/config/package.json                     ./packages/config/
COPY packages/db/package.json                         ./packages/db/
COPY packages/shared/package.json                     ./packages/shared/
COPY packages/platform-worker-shared/package.json     ./packages/platform-worker-shared/
COPY packages/eslint-config/package.json              ./packages/eslint-config/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter api...

# ── Phase 2: source — only busts install layer when manifests change ──
COPY . .

# @repo/auth ships dist/; other @repo/* are bundled from TypeScript source via tsup.
RUN pnpm --filter @repo/auth build
RUN pnpm --filter api build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm deploy --filter api --prod /deploy

FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy /app

EXPOSE 4000
CMD ["node", "dist/index.js"]
