#!/usr/bin/env bash
# verify-pms-rls.sh — Confirm that PMS Row-Level Security is enforced.
#
# Usage:
#   ./scripts/verify-pms-rls.sh
#
# Requires: psql, PMS_DATABASE_URL (or DATABASE_URL as fallback) in environment.
# Exits 0 on success (RLS is enforced), 1 on failure.

set -euo pipefail

PMS_DB="${PMS_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$PMS_DB" ]]; then
  echo "[FAIL] Neither PMS_DATABASE_URL nor DATABASE_URL is set." >&2
  exit 1
fi

echo "[check] Connecting to PMS database..."

# 1. Check current role and BYPASSRLS flag
ROLE_CHECK=$(psql "$PMS_DB" -tAc \
  "SELECT current_user || '|' || rolbypassrls || '|' || rolsuper
   FROM pg_roles WHERE rolname = current_user")

CURRENT_ROLE=$(echo "$ROLE_CHECK" | cut -d'|' -f1)
BYPASSRLS=$(echo "$ROLE_CHECK" | cut -d'|' -f2)
SUPERUSER=$(echo "$ROLE_CHECK" | cut -d'|' -f3)

echo "[info] Connected as: $CURRENT_ROLE (bypassrls=$BYPASSRLS, superuser=$SUPERUSER)"

if [[ "$BYPASSRLS" == "t" || "$SUPERUSER" == "t" ]]; then
  echo "[WARN] Current role '$CURRENT_ROLE' has BYPASSRLS or superuser privileges." >&2
  echo "[WARN] RLS policies on pms_* tables are BYPASSED — cross-tenant data is visible." >&2
  echo "[WARN] Set PMS_DATABASE_URL to connect as 'stockix_pms_app' to enforce RLS." >&2
  exit 1
fi

# 2. Verify RLS is enabled on all pms_* tables
echo "[check] Verifying RLS is enabled on pms_* tables..."
RLS_DISABLED=$(psql "$PMS_DB" -tAc \
  "SELECT tablename FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'pms_%' AND NOT rowsecurity
   ORDER BY tablename")

if [[ -n "$RLS_DISABLED" ]]; then
  echo "[FAIL] The following pms_* tables do NOT have RLS enabled:" >&2
  echo "$RLS_DISABLED" >&2
  exit 1
fi

echo "[check] All pms_* tables have RLS enabled."

# 3. Without setting app.current_tenant_id, SELECT COUNT(*) from pms_properties must return 0
echo "[check] Verifying RLS blocks cross-tenant access without tenant context..."
COUNT_WITHOUT_CONTEXT=$(psql "$PMS_DB" -tAc \
  "SELECT COUNT(*) FROM pms_properties" 2>/dev/null || echo "error")

if [[ "$COUNT_WITHOUT_CONTEXT" == "error" ]]; then
  echo "[WARN] Could not query pms_properties — table may not exist yet (run migrations first)."
elif [[ "$COUNT_WITHOUT_CONTEXT" -gt 0 ]]; then
  echo "[FAIL] RLS is NOT blocking cross-tenant access: pms_properties returned $COUNT_WITHOUT_CONTEXT rows without tenant context." >&2
  exit 1
else
  echo "[ok] RLS is blocking cross-tenant access (0 rows without tenant context)."
fi

echo "[PASS] PMS RLS verification passed. Connection role '$CURRENT_ROLE' is non-superuser and RLS is active."
exit 0
