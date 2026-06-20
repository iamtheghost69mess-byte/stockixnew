#!/usr/bin/env bash
# Run tsc --noEmit across every TypeScript package in the monorepo.
# Usage: bash scripts/typecheck-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PACKAGES=(
  "apps/api"
  "apps/dashboard"
  "infra/worker-service"
  "packages/auth"
  "packages/config"
  "packages/db"
  "packages/platform-worker-shared"
  "packages/shared"
  "packages/ui"
  "services/pms"
  "services/pms/frontend"
)

PASS=()
FAIL=()

for pkg in "${PACKAGES[@]}"; do
  dir="$ROOT/$pkg"
  if [ ! -f "$dir/tsconfig.json" ]; then
    echo "⚠️  SKIP  $pkg  (no tsconfig.json)"
    continue
  fi
  printf "🔍 Checking %-45s ... " "$pkg"
  output=$(cd "$dir" && npx tsc --noEmit 2>&1) || true
  errors=$(echo "$output" | grep "error TS" | wc -l | tr -d ' ')
  if [ "$errors" -eq 0 ]; then
    echo "✅ OK"
    PASS+=("$pkg")
  else
    echo "❌ $errors error(s)"
    echo "$output" | grep "error TS" | head -20 | sed 's/^/    /'
    FAIL+=("$pkg")
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${#PASS[@]} passed, ${#FAIL[@]} failed"
if [ ${#FAIL[@]} -gt 0 ]; then
  echo "Failed packages:"
  for f in "${FAIL[@]}"; do echo "  ❌ $f"; done
  exit 1
else
  echo "All packages passed! ✅"
fi
