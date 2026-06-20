#!/usr/bin/env bash
set -euo pipefail

# Usage: ./deploy.sh <env_name> <release_sha>
# Example: ./deploy.sh staging abc1234567890

ENV_NAME="${1:-}"
RELEASE_SHA="${2:-}"

if [ -z "$ENV_NAME" ] || [ -z "$RELEASE_SHA" ]; then
  echo "Usage: $0 <env_name> <release_sha>"
  exit 1
fi

echo "Deploying $RELEASE_SHA to $ENV_NAME environment..."

# Check repository root
if [ -d /opt/stockix/stockixnew/.git ]; then
  cd /opt/stockix/stockixnew
elif [ -d /opt/stockix/app/.git ]; then
  cd /opt/stockix/app
else
  echo "Error: Repository not found at /opt/stockix/stockixnew or /opt/stockix/app"
  exit 1
fi

REPO_ROOT="$(pwd)"
GHCR_PREFIX="ghcr.io/iamtheghost69mess-byte/stockix" # Adjust depending on repo name

# Fetch latest changes for migrations/scripts
git fetch origin main
git checkout main
git reset --hard "origin/main"

# Export Environment Variables
if [ ! -x scripts/load-env-file.sh ]; then
  chmod +x scripts/load-env-file.sh
fi

. scripts/load-env-file.sh "infra/${ENV_NAME}/.env"

# Run Migrations Before Deploy
echo "Running database migrations..."
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT:-54330}/${POSTGRES_DB:-stockix_platform}"
corepack enable && corepack prepare pnpm@9.15.9 --activate

NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts --filter @repo/db...
pnpm --filter @repo/db db:migrate

# Pull new images from GHCR
echo "Pulling images for $RELEASE_SHA..."
pull_with_retry() {
  local img="$1" n=0
  until docker pull "$img"; do
    n=$((n+1))
    [ "$n" -ge 3 ] && { echo "Failed to pull $img after 3 attempts"; return 1; }
    echo "Pull failed, retry $n/3 — waiting 15s..."; sleep 15
  done
}

pull_with_retry "${GHCR_PREFIX}-api:${RELEASE_SHA}"
pull_with_retry "${GHCR_PREFIX}-dashboard:${RELEASE_SHA}"
pull_with_retry "${GHCR_PREFIX}-infra-worker:${RELEASE_SHA}"

# Retag to latest so docker-compose finds them
docker tag "${GHCR_PREFIX}-api:${RELEASE_SHA}" stockix-api:latest
docker tag "${GHCR_PREFIX}-dashboard:${RELEASE_SHA}" stockix-dashboard:latest
docker tag "${GHCR_PREFIX}-infra-worker:${RELEASE_SHA}" stockix-infra-worker:latest

# Restart Containers using docker compose
echo "Starting containers..."
cd "infra/${ENV_NAME}"
export COMPOSE_FILE=docker-compose.yml

docker compose --env-file .env pull traefik socket-proxy
docker compose --env-file .env up -d --no-build --wait --wait-timeout 300 \
  traefik postgres control-plane-redis socket-proxy api api-bullmq dashboard infra-worker db-backup

echo "Verifying health..."
sleep 10
curl --fail --silent --show-error --max-time 30 --retry 6 --retry-delay 5 --retry-all-errors \
  "${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN}/health" >/dev/null

echo "Deployment successful."
