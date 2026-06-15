#!/usr/bin/env bash
# Verify shared data-plane stack matches production-readiness expectations.
# Usage (on host with Docker):
#   bash scripts/verify-shared-infra.sh
set -euo pipefail

MYSQL_CONTAINER="${HEALTH_MYSQL_CONTAINER:-stockix-shared-stockix-mysql-1}"
REDIS_CONTAINER="${HEALTH_REDIS_CONTAINER:-stockix-shared-stockix-redis-1}"
PROXY_CONTAINER="${MYSQL_PROXY_CONTAINER:-stockix-shared-stockix-mysql-proxy-1}"

fail=0

check() {
  if "$@"; then
    echo "OK  $*"
  else
    echo "FAIL $*"
    fail=1
  fi
}

echo "=== MySQL max_connections (expect >= 1000) ==="
if docker exec "$MYSQL_CONTAINER" mysql -N -uroot -p"${SHARED_MYSQL_ROOT_PASSWORD:?SHARED_MYSQL_ROOT_PASSWORD required}" \
  -e "SHOW VARIABLES LIKE 'max_connections';" 2>/dev/null | awk '{print $2}' | grep -Eq '^[0-9]+$'; then
  max_conn="$(docker exec "$MYSQL_CONTAINER" mysql -N -uroot -p"$SHARED_MYSQL_ROOT_PASSWORD" \
    -e "SHOW VARIABLES LIKE 'max_connections';" 2>/dev/null | awk '{print $2}')"
  echo "max_connections=$max_conn"
  if [ "$max_conn" -lt 1000 ]; then fail=1; fi
else
  echo "FAIL could not read max_connections from $MYSQL_CONTAINER"
  fail=1
fi

echo "=== ProxySQL admin ping (6033) ==="
check docker exec "$PROXY_CONTAINER" mysql -h127.0.0.1 -P6033 -uroot -p"$SHARED_MYSQL_ROOT_PASSWORD" -e "SELECT 1" >/dev/null 2>&1

echo "=== Tenant Redis AUTH + memory policy ==="
if [ -z "${TENANT_REDIS_PASSWORD:-}" ]; then
  echo "FAIL TENANT_REDIS_PASSWORD unset"
  fail=1
else
  check docker exec "$REDIS_CONTAINER" redis-cli -a "$TENANT_REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG
  policy="$(docker exec "$REDIS_CONTAINER" redis-cli -a "$TENANT_REDIS_PASSWORD" CONFIG GET maxmemory-policy 2>/dev/null | tail -1)"
  echo "maxmemory-policy=$policy (expect noeviction)"
  if [ "$policy" != "noeviction" ]; then fail=1; fi
fi

echo "=== MySQL Threads_connected ==="
threads="$(docker exec "$MYSQL_CONTAINER" mysql -N -uroot -p"$SHARED_MYSQL_ROOT_PASSWORD" \
  -e "SHOW GLOBAL STATUS LIKE 'Threads_connected';" 2>/dev/null | awk '{print $2}')"
echo "Threads_connected=$threads (alert if > 800 sustained)"

if [ "$fail" -eq 0 ]; then
  echo "PASS shared infra verification"
  exit 0
fi
echo "FAIL shared infra verification — see OPERATIONS.md P0 sections"
exit 1
