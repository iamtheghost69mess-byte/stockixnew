# Build context: Stockix repo root (STOCKIX_REPO_ROOT).
# Requires: pnpm --filter @repo/auth build && packages/auth/dist present.
FROM node:20

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY packages/auth /packages/auth
# @repo/auth is loaded from /packages/auth; install runtime deps there (not under /app/node_modules).
RUN cd /packages/auth && npm install jose@^5.0.0 --omit=dev --legacy-peer-deps --no-audit
COPY services/posnew/packages/domain-access /packages/domain-access
COPY services/posnew/.npmrc ./.npmrc
COPY services/posnew/apps/pos-backend/package.json ./package.json

RUN npm pkg set \
    dependencies.@repo/auth=file:/packages/auth \
    dependencies.@restaurant-pos/domain-access=file:/packages/domain-access \
    && npm install --legacy-peer-deps --no-audit

COPY services/posnew/apps/pos-backend ./

RUN mkdir -p uploads && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=8010
EXPOSE 8010

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]
