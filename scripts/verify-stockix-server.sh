#!/usr/bin/env bash
# Run on the VPS after deploy: checks Docker services and optional HTTPS health.
# Usage: STOCKIX_ROOT=/opt/stockix/stockixnew bash scripts/verify-stockix-server.sh
# Or from repo: bash scripts/verify-stockix-server.sh

set -euo pipefail

STOCKIX_ROOT="${STOCKIX_ROOT:-/opt/stockix/stockixnew}"
PROD="${STOCKIX_ROOT}/infra/prod"

if [[ ! -f "${PROD}/docker-compose.yml" ]]; then
  echo "ERROR: ${PROD}/docker-compose.yml not found. Set STOCKIX_ROOT to your clone path."
  exit 1
fi

if [[ ! -f "${PROD}/.env" ]]; then
  echo "ERROR: ${PROD}/.env missing — copy from .env.example and fill secrets."
  exit 1
fi

cd "${PROD}"
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "=== docker compose ps ==="
docker compose --env-file .env ps

echo ""
echo "=== required services running ==="
required_services=(postgres traefik api dashboard infra-worker)
for service in "${required_services[@]}"; do
  if docker compose --env-file .env ps --status running | grep -q "${service}"; then
    echo "OK: ${service} is running"
  else
    echo "ERROR: ${service} is not running"
    docker compose --env-file .env logs "${service}" --tail 80 || true
    exit 1
  fi
done

echo ""
echo "=== listening on 80 / 443 (host) ==="
ss -tlnp | grep -E ':80 |:443 ' || true

echo ""
echo "=== API health inside api container (port 4000) ==="
if docker compose --env-file .env exec -T api node -e \
  "fetch('http://127.0.0.1:4000/health').then(r=>r.text()).then(console.log).catch(e=>{console.error(e);process.exit(1)})" \
  2>/dev/null; then
  :
else
  echo "(api health check failed — see: docker compose logs api)"
fi

echo ""
if [[ -n "${ROOT_DOMAIN:-}" ]]; then
  echo "=== public HTTPS checks (need DNS → this host + certs issued) ==="
  curl -sfS --max-time 15 "https://api.${ROOT_DOMAIN}/ready" && echo "" || echo "WARN: https://api.${ROOT_DOMAIN}/ready failed (readiness not yet healthy)."
  curl -sfS --max-time 15 "https://api.${ROOT_DOMAIN}/health" && echo "" || echo "WARN: https://api.${ROOT_DOMAIN}/health failed (DNS, firewall, or TLS not ready)."
  curl -sfS --max-time 15 -o /dev/null -w "dashboard HTTP %{http_code}\n" "https://${ROOT_DOMAIN}/" || echo "WARN: https://${ROOT_DOMAIN}/ failed."
fi

echo ""
echo "Done. If anything failed: docker compose --env-file .env logs traefik api dashboard postgres --tail 80"
