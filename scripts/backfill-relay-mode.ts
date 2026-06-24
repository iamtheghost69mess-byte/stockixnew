/**
 * One-time backfill: enables accountingRelayMode and stores financeUrl on the
 * POS org for every active tenant that already has the Finance (accounting) module.
 *
 * Context: prior to the ISSUE-004 fix, add_module completions did not call the POS
 * platform API. This script performs that call retroactively for all existing tenants.
 *
 * Run from repo root:
 *   pnpm exec tsx scripts/backfill-relay-mode.ts
 *
 * Flags:
 *   --dry-run   Print what would change without calling the POS API (default: false)
 *   --slug <s>  Process only the tenant with this slug (for targeted testing)
 *
 * Prerequisites:
 *   DATABASE_URL               — control-plane Postgres connection string
 *   POS_PLATFORM_BASE_URL      — POS backend base URL (e.g. http://localhost:8010)
 *   POS_PLATFORM_API_KEY       — platform API key with ORG_WRITE scope
 *   ROOT_DOMAIN                — subdomain root for Finance URL construction (e.g. finance.example.com)
 *   PUBLIC_BASE_URL_SCHEME     — "https" (default) or "http"
 *
 * Safe to run multiple times — sets are idempotent on the POS side.
 */

import { createDb } from "@repo/db";
import { tenants, tenantDeployments } from "@repo/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
const POS_PLATFORM_BASE_URL = (process.env.POS_PLATFORM_BASE_URL ?? "").trim();
const POS_PLATFORM_API_KEY = (process.env.POS_PLATFORM_API_KEY ?? "").trim();
const ROOT_DOMAIN = (process.env.ROOT_DOMAIN ?? "").trim();
const SCHEME = (process.env.PUBLIC_BASE_URL_SCHEME ?? "https").trim();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SLUG_FILTER = (() => {
  const idx = args.indexOf("--slug");
  return idx !== -1 ? args[idx + 1] : null;
})();

// ─── Validation ──────────────────────────────────────────────────────────────

function abort(msg: string): never {
  console.error(`[backfill-relay-mode] ERROR: ${msg}`);
  process.exit(1);
}

if (!DATABASE_URL) abort("DATABASE_URL is not set");
if (!POS_PLATFORM_BASE_URL) abort("POS_PLATFORM_BASE_URL is not set");
if (!POS_PLATFORM_API_KEY) abort("POS_PLATFORM_API_KEY is not set");

// ─── POS platform HTTP helpers ───────────────────────────────────────────────

async function posPut(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${POS_PLATFORM_BASE_URL}/api/platform/v1${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": POS_PLATFORM_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// ─── Finance URL construction ─────────────────────────────────────────────────

function buildFinanceUrl(slug: string): string | null {
  if (!ROOT_DOMAIN) return null;
  return `${SCHEME}://${slug}.${ROOT_DOMAIN}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = createDb(DATABASE_URL!);

  console.log(`[backfill-relay-mode] mode=${DRY_RUN ? "DRY RUN" : "LIVE"}${SLUG_FILTER ? ` slug-filter=${SLUG_FILTER}` : ""}`);
  if (!ROOT_DOMAIN) {
    console.warn("[backfill-relay-mode] WARN: ROOT_DOMAIN not set — financeUrl will be skipped");
  }

  // Fetch all active tenants that have the accounting module provisioned.
  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      modules: tenants.modules,
      status: tenants.status,
      posOrganizationId: tenantDeployments.posOrganizationId,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(and(eq(tenants.status, "active"), isNotNull(tenantDeployments.posOrganizationId)));

  const targets = rows.filter((row) => {
    if (SLUG_FILTER && row.slug !== SLUG_FILTER) return false;
    try {
      const mods: unknown = JSON.parse(row.modules ?? "[]");
      return Array.isArray(mods) && mods.includes("accounting");
    } catch {
      return false;
    }
  });

  console.log(`[backfill-relay-mode] ${targets.length} tenant(s) require relay mode enablement`);
  if (targets.length === 0) {
    console.log("[backfill-relay-mode] Nothing to do.");
    return;
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const tenant of targets) {
    const posOrgId = tenant.posOrganizationId!;
    const financeUrl = buildFinanceUrl(tenant.slug);
    const label = `${tenant.slug} (posOrgId=${posOrgId})`;

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would enable relay mode for ${label}` +
        (financeUrl ? ` and set financeUrl=${financeUrl}` : " (no financeUrl — ROOT_DOMAIN not set)"));
      skipped++;
      continue;
    }

    // Enable relay mode
    const relayResult = await posPut(
      `/organizations/${encodeURIComponent(posOrgId)}/accounting-mode`,
      { relayMode: true },
    ).catch((err: unknown) => ({ ok: false, status: 0, data: String(err) }));

    if (!relayResult.ok) {
      console.error(`[backfill-relay-mode] FAILED relay mode for ${label} — status=${relayResult.status}`, relayResult.data);
      failed++;
      continue;
    }
    console.log(`[backfill-relay-mode] ✓ relay mode enabled for ${label}`);

    // Store Finance URL
    if (financeUrl) {
      const urlResult = await posPut(
        `/organizations/${encodeURIComponent(posOrgId)}/finance-url`,
        { financeUrl },
      ).catch((err: unknown) => ({ ok: false, status: 0, data: String(err) }));

      if (!urlResult.ok) {
        console.warn(`[backfill-relay-mode] WARN: financeUrl set failed for ${label} — status=${urlResult.status}`);
      } else {
        console.log(`[backfill-relay-mode] ✓ financeUrl set for ${label} → ${financeUrl}`);
      }
    }

    succeeded++;
  }

  console.log(`\n[backfill-relay-mode] Done — succeeded=${succeeded} failed=${failed}${DRY_RUN ? ` dry-run-skipped=${skipped}` : ""}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[backfill-relay-mode] Fatal:", err);
  process.exit(1);
});
