#!/usr/bin/env bash
# Checkout a branch on the server, build images locally, run DB migrations,
# and restart app services. Called directly or via branch-poll.sh.
#
# Usage:
#   branch-deploy.sh <branch>
#
# Lock: /var/lock/stockix-deploy.lock  (prevents concurrent runs)
# Log:  /var/log/stockix/deploy.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/infra/prod/.env"
LOCK_FILE="/var/lock/stockix-deploy.lock"
LOG_DIR="/var/log/stockix"
LOG_FILE="${LOG_DIR}/deploy.log"
STATE_FILE="/var/lib/stockix/last-deployed-sha"

# ── Helpers ───────────────────────────────────────────────────────────────────

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] [$1] $2"
  printf '%s\n' "${line}"
  printf '%s\n' "${line}" >> "${LOG_FILE}"
}

snap_image() { docker image inspect "$1" --format '{{.Id}}' 2>/dev/null || true; }

# ── Args ──────────────────────────────────────────────────────────────────────

BRANCH="${1:?Usage: branch-deploy.sh <branch>}"

# ── Init ──────────────────────────────────────────────────────────────────────

mkdir -p "${LOG_DIR}" /var/lib/stockix
log INFO "=== Deploy start: ${BRANCH} ==="

# ── Env file guard ────────────────────────────────────────────────────────────

if [ ! -f "${ENV_FILE}" ]; then
  log ERROR "Missing env file: ${ENV_FILE}"
  exit 1
fi

# ── Lock: prevents concurrent deploys ─────────────────────────────────────────

exec 9>"${LOCK_FILE}"
flock -n 9 || { log WARN "Another deploy is running — aborting."; exit 0; }

# ── Load env ──────────────────────────────────────────────────────────────────

[ -x "${SCRIPT_DIR}/load-env-file.sh" ] || chmod +x "${SCRIPT_DIR}/load-env-file.sh"
# shellcheck disable=SC1091
. "${SCRIPT_DIR}/load-env-file.sh" "${ENV_FILE}"

# Prefer postgres container IP over host port — works even when the container is
# on an internal-only network (internal:true blocks host port publishing).
_pg_ip="$(docker inspect stockix-postgres-1 \
  --format '{{(index .NetworkSettings.Networks "stockix_internal").IPAddress}}' 2>/dev/null || true)"
_pg_host="${_pg_ip:-127.0.0.1}"
_pg_port="${_pg_ip:+5432}"
_pg_port="${_pg_port:-${POSTGRES_HOST_PORT:-54330}}"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${_pg_host}:${_pg_port}/${POSTGRES_DB:-stockix_platform}"

# ── Snapshot current images for rollback ──────────────────────────────────────

PREV_API="$(snap_image stockix-api:latest)"
PREV_DASH="$(snap_image stockix-dashboard:latest)"
PREV_WORKER="$(snap_image stockix-infra-worker:latest)"
IMAGES_BUILT=0  # set to 1 only after all three builds complete

# ── Rollback handler ──────────────────────────────────────────────────────────

rollback() {
  trap - ERR  # prevent re-entrancy if a command inside this function fails
  log ERROR "Deploy failed — rolling back."
  # Only restart services if we already replaced images — pre-build failures
  # (git, pnpm, migrations) leave running containers untouched, so restarting
  # them would cause unnecessary downtime.
  if [ "${IMAGES_BUILT}" -eq 1 ]; then
    cd "${REPO_ROOT}/infra/prod"
    docker compose --env-file .env logs --no-log-prefix --no-follow --tail=50 2>/dev/null || true
    local did=0
    [ -n "${PREV_API}"    ] && { docker tag "${PREV_API}"    stockix-api:latest          2>/dev/null || true; did=1; }
    [ -n "${PREV_DASH}"   ] && { docker tag "${PREV_DASH}"   stockix-dashboard:latest    2>/dev/null || true; did=1; }
    [ -n "${PREV_WORKER}" ] && { docker tag "${PREV_WORKER}" stockix-infra-worker:latest 2>/dev/null || true; did=1; }
    if [ "${did}" -eq 1 ]; then
      docker compose --env-file .env up -d --no-build api api-bullmq dashboard infra-worker || true
      log INFO "Rolled back to previous images."
    fi
  else
    log WARN "Failure before image build — running services untouched."
  fi
  exit 1
}

