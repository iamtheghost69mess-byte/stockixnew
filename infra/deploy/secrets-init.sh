#!/usr/bin/env bash
# ============================================================
# Stockix — Docker Swarm secrets bootstrap
#
# Reads secrets from infra/prod/.env and creates Docker Swarm secrets.
# Safe to re-run: existing secrets are skipped (never overwritten).
#
# PREREQUISITES:
#   - Docker Swarm must be initialized (run swarm-init.sh first)
#   - Root / sudo on the production server
#   - infra/prod/.env must be populated with real values
#
# Usage:
#   sudo bash infra/deploy/secrets-init.sh
#   sudo bash infra/deploy/secrets-init.sh --dry-run    (shows what would be created)
#
# After running:
#   1. Deploy the stack with the Swarm-secrets-enabled compose overlay:
#        docker stack deploy -c infra/prod/docker-compose.yml \
#          -c infra/prod/docker-compose.secrets.yml stockix
#   2. Verify secrets are mounted in containers:
#        docker exec $(docker ps -q -f name=stockix_api) ls /run/secrets/
# ============================================================

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/stockix/stockixnew}"
PROD_ENV="${REPO_ROOT}/infra/prod/.env"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { printf "${GREEN}[CREATE]${NC} %s\n" "$*"; }
skip()  { printf "${YELLOW}[EXISTS]${NC} %s — skipping (never overwrite existing secrets)\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*"; }
die()   { error "$1"; exit 1; }

# ── The 10 secrets to migrate ────────────────────────────────
# Format: docker_secret_name=ENV_VAR_NAME
declare -A SECRETS=(
  [postgres_password]="POSTGRES_PASSWORD"
  [session_secret]="SESSION_SECRET"
  [auth_token_secret]="AUTH_TOKEN_SECRET"
  [jwt_secret]="JWT_SECRET"
  [license_signing_secret]="LICENSE_SIGNING_SECRET"
  [platform_api_secret]="PLATFORM_API_SECRET"
  [worker_secret]="WORKER_SECRET"
  [deployment_secret_key]="DEPLOYMENT_SECRET_KEY"
  [backup_encryption_key]="BACKUP_ENCRYPTION_KEY"
  [shared_mysql_root_password]="SHARED_MYSQL_ROOT_PASSWORD"
)

# ── Preflight ─────────────────────────────────────────────────
[[ "$(id -u)" -eq 0 ]] || die "Must run as root: sudo bash $0"

SWARM_STATE=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo "inactive")
[[ "$SWARM_STATE" == "active" ]] || die "Docker Swarm is not initialized. Run infra/deploy/swarm-init.sh first."

[[ -f "$PROD_ENV" ]] || die "Missing: $PROD_ENV"

$DRY_RUN && warn "DRY RUN — no secrets will be created"
echo ""
echo "Reading secrets from: $PROD_ENV"
echo ""

# ── Load env ──────────────────────────────────────────────────
# Parse .env file manually to avoid exporting everything to this process
get_env_value() {
  local key="$1"
  grep -E "^${key}=" "$PROD_ENV" 2>/dev/null \
    | head -1 \
    | sed 's/^[^=]*=//' \
    | sed 's/^["'"'"']//' \
    | sed 's/["'"'"']$//'
}

# ── Create secrets ────────────────────────────────────────────
created=0
skipped=0
empty=0

for secret_name in "${!SECRETS[@]}"; do
  env_var="${SECRETS[$secret_name]}"
  value=$(get_env_value "$env_var")

  if [[ -z "$value" ]]; then
    warn "$secret_name ($env_var) — value is empty in .env, skipping"
    empty=$((empty + 1))
    continue
  fi

  if docker secret inspect "$secret_name" >/dev/null 2>&1; then
    skip "$secret_name"
    skipped=$((skipped + 1))
    continue
  fi

  if $DRY_RUN; then
    info "$secret_name ← \$${env_var} [DRY RUN]"
    created=$((created + 1))
  else
    printf '%s' "$value" | docker secret create "$secret_name" - >/dev/null
    info "$secret_name ← \$${env_var}"
    created=$((created + 1))
  fi
done

echo ""
echo "────────────────────────────────────────────────────────"
echo "  Created: $created  |  Already existed: $skipped  |  Skipped (empty): $empty"
echo "────────────────────────────────────────────────────────"
echo ""

if [[ "$empty" -gt 0 ]]; then
  warn "Some secrets were empty in .env — fill those values and re-run."
fi

echo "All Docker secrets:"
docker secret ls
echo ""
echo "Next step: verify secrets mount correctly in a container:"
echo "  docker exec \$(docker ps -q -f name=stockix_api | head -1) ls /run/secrets/"
