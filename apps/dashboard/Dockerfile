# syntax=docker/dockerfile:1
ARG BASE_IMAGE=ghcr.io/iamtheghost69mess-byte/stockix/stockix-base:node22
FROM ${BASE_IMAGE} AS build
ENV NODE_OPTIONS=--max-old-space-size=3072
ENV NEXT_TELEMETRY_DISABLED=1

# ── Phase 1: manifests only — install cache survives source changes ──
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/dashboard/package.json              ./apps/dashboard/
COPY packages/config/package.json             ./packages/config/
COPY packages/shared/package.json             ./packages/shared/
COPY packages/ui/package.json                 ./packages/ui/
COPY packages/ui-core/package.json            ./packages/ui-core/
COPY packages/theme/package.json              ./packages/theme/
COPY packages/eslint-config/package.json      ./packages/eslint-config/
COPY packages/typescript-config/package.json  ./packages/typescript-config/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter dashboard...

# ── Phase 2: source — only busts install layer when manifests change ──
COPY . .

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

FROM ${BASE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=build --chown=nodejs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=build --chown=nodejs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build --chown=nodejs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

USER nodejs

EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