trap rollback ERR

# ── Git: fetch and checkout ───────────────────────────────────────────────────

cd "${REPO_ROOT}"

fetch_origin() {
  git fetch --prune --force origin && return 0
  git remote prune origin || true
  git for-each-ref --format='%(refname)' refs/remotes/origin \
    | while IFS= read -r ref; do git update-ref -d "$ref" || true; done
  git fetch --prune --force origin
}

fetch_origin
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"
SHA="$(git rev-parse HEAD)"
log INFO "At ${BRANCH} @ ${SHA:0:7}"

# ── Dependencies and migrations ───────────────────────────────────────────────

export CI=true PNPM_CONFIG_CONFIRM_MODULES_PURGE=false
corepack enable && corepack prepare pnpm@9.15.9 --activate
NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts --filter @repo/db...
ALLOW_LOCKED_MIGRATION=1 pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db exec tsx scripts/verify-schema.ts
log INFO "Migrations applied."

# ── Build images locally ──────────────────────────────────────────────────────

log INFO "Building images..."

docker build \
  -t "stockix-api:${SHA}" -t "stockix-api:latest" \
  -f apps/api/Dockerfile . 2>&1 | tee -a "${LOG_FILE}"

docker build \
  --build-arg "NEXT_PUBLIC_STOCKIX_API_URL=${STOCKIX_API_URL:-}" \
  --build-arg "NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=${ROOT_DOMAIN:-}" \
  --build-arg "NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=${PUBLIC_BASE_URL_SCHEME:-https}" \
  --build-arg "NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN:-}" \
  -t "stockix-dashboard:${SHA}" -t "stockix-dashboard:latest" \
  -f apps/dashboard/Dockerfile . 2>&1 | tee -a "${LOG_FILE}"

docker build \
  -t "stockix-infra-worker:${SHA}" -t "stockix-infra-worker:latest" \
  -f infra/worker-service/Dockerfile . 2>&1 | tee -a "${LOG_FILE}"

IMAGES_BUILT=1
log INFO "Images built @ ${SHA:0:7}"

# ── Ensure external networks exist (managed by infra/shared) ─────────────────

docker network create stockix-shared 2>/dev/null || true

# ── Restart app services ──────────────────────────────────────────────────────

cd "${REPO_ROOT}/infra/prod"
docker compose --env-file .env up -d --no-build --wait --wait-timeout 300 \
  traefik postgres pgbouncer control-plane-redis socket-proxy api api-bullmq dashboard infra-worker db-backup

# ── Health checks ─────────────────────────────────────────────────────────────

curl --fail --silent --show-error --max-time 30 --retry 6 --retry-delay 5 --retry-all-errors \
  "${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN}/health" >/dev/null
log INFO "API healthy."

curl --fail --silent --show-error --max-time 30 --retry 6 --retry-delay 5 --retry-all-errors \
  "${PUBLIC_BASE_URL_SCHEME:-https}://${ROOT_DOMAIN}/" >/dev/null
log INFO "Dashboard healthy."

# ── Tenant images ─────────────────────────────────────────────────────────────

cd "${REPO_ROOT}"
pnpm docker:prebuild || { log ERROR "Tenant prebuild failed — images not updated."; exit 1; }
node scripts/prebuild-tenant-images.mjs --verify || { log ERROR "Tenant image verification failed."; exit 1; }
log INFO "Tenant images verified."

# ── Cleanup ───────────────────────────────────────────────────────────────────

docker image prune -af --filter "until=24h" || true

# ── Record deployed SHA for the poller ───────────────────────────────────────

echo "${SHA}" > "${STATE_FILE}"

trap - ERR
log INFO "=== Deploy complete: ${BRANCH} @ ${SHA:0:7} ==="
