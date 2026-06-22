#!/usr/bin/env bash
# ============================================================
# Stockix — Quarterly DR drill
#
# Verifies that recent backups exist, are < 26 hours old, checks
# platform health, and prints operator restore instructions.
# Does NOT mutate any production data.
#
# Produces a dated log in infra/prod/dr-drill-logs/YYYY-MM-DD.log
# that must be committed to the repo as evidence of the drill.
#
# Usage:
#   bash scripts/dr-drill.sh                # full drill
#   bash scripts/dr-drill.sh --check-only  # skip compose ps
# ============================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/infra/prod/.env"
LOG_DIR="${ROOT}/infra/prod/dr-drill-logs"
LOG_FILE="${LOG_DIR}/$(date +%Y-%m-%d).log"
CHECK_ONLY=false

[[ "${1:-}" == "--check-only" ]] && CHECK_ONLY=true

# ── Helpers ───────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass()  { printf "${GREEN}[PASS]${NC} %s\n" "$*" | tee -a "$LOG_FILE"; }
fail()  { printf "${RED}[FAIL]${NC} %s\n" "$*" | tee -a "$LOG_FILE"; DRILL_FAILED=1; }
warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$*" | tee -a "$LOG_FILE"; }
log()   { printf '%s\n' "$*" | tee -a "$LOG_FILE"; }
DRILL_FAILED=0

# ── Setup ─────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
log "=================================================================="
log "  Stockix DR Drill — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "  Operator: ${DRILL_OPERATOR:-$(whoami)}"
log "=================================================================="

if [[ ! -f "$ENV_FILE" ]]; then
  fail "Missing $ENV_FILE — cannot proceed"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

PREFIX="${BACKUP_B2_PREFIX:-stockix-platform-backups}"

# ── 1. B2 credentials ─────────────────────────────────────────
log ""
log "── 1. B2 credentials ──────────────────────────────────────"
if [[ -z "${BACKUP_B2_BUCKET:-}" || -z "${BACKUP_B2_ENDPOINT:-}" \
   || -z "${BACKUP_B2_KEY_ID:-}" || -z "${BACKUP_B2_APP_KEY:-}" ]]; then
  fail "BACKUP_B2_BUCKET / BACKUP_B2_ENDPOINT / KEY_ID / APP_KEY not set in .env"
  exit 1
fi
pass "B2 credentials present"
log "  Bucket: s3://${BACKUP_B2_BUCKET}/${PREFIX}/"

export AWS_ACCESS_KEY_ID="${BACKUP_B2_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_B2_APP_KEY}"

# ── 2. Recent Postgres backup (< 26 hours) ────────────────────
log ""
log "── 2. Postgres backup recency (must be < 26h old) ─────────"

LATEST_PG=$(aws --endpoint-url "${BACKUP_B2_ENDPOINT}" \
  s3 ls "s3://${BACKUP_B2_BUCKET}/${PREFIX}/" \
  | grep "stockix_platform_" \
  | sort | tail -1) || true

if [[ -z "$LATEST_PG" ]]; then
  fail "No Postgres backup objects found in B2"
