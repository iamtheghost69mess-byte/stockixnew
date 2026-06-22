#!/usr/bin/env bash
# Deploy an isolated preview stack for a pull request.
# Run on the preview server by the deploy-preview.yml workflow.
# Usage: bash infra/preview/deploy-preview.sh <pr_number> <sha>
set -euo pipefail

PR_NUMBER="${1:-}"
SHA="${2:-}"

if [ -z "$PR_NUMBER" ] || [ -z "$SHA" ]; then
  echo "Usage: $0 <pr_number> <sha>"
  exit 1
fi

PROJECT="stockix-pr-${PR_NUMBER}"
GHCR_NAMESPACE="${GHCR_NAMESPACE:-ghcr.io/your-org/stockix}"
ENV_FILE="/opt/stockix/infra/preview/.env.preview"
COMPOSE_FILE="/opt/stockix/stockixnew/infra/preview/docker-compose.preview.yml"
STATE_DIR="/opt/stockix/previews/pr-${PR_NUMBER}"

echo "[preview] Deploying PR #${PR_NUMBER} SHA=${SHA} project=${PROJECT}"

mkdir -p "$STATE_DIR"
echo "$SHA" > "${STATE_DIR}/sha"

# Pull fresh images
docker pull "${GHCR_NAMESPACE}/api:pr-${PR_NUMBER}"
docker pull "${GHCR_NAMESPACE}/dashboard:pr-${PR_NUMBER}"

# Export vars for compose
export PR_NUMBER
export SHA
export GHCR_NAMESPACE

# Deploy (replace running stack if already exists)
docker compose \
  -p "$PROJECT" \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  up -d --remove-orphans

echo "[preview] PR #${PR_NUMBER} stack is up"

# Smoke-test the API health endpoint (retry for up to 60s)
API_PORT=$(docker inspect "${PROJECT}-api-1" --format='{{range $k,$v := .NetworkSettings.Ports}}{{range $v}}{{.HostPort}}{{end}}{{end}}' 2>/dev/null | head -1 || echo "")
if [ -n "$API_PORT" ]; then
  echo "[preview] Waiting for API on port $API_PORT..."
  for i in $(seq 1 12); do
    if curl -sf "http://127.0.0.1:${API_PORT}/health" > /dev/null 2>&1; then
      echo "[preview] API healthy"
      break
    fi
    [ "$i" -eq 12 ] && echo "[preview] WARNING: API health check timed out" || sleep 5
  done
fi

echo "[preview] Done. Dashboard: https://dashboard.pr-${PR_NUMBER}.preview.${ROOT_DOMAIN:-yourdomain.com}"
