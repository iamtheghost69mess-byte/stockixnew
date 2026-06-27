# Build context: Stockix repo root (STOCKIX_REPO_ROOT).
# Uses pnpm (same as pos-backend) — it understands workspace: protocol natively.

FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ && apk upgrade --no-cache

WORKDIR /pos

# Workspace manifests first — isolated layer for install caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ui-core/package.json ./packages/ui-core/package.json
COPY packages/ui-shared/package.json ./packages/ui-shared/package.json
COPY apps/pos-frontend2/package.json ./apps/pos-frontend2/package.json
COPY apps/pos-frontend2/patches ./apps/pos-frontend2/patches

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Hoist all packages to root node_modules so webpack can resolve ui-core/ui-shared
# devDeps (lucide-react, sonner, clsx, etc.) from any directory during transpilation.
# ui-core ships TS source; its devDeps are installed via pos-frontend2 but pnpm's
# strict isolation would hide them from packages/ui-core/src/ without hoisting.
RUN echo 'public-hoist-pattern[]=*' > .npmrc

# Install only this app and its workspace deps (pnpm resolves workspace:* natively)
RUN pnpm install --frozen-lockfile --filter ./apps/pos-frontend2

# Copy source after install to avoid busting the install cache on every code change
COPY packages/ui-core ./packages/ui-core
COPY packages/ui-shared ./packages/ui-shared
COPY apps/pos-frontend2 ./apps/pos-frontend2

WORKDIR /pos/apps/pos-frontend2

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_POS_API_ORIGIN=http://localhost:8010
ENV NEXT_PUBLIC_POS_API_ORIGIN=${NEXT_PUBLIC_POS_API_ORIGIN}

RUN pnpm run build

FROM node:22-alpine AS runner

RUN apk update && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /pos/apps/pos-frontend2/.next/standalone ./
COPY --from=build /pos/apps/pos-frontend2/.next/static ./apps/pos-frontend2/.next/static
COPY --from=build /pos/apps/pos-frontend2/public ./apps/pos-frontend2/public

EXPOSE 3000

CMD ["node", "apps/pos-frontend2/server.js"]
