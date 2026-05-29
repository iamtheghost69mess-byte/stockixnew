# Build context: Stockix repo root (STOCKIX_REPO_ROOT).

# Preserves monorepo paths: apps/pos-frontend2 + packages/ui (for @/components/ui/* aliases).

FROM node:22-alpine AS build

RUN apk update && apk upgrade --no-cache



WORKDIR /pos

COPY services/posnew/packages/ui ./packages/ui

COPY services/posnew/apps/pos-frontend2 ./apps/pos-frontend2



WORKDIR /pos/packages/ui

RUN npm install --legacy-peer-deps --no-audit



WORKDIR /pos/apps/pos-frontend2

RUN npm pkg set dependencies.@restaurant-pos/ui=file:../../packages/ui \

    && npm install --legacy-peer-deps --no-audit



ENV NEXT_TELEMETRY_DISABLED=1

ENV NEXT_TURBOPACK_ROOT=/pos

ENV NEXT_PUBLIC_POS_API_ORIGIN=http://localhost:8010

RUN npm run build



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

