#!/usr/bin/env bash
# ============================================================
# Stockix — Docker Swarm one-time migration
#
# Converts the prod server from docker compose to docker stack deploy.
# Run ONCE on the production server after reviewing this script.
#
# What it does:
#   1. Preflight checks (Docker version, required files)
#   2. Records current state (image digests, container names)
#   3. Initializes Docker Swarm (single-node manager)
#   4. Creates overlay networks required by the stack
#   5. Converts stockix-shared from bridge → overlay (attachable)
#   6. Deploys shared infra stack via docker stack deploy
#   7. Deploys prod stack via docker stack deploy
#   8. Validates API health
#
# Prerequisites:
#   - Docker >= 24.0.0 on the prod server
#   - Run as root (sudo)
#   - infra/prod/.env populated
#   - Compose files updated to Swarm-compatible format (labels under
#     deploy.labels, deploy.resources.limits set, placement constraints
#     added) — these are in the same commit as this script.
#
# Usage:
#   sudo bash infra/deploy/swarm-init.sh
#   sudo SWARM_ADVERTISE_ADDR=10.0.0.1 bash infra/deploy/swarm-init.sh
#
# Rollback:
#   sudo bash infra/deploy/rollback.sh
# ============================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────
REPO_ROOT="${REPO_ROOT:-/opt/stockix/stockixnew}"
PROD_ENV="${REPO_ROOT}/infra/prod/.env"
SHARED_COMPOSE="${REPO_ROOT}/infra/shared/docker-compose.yml"
PROD_COMPOSE="${REPO_ROOT}/infra/prod/docker-compose.yml"
STATE_DIR="/opt/stockix"
STATE_FILE="${STATE_DIR}/.swarm-migrate-state"
LOG_FILE="${STATE_DIR}/swarm-init-$(date +%Y%m%d-%H%M%S).log"

# ── Terminal helpers ──────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()   { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
info()  { printf "${GREEN}[OK]${NC}   %s\n" "$*" | tee -a "$LOG_FILE"; }
warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$*" | tee -a "$LOG_FILE"; }
error() { printf "${RED}[ERR]${NC}  %s\n" "$*" | tee -a "$LOG_FILE"; }
step()  { printf "\n${BOLD}${BLUE}══ Step %s ══${NC}\n" "$*" | tee -a "$LOG_FILE"; }
die()   { error "$1"; exit 1; }

