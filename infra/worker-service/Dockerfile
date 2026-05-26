FROM node:20-alpine AS worker
RUN apk add --no-cache docker-cli docker-cli-compose wget && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:9090/health || exit 1
CMD ["pnpm", "exec", "tsx", "infra/worker-service/src/worker.ts"]
