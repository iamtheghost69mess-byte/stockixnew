#!/usr/bin/env bash
# ============================================================
# Stockix — Staging Docker Swarm bootstrap
#
# Run ONCE on the staging server before first deploy.
# Requires Docker Swarm to already be initialized (docker swarm init).
#
# What it does:
#   1. Preflight checks
#   2. Creates overlay networks for staging
#   3. Deploys stockix-staging-shared (MySQL, MongoDB, Redis, ProxySQL)
#   4. Initializes MongoDB replica set
#   5. Deploys stockix-staging main stack
#   6. Validates API health
#
# Usage:
#   sudo SWARM_ADVERTISE_ADDR=<ip> bash infra/deploy/swarm-init-staging.sh
# ============================================================

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/stockix/stockixnew}"
STAGING_ENV="${REPO_ROOT}/infra/staging/.env"
SHARED_COMPOSE="${REPO_ROOT}/infra/staging-shared/docker-compose.yml"
PROD_COMPOSE="${REPO_ROOT}/infra/prod/docker-compose.yml"
STAGING_COMPOSE="${REPO_ROOT}/infra/staging/docker-compose.yml"
STATE_DIR="/opt/stockix"
LOG_FILE="${STATE_DIR}/swarm-init-staging-$(date +%Y%m%d-%H%M%S).log"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()   { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
info()  { printf "${GREEN}[OK]${NC}   %s\n" "$*" | tee -a "$LOG_FILE"; }
warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$*" | tee -a "$LOG_FILE"; }
error() { printf "${RED}[ERR]${NC}  %s\n" "$*" | tee -a "$LOG_FILE"; }
step()  { printf "\n${BOLD}${BLUE}══ Step %s ══${NC}\n" "$*" | tee -a "$LOG_FILE"; }
die()   { error "$1"; exit 1; }

load_env() {
  [[ -f "$STAGING_ENV" ]] || die "Missing env file: $STAGING_ENV — copy infra/staging/.env.example to infra/staging/.env and fill secrets"
  set -a
  # shellcheck disable=SC1090
  source "$STAGING_ENV"
  set +a
}

wait_for() {
  local label="$1" max="$2" delay="$3"; shift 3
  for i in $(seq 1 "$max"); do
    if "$@" >/dev/null 2>&1; then
      info "$label ✓"; return 0
    fi
    [[ "$i" -lt "$max" ]] && { warn "$label: attempt $i/$max — retrying in ${delay}s"; sleep "$delay"; }
  done
  return 1
}

main() {
  mkdir -p "$STATE_DIR"
  log "Staging swarm bootstrap started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "Log: $LOG_FILE"
  cd "$REPO_ROOT"
  load_env
  step_00_preflight
  step_01_init_swarm
  step_02_create_networks
  step_03_deploy_shared
  step_04_deploy_staging
  step_05_validate
  step_06_done
}

step_00_preflight() {
  step "0: Preflight"
  [[ "$(id -u)" -eq 0 ]] || die "Must run as root: sudo bash $0"

  local ver major
  ver=$(docker version --format '{{.Server.Version}}' 2>/dev/null) || die "Docker daemon not running"
  major=$(echo "$ver" | cut -d. -f1)
  [[ "$major" -ge 24 ]] || die "Docker >= 24.0.0 required (found: $ver)"
  info "Docker $ver"

  [[ -f "$STAGING_ENV" ]]    || die "Missing: $STAGING_ENV"
  [[ -f "$SHARED_COMPOSE" ]] || die "Missing: $SHARED_COMPOSE"
  [[ -f "$PROD_COMPOSE" ]]   || die "Missing: $PROD_COMPOSE"
  [[ -f "$STAGING_COMPOSE" ]] || die "Missing: $STAGING_COMPOSE"
  info "Required files present"
}

step_01_init_swarm() {
  step "1: Docker Swarm"
  local state
  state=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo "inactive")
  if [[ "$state" == "active" ]]; then
    info "Swarm already active — skipping init"
    return 0
  fi
  local advertise_addr
  advertise_addr="${SWARM_ADVERTISE_ADDR:-$(hostname -I | awk '{print $1}')}"
  warn "Initializing swarm with advertise-addr: $advertise_addr"
  docker swarm init --advertise-addr "$advertise_addr" 2>&1 | tee -a "$LOG_FILE"
  info "Swarm initialized"
}

