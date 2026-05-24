FROM node:20-alpine AS worker
RUN apk add --no-cache docker-cli docker-cli-compose && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

CMD ["pnpm", "exec", "tsx", "infra/worker-service/src/worker.ts"]
