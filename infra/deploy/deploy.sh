#!/usr/bin/env bash
set -euo pipefail

# Usage: ./deploy.sh <env_name> <release_sha>
# Example: ./deploy.sh production abc1234567890

ENV_NAME="${1:-}"
RELEASE_SHA="${2:-}"

if [ -z "$ENV_NAME" ] || [ -z "$RELEASE_SHA" ]; then
  echo "Usage: $0 <env_name> <release_sha>"
  exit 1
fi

echo "Deploying $RELEASE_SHA to $ENV_NAME..."

# ── Repository root ────────────────────────────────────────────
if [ -d /opt/stockix/stockixnew/.git ]; then
  cd /opt/stockix/stockixnew
elif [ -d /opt/stockix/app/.git ]; then
  cd /opt/stockix/app
else
  echo "Error: Repository not found at /opt/stockix/stockixnew or /opt/stockix/app"
  exit 1
fi

REPO_ROOT="$(pwd)"
STATE_DIR="/opt/stockix"
STATE_FILE="${STATE_DIR}/.last-deploy-state"
GHCR_PREFIX="ghcr.io/iamtheghost69mess-byte/stockix"

# ── Detect Swarm mode ──────────────────────────────────────────
SWARM_STATE=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo "inactive")
USE_SWARM=false
[[ "$SWARM_STATE" == "active" ]] && USE_SWARM=true
echo "Runtime mode: $( $USE_SWARM && echo 'Docker Swarm (docker stack deploy)' || echo 'Docker Compose' )"

# ── Fetch latest repo changes ──────────────────────────────────
git fetch origin main
git checkout main
git reset --hard "origin/main"

# ── Load env ───────────────────────────────────────────────────
if [ ! -x scripts/load-env-file.sh ]; then
  chmod +x scripts/load-env-file.sh
fi
. scripts/load-env-file.sh "infra/${ENV_NAME}/.env"

# ── Record current state for rollback ─────────────────────────
mkdir -p "$STATE_DIR"
{
  echo "DEPLOY_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "PREV_SHA=${RELEASE_SHA}"

  if $USE_SWARM; then
    # In Swarm mode, get image from service spec
    for svc in api dashboard infra-worker; do
      img=$(docker service inspect --format='{{.Spec.TaskTemplate.ContainerSpec.Image}}' \
        "stockix_${svc}" 2>/dev/null || echo "not-running")
      KEY=$(echo "PREV_IMAGE_STOCKIX_${svc}" | tr '-' '_' | tr '[:lower:]' '[:upper:]')
      echo "${KEY}=${img}"
    done
  else
    # In Compose mode, get image from running container
    for c in stockix-api-1 stockix-dashboard-1 stockix-infra-worker-1; do
      img=$(docker inspect --format='{{.Config.Image}}' "$c" 2>/dev/null || echo "not-running")
      KEY=$(echo "PREV_IMAGE_$(echo "$c" | tr '-' '_' | tr '[:lower:]' '[:upper:]')")
      echo "${KEY}=${img}"
    done
  fi
} > "$STATE_FILE"
echo "State recorded: $STATE_FILE"

# ── Run DB migrations ──────────────────────────────────────────
echo "Running database migrations..."
export DATABASE_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT:-54330}/${POSTGRES_DB:-stockix_platform}"
corepack enable && corepack prepare pnpm@9.15.9 --activate
NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts --filter @repo/db...
pnpm --filter @repo/db db:migrate

# ── Pull images ────────────────────────────────────────────────
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

# Tag with SHA and :latest for compose/stack file resolution
docker tag "${GHCR_PREFIX}-api:${RELEASE_SHA}"           stockix-api:latest
docker tag "${GHCR_PREFIX}-dashboard:${RELEASE_SHA}"     stockix-dashboard:latest
docker tag "${GHCR_PREFIX}-infra-worker:${RELEASE_SHA}"  stockix-infra-worker:latest

# ── Deploy ─────────────────────────────────────────────────────
cd "infra/${ENV_NAME}"

if $USE_SWARM; then
  echo "Deploying via docker stack deploy..."
  # Pull infra images that Swarm downloads from registry (traefik, socket-proxy, etc.)
  docker compose --env-file .env pull traefik socket-proxy >/dev/null 2>&1 || true

  docker stack deploy \
    --compose-file docker-compose.yml \
    --with-registry-auth \
    stockix

  echo "Stack submitted. Waiting 90s for services to converge..."
  sleep 90

  # Show replica status
  docker service ls --format 'table {{.Name}}\t{{.Replicas}}'
else
  echo "Deploying via docker compose..."
  docker compose --env-file .env pull traefik socket-proxy
  docker compose --env-file .env up -d --no-build --wait --wait-timeout 300 \
    traefik postgres control-plane-redis socket-proxy api api-bullmq dashboard infra-worker db-backup
fi

# ── Health check ───────────────────────────────────────────────
echo "Verifying health..."
HEALTH_URL="${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN}/health"
PASSED=false
for i in $(seq 1 12); do
  if curl --fail --silent --max-time 15 "$HEALTH_URL" >/dev/null 2>&1; then
    PASSED=true; break
  fi
  echo "Health check attempt $i/12 — waiting 15s..."
  sleep 15
done

if $PASSED; then
  echo "Deployment successful: $RELEASE_SHA"
else
  echo "Health check failed. To rollback:"
  echo "  bash ${REPO_ROOT}/infra/deploy/rollback.sh"
  exit 1
fi
