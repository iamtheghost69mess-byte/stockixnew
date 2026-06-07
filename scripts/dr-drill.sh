#!/usr/bin/env bash
# Quarterly DR drill helper — verifies backups exist and documents restore smoke steps.
# Does NOT mutate production data. Run on the production host from repo root.
#
# Usage:
#   bash scripts/dr-drill.sh
#   bash scripts/dr-drill.sh --check-only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/infra/prod/.env"
CHECK_ONLY=false
if [[ "${1:-}" == "--check-only" ]]; then
  CHECK_ONLY=true
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

fail=0
check() {
  if "$@"; then
    echo "OK  $*"
  else
    echo "FAIL $*"
    fail=1
  fi
}

echo "=== Stockix DR drill ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ==="

if [[ -z "${BACKUP_B2_BUCKET:-}" || -z "${BACKUP_B2_ENDPOINT:-}" ]]; then
  echo "FAIL BACKUP_B2_BUCKET / BACKUP_B2_ENDPOINT not set"
  exit 1
fi

PREFIX="${BACKUP_B2_PREFIX:-stockix-platform-backups}"
echo "Backup bucket: s3://${BACKUP_B2_BUCKET}/${PREFIX}/"

echo ""
echo "=== Latest backup objects (Postgres + shared MySQL) ==="
AWS_ACCESS_KEY_ID="${BACKUP_B2_KEY_ID:?BACKUP_B2_KEY_ID required}" \
AWS_SECRET_ACCESS_KEY="${BACKUP_B2_APP_KEY:?BACKUP_B2_APP_KEY required}" \
aws s3 ls "s3://${BACKUP_B2_BUCKET}/${PREFIX}/" \
  --endpoint-url "${BACKUP_B2_ENDPOINT}" | sort | tail -10 || fail=1

echo ""
echo "=== Runtime asset backups (Redis / Traefik / tenant-envs) ==="
AWS_ACCESS_KEY_ID="${BACKUP_B2_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${BACKUP_B2_APP_KEY}" \
aws s3 ls "s3://${BACKUP_B2_BUCKET}/${PREFIX}/redis/" \
  --endpoint-url "${BACKUP_B2_ENDPOINT}" 2>/dev/null | tail -3 || echo "WARN no redis backups listed"
AWS_ACCESS_KEY_ID="${BACKUP_B2_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${BACKUP_B2_APP_KEY}" \
aws s3 ls "s3://${BACKUP_B2_BUCKET}/${PREFIX}/traefik/" \
  --endpoint-url "${BACKUP_B2_ENDPOINT}" 2>/dev/null | tail -3 || echo "WARN no traefik backups listed"
AWS_ACCESS_KEY_ID="${BACKUP_B2_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${BACKUP_B2_APP_KEY}" \
aws s3 ls "s3://${BACKUP_B2_BUCKET}/${PREFIX}/tenant-envs/" \
  --endpoint-url "${BACKUP_B2_ENDPOINT}" 2>/dev/null | tail -3 || echo "WARN no tenant-env backups listed"

echo ""
echo "=== Platform health ==="
API_BASE="${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN:-api.${ROOT_DOMAIN}}"
curl -fsS "${API_BASE}/ready" | grep -q '"ready":true' && echo "OK  GET /ready" || { echo "FAIL GET /ready"; fail=1; }

echo ""
echo "=== Manual restore validation (document each run) ==="
cat <<'EOF'
1. Pick latest Postgres dump from B2 (see infra/prod/OPERATIONS.md § backup restore).
2. Restore to a staging Postgres instance — verify tenant count matches production metadata.
3. Restore latest shared_mysql backup to staging MySQL — spot-check one tenant schema.
4. Record RTO/RPO in ops log: time from backup selection to successful /ready on staging API.
5. See infra/prod/FAILOVER_RUNBOOK.md for full EC2 failover decision tree.
EOF

if [[ "$CHECK_ONLY" == true ]]; then
  echo ""
  echo "(--check-only: skipping compose ps)"
else
  echo ""
  echo "=== Running containers (prod compose) ==="
  docker compose -f "${ROOT}/infra/prod/docker-compose.yml" --env-file "$ENV_FILE" ps --format table || fail=1
fi

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo "DR drill checks passed — complete manual restore steps above and file the RTO note."
  exit 0
fi
echo "DR drill checks FAILED — fix backup/health issues before go-live."
exit 1
