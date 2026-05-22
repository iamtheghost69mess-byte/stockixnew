#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo "PASS: $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_pattern() {
  local label="$1"
  local pattern="$2"
  local path="$3"
  if node -e "const fs=require('fs');const p=process.argv[1];const r=new RegExp(process.argv[2]);const s=fs.readFileSync(p,'utf8');process.exit(r.test(s)?0:1)" "$path" "$pattern" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label"
  fi
}

echo "== Printer Phases Verification =="

echo "-- Phase 1: Queue + USB/BT foundations --"
check_pattern "PrintJob model has queueJobId" "queueJobId" "apps/pos-backend/models/printJobModel.js"
check_pattern "Printer model includes usb/bluetooth fields" "usbVendorId|usbProductId|bluetoothAddress" "apps/pos-backend/models/printerModel.js"
check_pattern "Order printing references print-jobs queue" "\"print-jobs\"" "apps/pos-backend/services/orderPrinting.js"
check_pattern "Order printing uses addJob API" "addJob\\(" "apps/pos-backend/services/orderPrinting.js"
check_pattern "Print worker uses usb adapter" "@node-escpos/usb-adapter|new USB\\(" "apps/pos-backend/workers/printWorker.js"
check_pattern "Socket printer register event exists" "printer:register" "apps/pos-backend/app.js"

echo "-- Phase 2: Registration UX --"
check_pattern "Driver hidden for epson-epos" "watch\\(\"type\"\\) !== \"epson-epos\"" "apps/pos-frontend2/src/app/(main)/dashboard/printers/page.tsx"
check_pattern "Per-printer status check action exists" "handleCheckStatus" "apps/pos-frontend2/src/app/(main)/dashboard/printers/page.tsx"

echo "-- Phase 3: Reliability hardening --"
check_pattern "Retry endpoint wired in route" ":id/retry" "apps/pos-backend/routes/printJobRoute.js"
check_pattern "Retry controller exists" "const retryPrintJob" "apps/pos-backend/controllers/printJobController.js"
check_pattern "Idempotent ack conflict guard exists" "already_terminal|Conflicting ack ignored|conflict" "apps/pos-backend/controllers/printJobController.js"

echo "-- Phase 4: Offline foundation --"
check_pattern "Service worker file exists and listens fetch" "addEventListener\\(\"fetch\"" "apps/pos-frontend2/public/sw.js"
check_pattern "Offline queue utility exists" "enqueueOfflineMutation|listOfflineMutations" "apps/pos-frontend2/src/lib/offline-queue.ts"
check_pattern "Sync manager flushes queue" "flushOfflineMutationQueue" "apps/pos-frontend2/src/components/pos/sync-manager.tsx"

echo "-- Phase 5: Professional operations UX --"
check_pattern "POS session mounts offline banner" "OfflineStatusBanner" "apps/pos-frontend2/src/app/(main)/pos/_components/pos-table-session-page.tsx"
check_pattern "Printer assistant includes backend discovery" "Run Backend Discovery|posDiscoverPrinters" "apps/pos-frontend2/src/app/(main)/dashboard/printers/page.tsx"
check_pattern "Change review confirmation exists" "Review Printer Changes|Confirm & Save" "apps/pos-frontend2/src/app/(main)/dashboard/printers/page.tsx"

echo "-- Runtime safety checks --"
if node --check "apps/pos-backend/controllers/printerController.js" >/dev/null 2>&1; then
  pass "Backend printer controller syntax"
else
  fail "Backend printer controller syntax"
fi

if node --check "apps/pos-backend/controllers/printJobController.js" >/dev/null 2>&1; then
  pass "Backend print job controller syntax"
else
  fail "Backend print job controller syntax"
fi

if npx tsc --noEmit -p "apps/pos-frontend2/tsconfig.json" >/dev/null 2>&1; then
  pass "Frontend TypeScript check"
else
  fail "Frontend TypeScript check"
fi

echo "== Result: ${PASS_COUNT} passed, ${FAIL_COUNT} failed =="
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
