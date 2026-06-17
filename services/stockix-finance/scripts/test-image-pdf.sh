#!/usr/bin/env bash
# Test script: image upload (S3) + PDF generation (Gotenberg)
# Usage:
#   ./scripts/test-image-pdf.sh
#   API_URL=http://127.0.0.1:4106/api EMAIL=you@example.com PASSWORD=secret ./scripts/test-image-pdf.sh

set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4106/api}"
EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"

# Prompt interactively if not set via env
if [ -z "$EMAIL" ]; then
  printf "Email: " >&2
  read -r EMAIL
fi
if [ -z "$PASSWORD" ]; then
  printf "Password: " >&2
  read -rs PASSWORD
  echo >&2
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}  ✓ PASS${NC} — $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}  ✗ FAIL${NC} — $1"; FAIL=$((FAIL+1)); }
info() { echo -e "${CYAN}  ℹ${NC}  $1"; }
step() { echo -e "\n${YELLOW}▶ $1${NC}"; }

cleanup() {
  [ -f "${TMP_IMG:-}" ] && rm -f "$TMP_IMG"
  [ -f "${TMP_PDF:-}" ] && rm -f "$TMP_PDF"
}
trap cleanup EXIT

# ─────────────────────────────────────────────
# 0. Infrastructure connectivity (no auth needed)
# ─────────────────────────────────────────────
step "Infrastructure — API server"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_URL/auth/signin" -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "000" ]; then
  echo -e "${RED}ERROR: Server not reachable at $API_URL${NC}"
  exit 1
fi
pass "API server reachable at $API_URL (HTTP $HTTP_CODE)"

step "Infrastructure — Gotenberg (inside Docker)"
GOTENBERG_STATUS=$(docker exec stockix-pms-server-1 wget -qO- http://stockix-gotenberg:3000/health 2>/dev/null || echo "UNREACHABLE")
if echo "$GOTENBERG_STATUS" | grep -q '"status":"up"'; then
  pass "Gotenberg healthy — chromium=$(echo "$GOTENBERG_STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['details']['chromium']['status'])" 2>/dev/null || echo '?')"
else
  fail "Gotenberg not reachable from server container — PDF generation will fail"
  info "Run: docker ps | grep gotenberg"
fi

# ─────────────────────────────────────────────
# 1. Authentication
# ─────────────────────────────────────────────
step "Authentication — POST $API_URL/auth/signin"
AUTH_RESP=$(curl -s --max-time 10 -X POST "$API_URL/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"credential\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

ACCESS_TOKEN=$(echo "$AUTH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or d.get('accessToken',''))" 2>/dev/null || echo "")
ORG_ID=$(echo "$AUTH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('organization_id') or d.get('organizationId',''))" 2>/dev/null || echo "")

if [ -z "$ACCESS_TOKEN" ]; then
  fail "Login failed — no access token. Response: $AUTH_RESP"
  exit 1
else
  pass "Login — token obtained, org=$ORG_ID"
fi

AUTH_HEADER="Authorization: Bearer $ACCESS_TOKEN"
ORG_HEADER="organization-id: $ORG_ID"

# ─────────────────────────────────────────────
# 2. Image upload (S3 via POST /attachments)
# ─────────────────────────────────────────────
step "Image Upload — POST $API_URL/attachments"

# Create a minimal valid PNG (1×1 px red pixel)
TMP_IMG=$(mktemp /tmp/test-upload-XXXXXX.png)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$TMP_IMG"

UPLOAD_RESP=$(curl -s --max-time 30 -X POST "$API_URL/attachments" \
  -H "$AUTH_HEADER" \
  -H "$ORG_HEADER" \
  -F "file=@$TMP_IMG;type=image/png" \
  -F "internalKey=$(date +%s)" 2>/dev/null)

UPLOAD_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$API_URL/attachments" \
  -H "$AUTH_HEADER" \
  -H "$ORG_HEADER" \
  -F "file=@$TMP_IMG;type=image/png" \
  -F "internalKey=$(date +%s)" 2>/dev/null)

ATTACH_KEY=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('key',''))" 2>/dev/null || echo "")

if [ "$UPLOAD_HTTP" = "200" ] && [ -n "$ATTACH_KEY" ]; then
  pass "Image upload — HTTP 200, key=$ATTACH_KEY"
elif echo "$UPLOAD_RESP" | grep -qi "S3 configuration error\|Missing.*region\|Missing.*accessKey"; then
  fail "Image upload — S3 not configured: $UPLOAD_RESP"
elif echo "$UPLOAD_RESP" | grep -qi "InvalidAccessKeyId\|NoSuchBucket\|AccessDenied\|SignatureDoesNotMatch"; then
  fail "Image upload — S3 credentials rejected: $UPLOAD_RESP"
else
  fail "Image upload — HTTP $UPLOAD_HTTP. Response: $UPLOAD_RESP"
fi

info "Full upload response: $UPLOAD_RESP"

# ─────────────────────────────────────────────
# 3. PDF generation (Gotenberg via Accept: application/pdf)
# ─────────────────────────────────────────────
step "PDF Generation — GET $API_URL/reports/balance-sheet (Accept: application/pdf)"

TODAY=$(date +%Y-%m-%d)
YEAR_START="${TODAY%-*}-01-01"
# Ensure year_start is always Jan 1 of current year
YEAR_START="$(date +%Y)-01-01"

TMP_PDF=$(mktemp /tmp/test-balance-sheet-XXXXXX.pdf)

PDF_HTTP=$(curl -s -o "$TMP_PDF" -w "%{http_code}" --max-time 60 \
  "$API_URL/reports/balance-sheet?fromDate=$YEAR_START&toDate=$TODAY&basis=accrual" \
  -H "$AUTH_HEADER" \
  -H "$ORG_HEADER" \
  -H "Accept: application/pdf" 2>/dev/null)

PDF_SIZE=$(wc -c < "$TMP_PDF" 2>/dev/null || echo 0)
PDF_MAGIC=$(head -c 4 "$TMP_PDF" 2>/dev/null | cat -v || echo "")

if [ "$PDF_HTTP" = "200" ] && echo "$PDF_MAGIC" | grep -q "%PDF"; then
  pass "PDF generation — HTTP 200, valid PDF (${PDF_SIZE} bytes)"
elif [ "$PDF_HTTP" = "200" ] && [ "$PDF_SIZE" -gt 100 ]; then
  pass "PDF generation — HTTP 200, ${PDF_SIZE} bytes received (magic: $PDF_MAGIC)"
elif [ "$PDF_HTTP" = "500" ]; then
  ERR=$(cat "$TMP_PDF" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','unknown'))" 2>/dev/null || cat "$TMP_PDF")
  fail "PDF generation — HTTP 500: $ERR"
  info "Check: is Gotenberg reachable from the server container? (GOTENBERG_URL env)"
  info "Run: docker exec stockix-pms-server-1 curl -s http://stockix-gotenberg:3000/health"
else
  fail "PDF generation — HTTP $PDF_HTTP, size=${PDF_SIZE}. Body: $(cat "$TMP_PDF" | head -c 200)"
fi

# ─────────────────────────────────────────────
# 4. Summary
# ─────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────"
echo -e "Results: ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  (total $((PASS+FAIL)))"
echo "──────────────────────────────────────────"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
