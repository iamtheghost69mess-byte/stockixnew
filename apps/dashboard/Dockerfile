# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=3072
ENV NEXT_TELEMETRY_DISABLED=1

# ── Phase 1: manifests only — install cache survives source changes ──
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/dashboard/package.json              ./apps/dashboard/
COPY packages/config/package.json             ./packages/config/
COPY packages/shared/package.json             ./packages/shared/
COPY packages/ui/package.json                 ./packages/ui/
COPY packages/eslint-config/package.json      ./packages/eslint-config/
COPY packages/typescript-config/package.json  ./packages/typescript-config/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter dashboard...

# ── Phase 2: source — only copies dashboard-relevant packages so that
# changes to scripts/, infra/, apps/api/, etc. don't bust this layer.
COPY apps/dashboard/              ./apps/dashboard/
COPY packages/config/             ./packages/config/
COPY packages/shared/             ./packages/shared/
COPY packages/ui/                 ./packages/ui/
COPY packages/eslint-config/      ./packages/eslint-config/
COPY packages/typescript-config/  ./packages/typescript-config/

ARG NEXT_PUBLIC_STOCKIX_API_URL=https://api.stockix.cloud
ENV NEXT_PUBLIC_STOCKIX_API_URL=${NEXT_PUBLIC_STOCKIX_API_URL}

ARG NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=stockix.cloud
ENV NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=${NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN}

ARG NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=https
ENV NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=${NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME}

ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}

RUN pnpm --filter dashboard build
RUN test -f apps/dashboard/.next/standalone/apps/dashboard/server.js

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/dashboard/.next/standalone ./
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /app/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
