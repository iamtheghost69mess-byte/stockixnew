# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=3072

COPY . .

RUN --mount=type=cache,id=pnpm-store-dashboard,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter dashboard...

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

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/dashboard/.next/standalone ./
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /app/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
