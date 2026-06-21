#!/usr/bin/env bash
# Phase 1 checkpoint (phases.md): register → login → token → 403 on wrong role.
# Requires: MongoDB, .env with JWT_SECRET, running server (npm run dev).
# Usage: ADMIN_PIN=1234 WAITER_PIN=5678 ./scripts/phase1-check.sh
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:8000}"
ADMIN_PIN="${ADMIN_PIN:?Set ADMIN_PIN (bootstrap admin PIN)}"
WAITER_PIN="${WAITER_PIN:?Set WAITER_PIN (4-6 digits for created waiter)}"

echo "=== Phase 1 API checks against ${BASE_URL} ==="

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "--- 1) Admin login (PIN) ---"
RES="$(curl -sS -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"${ADMIN_PIN}\"}")"
echo "$RES" | head -c 400
echo
ACCESS="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.accessToken||'');" "$RES")"
test -n "$ACCESS"
echo "Got access token (${#ACCESS} chars)."

STAMP="$(date +%s)"
EMAIL="phase1_waiter_${STAMP}@test.local"

echo "--- 2) Admin-only register (email user) ---"
REG="$(curl -sS -X POST "${BASE_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS}" \
  -d "{\"name\":\"Phase1 Waiter\",\"email\":\"${EMAIL}\",\"password\":\"password12\",\"role\":\"waiter\",\"pin\":\"${WAITER_PIN}\"}")"
echo "$REG" | head -c 300
echo
node -e "const j=JSON.parse(process.argv[1]); if(!j.success) process.exit(1);" "$REG"

echo "--- 3) Waiter login email/password ---"
WRES="$(curl -sS -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"password12\"}")"
WACCESS="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.accessToken||'');" "$WRES")"
test -n "$WACCESS"
echo "Waiter access OK (${#WACCESS} chars)."

echo "--- 4) Wrong role: waiter -> GET /api/users -> expect 403 ---"
CODE="$(curl -sS -o "$TMP" -w "%{http_code}" -H "Authorization: Bearer ${WACCESS}" "${BASE_URL}/api/users")"
cat "$TMP"
echo
if [[ "$CODE" != "403" ]]; then
  echo "FAIL: expected HTTP 403, got ${CODE}"
  exit 1
fi

echo "--- 5) Refresh ---"
REFRESH="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.refreshToken||'');" "$WRES")"
RRES="$(curl -sS -X POST "${BASE_URL}/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"${REFRESH}\"}")"
node -e "const j=JSON.parse(process.argv[1]); if(!j.accessToken) process.exit(1);" "$RRES"
echo "Refresh OK."

echo "=== Phase 1 API checks PASSED ==="
