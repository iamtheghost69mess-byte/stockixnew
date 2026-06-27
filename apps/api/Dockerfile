# syntax=docker/dockerfile:1
ARG BASE_IMAGE=ghcr.io/iamtheghost69mess-byte/stockix/stockix-base:node22
FROM ${BASE_IMAGE} AS build
RUN apk add --no-cache libc6-compat
ENV NODE_OPTIONS=--max-old-space-size=3072

# ── Phase 1: manifests only — install cache survives source changes ──
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json                            ./apps/api/
COPY packages/auth/package.json                       ./packages/auth/
COPY packages/config/package.json                     ./packages/config/
COPY packages/db/package.json                         ./packages/db/
COPY packages/events/package.json                     ./packages/events/
COPY packages/shared/package.json                     ./packages/shared/
COPY packages/typescript-config/package.json          ./packages/typescript-config/
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

FROM ${BASE_IMAGE} AS runner

ENV NODE_ENV=production
WORKDIR /app

USER root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=build --chown=nodejs:nodejs /deploy /app

USER nodejs

EXPOSE 4000
CMD ["node", "dist/index.js"]
