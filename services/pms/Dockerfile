FROM node:22-alpine AS base
RUN apk add --no-cache dumb-init && apk upgrade --no-cache
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build && pnpm prune --prod

FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init && apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/package.json ./

USER nodejs

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/health || exit 1

EXPOSE 3003
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
