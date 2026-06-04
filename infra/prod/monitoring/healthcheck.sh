#!/bin/bash
# Shared infrastructure health probe (MySQL, Mongo RS, Redis).
# Exit 0 when all checks pass; exit 1 and optionally alert on failure.
set -euo pipefail

MYSQL_CONTAINER="${HEALTH_MYSQL_CONTAINER:-stockix-shared-stockix-mysql-1}"
MONGO_CONTAINER="${HEALTH_MONGO_CONTAINER:-stockix-shared-stockix-mongo-1}"
REDIS_CONTAINER="${HEALTH_REDIS_CONTAINER:-stockix-shared-stockix-redis-1}"
MYSQL_ROOT_PASSWORD="${SHARED_MYSQL_ROOT_PASSWORD:-}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

FAILURES=()

check_mysql() {
  if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    FAILURES+=("mysql: SHARED_MYSQL_ROOT_PASSWORD unset")
    return 1
  fi
  docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$MYSQL_CONTAINER" \
    mysqladmin ping -h 127.0.0.1 -uroot --silent >/dev/null 2>&1
}

check_mongo() {
  local ok
  ok=$(docker exec "$MONGO_CONTAINER" mongosh --quiet --eval \
    'try { rs.status().ok } catch (e) { 0 }' 2>/dev/null | tr -d '\r\n')
  [ "$ok" = "1" ]
}

check_redis() {
  docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG
}

send_alert() {
  local message="$1"
  echo "[healthcheck] ALERT: $message"
  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    curl -sfS -X POST "$ALERT_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "$(printf '{"text":"%s"}' "$(echo "$message" | sed 's/"/\\"/g')")" \
      >/dev/null 2>&1 || echo "[healthcheck] WARN: webhook POST failed"
  fi
}

echo "[healthcheck] $(date -u +%Y-%m-%dT%H:%M:%SZ) Starting checks..."

if ! check_mysql; then
  FAILURES+=("mysql: ping failed ($MYSQL_CONTAINER)")
fi

if ! check_mongo; then
  FAILURES+=("mongo: replica set not OK ($MONGO_CONTAINER)")
fi

if ! check_redis; then
  FAILURES+=("redis: PING failed ($REDIS_CONTAINER)")
fi

if [ "${#FAILURES[@]}" -gt 0 ]; then
  MSG="Stockix shared infra health FAILED: ${FAILURES[*]}"
  send_alert "$MSG"
  echo "[healthcheck] $MSG"
  exit 1
fi

echo "[healthcheck] All checks passed."
exit 0
