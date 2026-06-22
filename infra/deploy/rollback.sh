#!/usr/bin/env bash
# ============================================================
# Stockix — deployment rollback
#
# Re-deploys the previous image set recorded in .swarm-migrate-state
# (or .last-deploy-state). Works in both docker compose mode and
# docker stack deploy (Swarm) mode.
#
# Usage:
#   sudo bash infra/deploy/rollback.sh
#   sudo bash infra/deploy/rollback.sh --dry-run
# ============================================================

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/stockix/stockixnew}"
STATE_DIR="/opt/stockix"
MIGRATE_STATE="${STATE_DIR}/.swarm-migrate-state"
DEPLOY_STATE="${STATE_DIR}/.last-deploy-state"
LOG_FILE="${STATE_DIR}/rollback-$(date +%Y%m%d-%H%M%S).log"
DRY_RUN=false

[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { printf "${GREEN}[OK]${NC}   %s\n" "$*" | tee -a "$LOG_FILE"; }
warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$*" | tee -a "$LOG_FILE"; }
error() { printf "${RED}[ERR]${NC}  %s\n" "$*" | tee -a "$LOG_FILE"; }
run()   { $DRY_RUN && warn "[DRY RUN] $*" || "$@"; }

load_env() {
  local env_file="${REPO_ROOT}/infra/prod/.env"
  [[ -f "$env_file" ]] || return 0
  set -a; source "$env_file"; set +a
}

main() {
  [[ "$(id -u)" -eq 0 ]] || { error "Must run as root: sudo bash $0"; exit 1; }

  mkdir -p "$STATE_DIR"
  load_env
  cd "$REPO_ROOT"

  $DRY_RUN && warn "DRY RUN — no changes will be made"

  # Pick state file: prefer last deploy state, fall back to migration state
  local state_file=""
  [[ -f "$DEPLOY_STATE" ]]  && state_file="$DEPLOY_STATE"
  [[ -f "$MIGRATE_STATE" ]] && [[ -z "$state_file" ]] && state_file="$MIGRATE_STATE"
  [[ -n "$state_file" ]] || { error "No state file found. Cannot determine previous images."; exit 1; }

  info "Reading state from: $state_file"
  # shellcheck disable=SC1090
  source "$state_file"

  # Determine mode (Swarm or Compose)
  local swarm_state
  swarm_state=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo "inactive")

  if [[ "$swarm_state" == "active" ]]; then
    rollback_swarm
  else
    rollback_compose
  fi
}

rollback_swarm() {
  info "Rollback mode: Docker Swarm (docker stack deploy)"

  # Re-tag previous images as :latest so the stack picks them up
  local ghcr_prefix
  ghcr_prefix=$(grep 'GHCR_PREFIX' "${REPO_ROOT}/infra/deploy/deploy.sh" \
    | grep -v '^#' | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'")

  warn "Previous API image:       ${PREV_IMAGE_STOCKIX_API_1:-unknown}"
  warn "Previous Dashboard image: ${PREV_IMAGE_STOCKIX_DASHBOARD_1:-unknown}"
  warn "Previous Worker image:    ${PREV_IMAGE_STOCKIX_INFRA_WORKER_1:-unknown}"

  if [[ -n "${PREV_IMAGE_STOCKIX_API_1:-}" && "${PREV_IMAGE_STOCKIX_API_1}" != "not-running" ]]; then
    run docker tag "${PREV_IMAGE_STOCKIX_API_1}" stockix-api:latest
    run docker tag "${PREV_IMAGE_STOCKIX_API_1}" stockix-api:rollback
    info "Tagged rollback image: stockix-api:latest"
  fi

  if [[ -n "${PREV_IMAGE_STOCKIX_DASHBOARD_1:-}" && "${PREV_IMAGE_STOCKIX_DASHBOARD_1}" != "not-running" ]]; then
    run docker tag "${PREV_IMAGE_STOCKIX_DASHBOARD_1}" stockix-dashboard:latest
    run docker tag "${PREV_IMAGE_STOCKIX_DASHBOARD_1}" stockix-dashboard:rollback
    info "Tagged rollback image: stockix-dashboard:latest"
  fi

  if [[ -n "${PREV_IMAGE_STOCKIX_INFRA_WORKER_1:-}" && "${PREV_IMAGE_STOCKIX_INFRA_WORKER_1}" != "not-running" ]]; then
    run docker tag "${PREV_IMAGE_STOCKIX_INFRA_WORKER_1}" stockix-infra-worker:latest
    run docker tag "${PREV_IMAGE_STOCKIX_INFRA_WORKER_1}" stockix-infra-worker:rollback
    info "Tagged rollback image: stockix-infra-worker:latest"
  fi

  # Re-deploy stack with rollback images
  load_env
  run docker stack deploy \
    --compose-file "${REPO_ROOT}/infra/prod/docker-compose.yml" \
    --with-registry-auth \
    stockix

  info "Rollback deploy submitted. Waiting 60s for convergence..."
  $DRY_RUN || sleep 60

  # Health check
  local scheme api_domain health_url
  scheme="${PUBLIC_BASE_URL_SCHEME:-https}"
  api_domain="${API_DOMAIN:-api.${ROOT_DOMAIN:-localhost}}"
  health_url="${scheme}://${api_domain}/health"

  local passed=false
  for i in $(seq 1 12); do
    if $DRY_RUN || curl --fail --silent --max-time 10 "$health_url" >/dev/null 2>&1; then
      passed=true; break
    fi
    warn "Health check attempt $i/12 — waiting 10s..."
    sleep 10
  done

  $passed && info "Rollback succeeded ✓" \
           || { error "Rollback health check failed — investigate manually"; exit 1; }
}

rollback_compose() {
  info "Rollback mode: Docker Compose (docker compose up)"
  warn "NOTE: docker compose mode does not enforce replicas or Swarm secrets."

  # Re-tag images
  if [[ -n "${PREV_IMAGE_STOCKIX_API_1:-}" && "${PREV_IMAGE_STOCKIX_API_1}" != "not-running" ]]; then
    run docker tag "${PREV_IMAGE_STOCKIX_API_1}" stockix-api:latest
  fi
  if [[ -n "${PREV_IMAGE_STOCKIX_DASHBOARD_1:-}" && "${PREV_IMAGE_STOCKIX_DASHBOARD_1}" != "not-running" ]]; then
    run docker tag "${PREV_IMAGE_STOCKIX_DASHBOARD_1}" stockix-dashboard:latest
  fi
  if [[ -n "${PREV_IMAGE_STOCKIX_INFRA_WORKER_1:-}" && "${PREV_IMAGE_STOCKIX_INFRA_WORKER_1}" != "not-running" ]]; then
    run docker tag "${PREV_IMAGE_STOCKIX_INFRA_WORKER_1}" stockix-infra-worker:latest
  fi

  cd "${REPO_ROOT}/infra/prod"
  run docker compose --env-file .env up -d --no-build --wait \
    traefik postgres control-plane-redis socket-proxy \
    api api-bullmq dashboard infra-worker db-backup

  info "Rollback complete (compose mode) ✓"
}

main "$@"