step_02_create_networks() {
  step "2: Overlay networks"

  for net in stockix_public stockix_internal stockix_socket_proxy_network; do
    if docker network inspect "$net" >/dev/null 2>&1; then
      info "$net: exists"
    else
      case "$net" in
        stockix_public)
          docker network create --driver overlay --label com.stockix.env=staging "$net"
          ;;
        *)
          docker network create --driver overlay --internal --label com.stockix.env=staging "$net"
          ;;
      esac
      info "Created: $net"
    fi
  done

  if docker network inspect stockix-staging-shared >/dev/null 2>&1; then
    info "stockix-staging-shared: exists"
  else
    docker network create --driver overlay --attachable --subnet 172.31.0.0/24 \
      --label com.stockix.env=staging stockix-staging-shared
    info "Created: stockix-staging-shared (overlay, attachable, 172.31.0.0/24)"
  fi
}

step_03_deploy_shared() {
  step "3: Staging shared infra (MySQL, MongoDB, Redis, ProxySQL)"

  docker stack deploy \
    --compose-file "$SHARED_COMPOSE" \
    --with-registry-auth \
    stockix-staging-shared 2>&1 | tee -a "$LOG_FILE"

  info "Stack submitted — waiting 45s for services to start..."
  sleep 45

  local mysql_c
  mysql_c=$(docker ps -q -f name=stockix-staging-shared_stockix-mysql 2>/dev/null | head -1)
  if [[ -n "$mysql_c" ]]; then
    wait_for "MySQL" 18 10 \
      docker exec "$mysql_c" mysqladmin ping -h 127.0.0.1 -u root \
        --password="${SHARED_MYSQL_ROOT_PASSWORD:-}" --silent \
    || die "MySQL did not become healthy. Check: docker service logs stockix-staging-shared_stockix-mysql"
  else
    warn "MySQL container not yet visible — still scheduling"
  fi

  info "Initializing MongoDB replica set..."
  docker run --rm \
    --network stockix-staging-shared \
    mongo:6.0 \
    mongosh --host stockix-mongo:27017 --quiet --eval '
      try {
        rs.initiate({_id:"rs0",members:[{_id:0,host:"stockix-mongo:27017"}]});
        print("RS initiated");
      } catch(e) {
        if (e.codeName==="AlreadyInitialized") { print("RS already initialized"); }
        else { throw e; }
      }
    ' 2>&1 | tee -a "$LOG_FILE" \
    || warn "RS init may not have completed — check manually if provisioning fails"

  info "Staging shared stack deployed ✓"
}

step_04_deploy_staging() {
  step "4: Staging main stack"
  load_env

  docker stack deploy \
    -c "$PROD_COMPOSE" \
    -c "$STAGING_COMPOSE" \
    --with-registry-auth \
    stockix-staging 2>&1 | tee -a "$LOG_FILE"

  info "Stack submitted — waiting 90s to converge..."
  sleep 90

  log ""
  docker service ls 2>&1 | tee -a "$LOG_FILE"
}

step_05_validate() {
  step "5: Health check"
  local scheme api_domain health_url
  scheme="${PUBLIC_BASE_URL_SCHEME:-https}"
  api_domain="${API_DOMAIN:-api.${ROOT_DOMAIN:-dev.stockix.cloud}}"
  health_url="${scheme}://${api_domain}/health"
  info "Health check: $health_url"

  if wait_for "API /health" 18 10 curl --fail --silent --max-time 10 "$health_url"; then
    :
  else
    error "API did not become healthy in 180s"
    error "  docker service ls"
    error "  docker service logs stockix-staging_api --tail 50"
    exit 1
  fi
}

step_06_done() {
  log ""
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "${GREEN}  Stockix staging is running at ${ROOT_DOMAIN:-dev.stockix.cloud}${NC}"
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log ""
  log "  Key commands:"
  log "    docker service ls                              list all services"
  log "    docker service logs stockix-staging_api       API logs"
  log "    docker stack services stockix-staging-shared  shared infra status"
  log ""
  log "  Future deploys:"
  log "    bash infra/deploy/deploy.sh staging <sha>"
  log ""
  log "  Full log: $LOG_FILE"
}

main "$@"
