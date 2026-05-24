# Build context: Stockix repo root (STOCKIX_REPO_ROOT).
FROM node:20-alpine AS build
WORKDIR /app

COPY services/posnew/packages/ui /packages/ui
COPY services/posnew/apps/pos-frontend2/package.json ./package.json

RUN npm pkg set dependencies.@restaurant-pos/ui=file:/packages/ui \
    && npm install --legacy-peer-deps --no-audit

COPY services/posnew/apps/pos-frontend2 ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_POS_API_ORIGIN=http://localhost:8010
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
