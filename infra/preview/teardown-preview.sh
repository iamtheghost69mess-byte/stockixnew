#!/usr/bin/env bash
# Tear down a PR preview stack and clean up state.
# Run on the preview server by the deploy-preview-cleanup.yml workflow.
# Usage: bash infra/preview/teardown-preview.sh <pr_number>
set -euo pipefail

PR_NUMBER="${1:-}"
if [ -z "$PR_NUMBER" ]; then
  echo "Usage: $0 <pr_number>"
  exit 1
fi

PROJECT="stockix-pr-${PR_NUMBER}"
STATE_DIR="/opt/stockix/previews/pr-${PR_NUMBER}"
COMPOSE_FILE="/opt/stockix/stockixnew/infra/preview/docker-compose.preview.yml"
ENV_FILE="/opt/stockix/infra/preview/.env.preview"

echo "[preview] Tearing down PR #${PR_NUMBER} project=${PROJECT}"

# Bring down the compose stack (remove containers, networks; preserve nothing)
docker compose \
  -p "$PROJECT" \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  down -v --remove-orphans 2>/dev/null || true

# Remove state directory
rm -rf "$STATE_DIR"

echo "[preview] PR #${PR_NUMBER} stack removed"
