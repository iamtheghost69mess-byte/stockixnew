#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Production Deploy Script — zerowix.cloud
# Run on VPS as deploy user: bash deploy/deploy.sh
#
# Backend: Docker Compose rebuild + restart
# Frontends: Pre-built in CI and rsynced. PM2 reload only.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/home/deploy/posnew"
LOCK="/tmp/deploy.lock"
LOG_DIR="/home/deploy/logs"

# Prevent concurrent deploys
exec 200>"$LOCK"
flock -n 200 || { echo "❌ Deploy already running. Exiting."; exit 1; }

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

echo "▸ [1/6] Pulling latest code..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Deploy directory has local changes. Aborting to avoid destructive overwrite."
  exit 1
fi
PREV_SHA="$(git rev-parse HEAD)"
git fetch origin main
TARGET_SHA="$(git rev-parse origin/main)"
if ! git merge-base --is-ancestor "$PREV_SHA" "$TARGET_SHA"; then
  echo "❌ origin/main is not a fast-forward update from current HEAD. Aborting."
  exit 1
fi
git checkout main
git merge --ff-only origin/main

rollback() {
  echo ""
  echo "⚠️  Deploy failed. Rolling back to ${PREV_SHA} ..."
  git checkout "$PREV_SHA"
  docker compose -f docker-compose.production.yml up -d --remove-orphans || true
  pm2 reload deploy/ecosystem.config.cjs --update-env 2>/dev/null || true
  pm2 save || true
}

echo "▸ [2/6] Building backend Docker images..."
docker compose -f docker-compose.production.yml build --parallel

echo "▸ [3/6] Starting/restarting Docker services..."
docker compose -f docker-compose.production.yml up -d --remove-orphans

echo "▸ [4/6] Installing frontend runtime dependencies..."
# Frontends were pre-built in CI and rsynced — just need runtime deps for next start
npm ci --legacy-peer-deps 2>&1 | tail -3

echo "▸ [5/6] Reloading PM2 frontend services..."
pm2 reload deploy/ecosystem.config.cjs --update-env 2>/dev/null \
    || pm2 start deploy/ecosystem.config.cjs
pm2 save

echo "▸ [6/6] Health checks..."
sleep 5

# Check backend readiness (verifies Mongo + Redis connectivity)
if curl -fsS http://127.0.0.1:8010/ready; then
    echo ""
    echo "  ✓ Backend ready (Mongo + Redis connected)"
else
    echo ""
    echo "  ❌ Backend /ready failed!"
    docker compose -f docker-compose.production.yml logs --tail=30 || true
    rollback
    exit 1
fi

# Check frontend services
for port in 3000 3010; do
    if curl -fsS --max-time 5 "http://127.0.0.1:${port}/" > /dev/null 2>&1; then
        echo "  ✓ Frontend on :${port} responding"
    else
        echo "  ⚠ Frontend on :${port} not responding yet (may need a moment)"
    fi
done

# Prune old Docker images
docker image prune -f > /dev/null 2>&1

echo ""
echo "✅ Deploy complete — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
