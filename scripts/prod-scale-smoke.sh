#!/usr/bin/env bash
# Post-deploy smoke for scale-first production (2+ API replicas + single BullMQ consumer).
# Run on the production host from repo root after: cd infra/prod && docker compose up -d --build --wait
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/infra/prod/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

API_BASE="${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN:-api.${ROOT_DOMAIN}}"
DASHBOARD_BASE="${DASHBOARD_URL:-https://${ROOT_DOMAIN}}"

echo "== Stockix scale smoke =="
echo "API: $API_BASE"

fail() {
  echo "FAIL: $*"
  exit 1
}

ready_json="$(curl -fsS "${API_BASE}/ready")" || fail "GET /ready"
echo "$ready_json" | grep -q '"ready":true' || fail "/ready not ready: $ready_json"
echo "$ready_json" | grep -q '"database":"ok"' || fail "database check failed"
echo "$ready_json" | grep -q '"redis":"ok"' || fail "redis check failed (CONTROL_PLANE_REDIS_URL required in prod)"
echo "OK /ready"

health_json="$(curl -fsS "${API_BASE}/health")" || fail "GET /health"
echo "$health_json" | grep -q '"status":"ok"' || fail "/health: $health_json"
echo "OK /health"

api_count="$(docker compose -f "${ROOT}/infra/prod/docker-compose.yml" --env-file "$ENV_FILE" ps -q api 2>/dev/null | wc -l | tr -d ' ')"
bullmq_count="$(docker compose -f "${ROOT}/infra/prod/docker-compose.yml" --env-file "$ENV_FILE" ps -q api-bullmq 2>/dev/null | wc -l | tr -d ' ')"
echo "API containers running: ${api_count:-0} (expect 2)"
echo "api-bullmq containers running: ${bullmq_count:-0} (expect 1)"

if [[ "${api_count:-0}" -lt 2 ]]; then
  echo "WARN: fewer than 2 api replicas — check deploy.replicas or compose scale"
fi
if [[ "${bullmq_count:-0}" -lt 1 ]]; then
  fail "api-bullmq not running — BullMQ jobs will not process"
fi

if [[ -n "${BACKUP_B2_BUCKET:-}" ]]; then
  echo "Backup bucket configured: ${BACKUP_B2_BUCKET}"
  echo "Verify latest object: aws s3 ls s3://${BACKUP_B2_BUCKET}/${BACKUP_B2_PREFIX:-stockix-platform-backups}/ --endpoint-url \"${BACKUP_B2_ENDPOINT}\""
else
  echo "WARN: BACKUP_B2_BUCKET unset — enable db-backup service"
fi

echo "Dashboard: ${DASHBOARD_BASE}"
echo "Manual: login, provision test tenant, license activate/suspend"
echo "== Smoke checks passed =="
