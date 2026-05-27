# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile --filter api...
RUN pnpm --filter api build
RUN pnpm deploy --filter api --prod /deploy

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy /app

EXPOSE 4000
CMD ["node", "dist/index.js"]
