#!/bin/bash
set -e

# Ark-Tenders Deployment Script
# This script handles Docker orchestration for the backend and PM2 for the frontends.

PROJECT_DIR="/home/deploy/posnew"
cd $PROJECT_DIR

echo "🚀 [Deploy] Starting deployment..."

# 1. Update Docker Services (Backend, Worker, Redis)
echo "📦 [Deploy] Orchestrating Docker containers..."
docker compose -f docker-compose.production.yml up -d --build

# 2. PM2 Readiness Check
echo "🏗️ [Deploy] Verifying PM2 processes..."

# If .next directories exist (either from CI sync or previous build), start/reload apps
if [ -d "apps/pos-frontend2/.next" ] || [ -d "apps/saas-dash/.next" ]; then
    echo "🔄 [Deploy] Reloading PM2 processes..."
    pm2 startOrReload ecosystem.config.js --update-env
else
    echo "⚠️ [Deploy] No frontend builds found. Please build them or sync .next folders."
fi

# 3. Cleanup
echo "🧹 [Deploy] Cleaning up old images..."
docker image prune -f

echo "✅ [Deploy] Done! Backend is on :8010, Frontends on :3000, :3010."