else
  LATEST_PG_DATE=$(echo "$LATEST_PG" | awk '{print $1 " " $2}')
  LATEST_PG_FILE=$(echo "$LATEST_PG" | awk '{print $4}')
  LATEST_PG_EPOCH=$(date -u -d "$LATEST_PG_DATE" +%s 2>/dev/null \
    || date -u -j -f "%Y-%m-%d %H:%M:%S" "$LATEST_PG_DATE" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE_HOURS=$(( (NOW_EPOCH - LATEST_PG_EPOCH) / 3600 ))

  log "  Latest:    $LATEST_PG_FILE"
  log "  Timestamp: $LATEST_PG_DATE UTC"
  log "  Age:       ${AGE_HOURS}h"

  if [[ "$AGE_HOURS" -gt 26 ]]; then
    fail "Latest Postgres backup is ${AGE_HOURS}h old (threshold: 26h) — backup may have failed"
  else
    pass "Postgres backup is ${AGE_HOURS}h old ✓"
  fi
fi

# ── 3. Runtime backups (Redis, Traefik, tenant-envs) ──────────
log ""
log "── 3. Runtime asset backups ────────────────────────────────"
for prefix_suffix in "redis" "traefik" "tenant-envs"; do
  LATEST=$(aws --endpoint-url "${BACKUP_B2_ENDPOINT}" \
    s3 ls "s3://${BACKUP_B2_BUCKET}/${PREFIX}/${prefix_suffix}/" \
    2>/dev/null | sort | tail -1 | awk '{print $4}') || true
  if [[ -n "$LATEST" ]]; then
    pass "${prefix_suffix}: $LATEST"
  else
    warn "${prefix_suffix}: no backups found — may not have run yet or prefix is wrong"
  fi
done

# ── 4. API health ─────────────────────────────────────────────
log ""
log "── 4. Platform health ──────────────────────────────────────"
API_BASE="${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN:-api.${ROOT_DOMAIN}}"
if curl -fsS --max-time 10 "${API_BASE}/ready" 2>/dev/null | grep -q '"ready":true'; then
  pass "GET ${API_BASE}/ready → ready:true"
elif curl -fsS --max-time 10 "${API_BASE}/health" 2>/dev/null | grep -q '"ok"'; then
  pass "GET ${API_BASE}/health → ok"
else
  fail "API health check failed — is the platform running?"
fi

# ── 5. Prometheus backup metric freshness ─────────────────────
log ""
log "── 5. Prometheus backup metric ─────────────────────────────"
PROM_QUERY="http://localhost:9090/api/v1/query?query=stockix_backup_last_success_timestamp"
PROM_RESULT=$(curl -fsS --max-time 5 "$PROM_QUERY" 2>/dev/null || echo "")
if [[ -n "$PROM_RESULT" ]] && echo "$PROM_RESULT" | grep -q '"value"'; then
  TS=$(echo "$PROM_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['result'][0]['value'][1])" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE_H=$(( (NOW - ${TS%.*}) / 3600 ))
  if [[ "$AGE_H" -gt 26 ]]; then
    fail "Prometheus backup metric is ${AGE_H}h old — node_exporter textfile metric may not be updating"
  else
    pass "Prometheus backup metric: ${AGE_H}h old ✓"
  fi
else
  warn "Could not reach Prometheus (expected on non-server runs) — skipping metric check"
fi

# ── 6. Container status ───────────────────────────────────────
if [[ "$CHECK_ONLY" != true ]]; then
  log ""
  log "── 6. Running containers ───────────────────────────────────"
  SWARM_STATE=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo "inactive")
  if [[ "$SWARM_STATE" == "active" ]]; then
    docker service ls --format 'table {{.Name}}\t{{.Mode}}\t{{.Replicas}}' 2>&1 | tee -a "$LOG_FILE" || fail "docker service ls failed"
  else
    docker compose -f "${ROOT}/infra/prod/docker-compose.yml" --env-file "$ENV_FILE" \
      ps --format table 2>&1 | tee -a "$LOG_FILE" || fail "docker compose ps failed"
  fi
fi

# ── 7. Restore smoke instructions (printed, not executed) ─────
log ""
log "── 7. Restore smoke test steps (operator: execute on spare) ─"
log "  These steps must be run manually on a spare EC2 instance."
log "  Record the RTO (time from step 1 to step 5) in the log below."
log ""
log "  1. Download latest Postgres backup:"
log "     aws --endpoint-url ${BACKUP_B2_ENDPOINT} \\"
log "       s3 cp s3://${BACKUP_B2_BUCKET}/${PREFIX}/${LATEST_PG_FILE:-<latest-file>} /tmp/restore.dump.gz.gpg"
log ""
log "  2. Decrypt and restore:"
log "     gpg --batch --passphrase \"\$BACKUP_ENCRYPTION_KEY\" \\"
log "       --decrypt /tmp/restore.dump.gz.gpg | zcat \\"
log "       | docker exec -i <postgres-container> pg_restore \\"
log "           -U postgres -d stockix_platform --clean --no-owner"
log ""
log "  3. Verify tenant count matches expected:"
log "     docker exec <postgres-container> psql -U postgres -d stockix_platform \\"
log "       -c 'SELECT COUNT(*) FROM tenants WHERE status = \\'active\\';'"
log ""
log "  4. Start platform on spare instance:"
log "     bash infra/deploy/deploy.sh production <last-known-good-sha>"
log ""
log "  5. Confirm /ready returns ready:true on the spare instance."
log ""

# ── 8. Drill result ───────────────────────────────────────────
log "=================================================================="
if [[ "$DRILL_FAILED" -eq 0 ]]; then
  log "  RESULT: ALL AUTOMATED CHECKS PASSED"
else
  log "  RESULT: ONE OR MORE CHECKS FAILED — see [FAIL] lines above"
fi
log ""
log "  Operator action required:"
log "  ┌─────────────────────────────────────────────────────────────┐"
log "  │  Fill in the following and commit this log file to the repo │"
log "  │  as evidence of the DR drill.                               │"
log "  └─────────────────────────────────────────────────────────────┘"
log ""
log "  RESTORE_TESTED:        [ YES / NO / SKIPPED ]"
log "  RTO_MINUTES:           ___"
log "  RPO_HOURS:             ___ (age of backup used)"
log "  OPERATOR_SIGNATURE:    ___"
log "  NOTES:                 ___"
log ""
log "  Log file: $LOG_FILE"
log "=================================================================="

[[ "$DRILL_FAILED" -eq 0 ]] && exit 0 || exit 1