load_env() {
  [[ -f "$PROD_ENV" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$PROD_ENV"
  set +a
}

wait_for() {
  # wait_for "label" max_attempts sleep_seconds "command..."
  local label="$1" max="$2" delay="$3"; shift 3
  for i in $(seq 1 "$max"); do
    if "$@" >/dev/null 2>&1; then
      info "$label ✓"
      return 0
    fi
    [[ "$i" -lt "$max" ]] && { warn "$label: attempt $i/$max — retrying in ${delay}s"; sleep "$delay"; }
  done
  return 1
}

# ── Main ──────────────────────────────────────────────────────
main() {
  mkdir -p "$STATE_DIR"
  log "Swarm migration started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "Log: $LOG_FILE"
  log ""

  cd "$REPO_ROOT"
  load_env

  step_00_preflight
  step_01_record_state
  step_02_init_swarm
  step_03_create_overlay_networks
  step_04_deploy_shared_stack
  step_05_deploy_prod_stack
  step_06_validate
  step_07_done
}

# ── Step 0: Preflight ─────────────────────────────────────────
step_00_preflight() {
  step "0: Preflight checks"

  [[ "$(id -u)" -eq 0 ]] || die "Must run as root: sudo bash $0"

  # Docker version >= 24
  local ver major
  ver=$(docker version --format '{{.Server.Version}}' 2>/dev/null) || die "Docker daemon not running"
  major=$(echo "$ver" | cut -d. -f1)
  [[ "$major" -ge 24 ]] || die "Docker >= 24.0.0 required (found: $ver)"
  info "Docker $ver"

  # Required files
  [[ -f "$PROD_ENV" ]]       || die "Missing env file: $PROD_ENV"
  [[ -f "$SHARED_COMPOSE" ]] || die "Missing: $SHARED_COMPOSE"
  [[ -f "$PROD_COMPOSE" ]]   || die "Missing: $PROD_COMPOSE"
  info "Required files present"

  # Compose files must have Swarm-compatible deploy.labels blocks
  # (a label under deploy: confirms the compose was updated)
  if ! grep -A5 "deploy:" "$PROD_COMPOSE" | grep -q "labels:"; then
    die "Prod compose does not have deploy.labels blocks. Apply the Swarm-compatible compose changes (part of this commit) before running this script."
  fi
  info "Compose files have Swarm-compatible deploy blocks"

  # Validate compose syntax
  docker compose -f "$PROD_COMPOSE" --env-file "$PROD_ENV" config --quiet \
    && info "Prod compose: syntax OK" \
    || die "Prod compose has syntax errors — run: docker compose -f infra/prod/docker-compose.yml config"

  docker compose -f "$SHARED_COMPOSE" --env-file "$PROD_ENV" config --quiet \
    && info "Shared compose: syntax OK" \
    || die "Shared compose has syntax errors"
}

# ── Step 1: Record current state ──────────────────────────────
step_01_record_state() {
  step "1: Recording current state (snapshot for rollback)"

  {
    echo "MIGRATION_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "REPO_ROOT=${REPO_ROOT}"

    # Running container names
    echo "RUNNING_CONTAINERS=$(docker ps --format '{{.Names}}' | tr '\n' ',' | sed 's/,$//')"

    # Current image for each core service (for rollback re-tagging)
    for svc in stockix-api-1 stockix-dashboard-1 stockix-infra-worker-1; do
      local img
      img=$(docker inspect --format='{{.Config.Image}}' "$svc" 2>/dev/null || echo "not-running")
      echo "PREV_IMAGE_$(echo "$svc" | tr '-' '_' | tr '[:lower:]' '[:upper:]')=${img}"
    done

    # Network drivers (to verify post-migration)
    for net in stockix-shared stockix_internal stockix_public; do
      local drv
      drv=$(docker network inspect "$net" --format='{{.Driver}}' 2>/dev/null || echo "not-found")
      echo "PREV_NETWORK_$(echo "$net" | tr '-' '_')=${drv}"
    done
  } > "$STATE_FILE"

  info "State saved: $STATE_FILE"
  log "--- State snapshot ---"
  cat "$STATE_FILE" | tee -a "$LOG_FILE"
  log "---------------------"
}

# ── Step 2: Initialize Swarm ──────────────────────────────────
step_02_init_swarm() {
  step "2: Initializing Docker Swarm"

  local swarm_state
  swarm_state=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo "inactive")

  if [[ "$swarm_state" == "active" ]]; then
    info "Swarm already initialized (state: active) — skipping"
    docker info --format '{{.Swarm.NodeID}}' | tee -a "$LOG_FILE"
    return 0
  fi

  # Determine advertise address — prefer explicit env, fall back to primary IP
  local advertise_addr
  advertise_addr="${SWARM_ADVERTISE_ADDR:-$(hostname -I | awk '{print $1}')}"
  warn "Using advertise-addr: $advertise_addr"
  warn "If this is wrong, re-run with: SWARM_ADVERTISE_ADDR=<correct-ip> bash $0"

  docker swarm init --advertise-addr "$advertise_addr" 2>&1 | tee -a "$LOG_FILE"

  local node_id
  node_id=$(docker info --format '{{.Swarm.NodeID}}')
  echo "SWARM_NODE_ID=${node_id}" >> "$STATE_FILE"
  info "Swarm manager: $node_id"
}

# ── Step 3: Create overlay networks ───────────────────────────
step_03_create_overlay_networks() {
  step "3: Creating overlay networks"

  # stockix_public — public-facing, internet-accessible
  if docker network inspect stockix_public >/dev/null 2>&1; then
    info "stockix_public: exists ($(docker network inspect stockix_public --format '{{.Driver}}'))"
  else
    docker network create --driver overlay --label com.stockix.managed=true stockix_public
    info "Created: stockix_public (overlay)"
  fi

  # stockix_internal — internal-only, no egress from containers
  if docker network inspect stockix_internal >/dev/null 2>&1; then
    info "stockix_internal: exists ($(docker network inspect stockix_internal --format '{{.Driver}}'))"
  else
    docker network create --driver overlay --internal \
      --label com.stockix.managed=true stockix_internal
    info "Created: stockix_internal (overlay, internal)"
  fi

  # stockix_socket_proxy_network — internal, for socket-proxy ↔ Traefik/worker
  if docker network inspect stockix_socket_proxy_network >/dev/null 2>&1; then
    info "stockix_socket_proxy_network: exists"
  else
    docker network create --driver overlay --internal \
      --label com.stockix.managed=true stockix_socket_proxy_network
    info "Created: stockix_socket_proxy_network (overlay, internal)"
  fi

  # stockix-shared — ATTACHABLE overlay so non-Swarm tenant containers can join
  local shared_driver shared_attachable
  shared_driver=$(docker network inspect stockix-shared --format='{{.Driver}}' 2>/dev/null || echo "none")
  shared_attachable=$(docker network inspect stockix-shared --format='{{.Attachable}}' 2>/dev/null || echo "false")

  if [[ "$shared_driver" == "overlay" && "$shared_attachable" == "true" ]]; then
    info "stockix-shared: overlay + attachable — no change needed"
    return 0
  fi

  warn "stockix-shared is currently '$shared_driver' — converting to overlay+attachable"
  warn "This requires briefly stopping shared infra services..."

  # Gracefully stop shared infra first
  docker compose -f "$SHARED_COMPOSE" --env-file "$PROD_ENV" \
    -p stockix-shared stop 2>&1 | tee -a "$LOG_FILE" || true

  # Stop prod services that use stockix-shared
  for c in stockix-infra-worker-1 stockix-db-backup-1; do
    docker stop "$c" 2>/dev/null && warn "Stopped: $c" || true
  done

  # Force-disconnect any containers still attached (can fail if already gone)
  docker network disconnect --force stockix-shared stockix-mysql-proxy 2>/dev/null || true
  docker network disconnect --force stockix-shared stockix-gotenberg  2>/dev/null || true

  # Remove old network
  docker network rm stockix-shared 2>/dev/null || true
  info "Removed old stockix-shared network"

  # Re-create as overlay + attachable (with original subnet preserved)
  docker network create \
    --driver overlay \
    --attachable \
    --subnet 172.30.0.0/24 \
    --label com.stockix.managed=true \
    stockix-shared
  info "Created: stockix-shared (overlay, attachable, 172.30.0.0/24)"
}

# ── Step 4: Deploy shared stack ───────────────────────────────
step_04_deploy_shared_stack() {
  step "4: Deploying shared infra stack"

  docker stack deploy \
    --compose-file "$SHARED_COMPOSE" \
    --with-registry-auth \
    stockix-shared 2>&1 | tee -a "$LOG_FILE"

  info "Stack submitted — waiting 45s for services to start..."
  sleep 45

  # Wait for MySQL
  local mysql_c
  mysql_c=$(docker ps -q -f name=stockix-shared_stockix-mysql 2>/dev/null | head -1)
  if [[ -n "$mysql_c" ]]; then
    if wait_for "MySQL" 18 10 \
        docker exec "$mysql_c" mysqladmin ping -h 127.0.0.1 -u root \
          --password="${SHARED_MYSQL_ROOT_PASSWORD:-}" --silent; then
      : # already logged inside wait_for
    else
      die "MySQL did not become healthy in 180s. Check: docker service logs stockix-shared_stockix-mysql"
    fi
  else
    warn "MySQL container not yet visible — may still be scheduling. Continuing..."
  fi

  # Wait for tenant Redis
  local redis_c
  redis_c=$(docker ps -q -f name=stockix-shared_stockix-redis 2>/dev/null | head -1)
  if [[ -n "$redis_c" ]]; then
    wait_for "Tenant Redis" 12 5 \
      docker exec "$redis_c" redis-cli -a "${TENANT_REDIS_PASSWORD:-}" ping \
      || warn "Redis health check timed out — check logs if tenants have issues"
  fi

  # MongoDB replica set init (idempotent — safe to re-run)
  info "Initializing MongoDB replica set (rs0)..."
  docker run --rm \
    --network stockix-shared \
    mongo:6.0 \
    mongosh --host stockix-mongo:27017 --quiet --eval '
      try {
        rs.initiate({_id: "rs0", members: [{_id: 0, host: "stockix-mongo:27017"}]});
        print("RS initiated");
      } catch(e) {
        if (e.codeName === "AlreadyInitialized") {
          print("RS already initialized — OK");
        } else {
          throw e;
        }
      }
    ' 2>&1 | tee -a "$LOG_FILE" \
    || warn "RS init command failed — if mongo is still starting, wait 30s and re-run the mongosh command manually"

  info "Shared stack deployed ✓"
}

# ── Step 5: Deploy prod stack ─────────────────────────────────
step_05_deploy_prod_stack() {
  step "5: Deploying prod stack (stockix)"

  # docker stack deploy requires env vars to be exported for variable substitution
  load_env

  docker stack deploy \
    --compose-file "$PROD_COMPOSE" \
    --with-registry-auth \
    stockix 2>&1 | tee -a "$LOG_FILE"

  info "Stack submitted — waiting 90s for services to converge..."
  sleep 90

  log ""
  log "── Service status ──────────────────────────────"
  docker service ls 2>&1 | tee -a "$LOG_FILE"
  log "────────────────────────────────────────────────"
}

# ── Step 6: Validate ──────────────────────────────────────────
step_06_validate() {
  step "6: Validating production health"

  local scheme api_domain health_url
  scheme="${PUBLIC_BASE_URL_SCHEME:-https}"
  api_domain="${API_DOMAIN:-api.${ROOT_DOMAIN:-localhost}}"
  health_url="${scheme}://${api_domain}/health"
  info "Health check: $health_url"

  if wait_for "API /health" 18 10 curl --fail --silent --max-time 10 "$health_url"; then
    : # success logged inside wait_for
  else
    error "API did not become healthy in 180s"
    error ""
    error "Diagnostic commands:"
    error "  docker service ls"
    error "  docker service ps stockix_api --no-trunc"
    error "  docker service logs stockix_api --tail 50"
    error ""
    error "To rollback:"
    error "  sudo bash ${REPO_ROOT}/infra/deploy/rollback.sh"
    exit 1
  fi

  # Traefik Swarm provider discovery (best-effort, may take a few extra seconds)
  if curl --fail --silent "http://127.0.0.1:8080/api/http/services" 2>/dev/null \
      | grep -q '"api@swarm"'; then
    info "Traefik Swarm provider: services discovered ✓"
  else
    warn "Traefik Swarm services not yet visible in dashboard — this is normal up to ~30s after deploy"
    warn "Check: https://traefik.${ROOT_DOMAIN:-<your-domain>}"
  fi

  log ""
  log "── Final replica counts ──────────────────────────────────────"
  docker service ls --format 'table {{.Name}}\t{{.Mode}}\t{{.Replicas}}\t{{.Image}}' \
    2>&1 | tee -a "$LOG_FILE"
  log "──────────────────────────────────────────────────────────────"
}

# ── Step 7: Done ──────────────────────────────────────────────
step_07_done() {
  log ""
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "${GREEN}  Stockix is now running in Docker Swarm mode${NC}"
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log ""
  log "  Key commands:"
  log "    docker service ls                            list services + replica counts"
  log "    docker service logs stockix_api             stream API logs"
  log "    docker service ps stockix_api --no-trunc    task placement history"
  log "    docker node ls                              Swarm node list"
  log ""
  log "  Future deploys (same interface as before):"
  log "    bash infra/deploy/deploy.sh production <sha>"
  log ""
  log "  Rollback (if something went wrong):"
  log "    sudo bash infra/deploy/rollback.sh"
  log ""
  log "  State file: $STATE_FILE"
  log "  Full log:   $LOG_FILE"
  log ""
  log "  REMINDER: Keep api service at replicas: 1 until the Redis"
  log "  provision pub/sub bus is implemented (see OPERATIONS.md)."
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

main "$@"
