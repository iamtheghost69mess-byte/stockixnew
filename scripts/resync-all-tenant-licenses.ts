/**
 * Re-syncs license data to finance server for all tenants with a canonical license.
 * Run after Fix #5 to push corrected limit values from license rows.
 *
 * Run from repo root: pnpm exec tsx scripts/resync-all-tenant-licenses.ts
 * Safe to run multiple times.
 */
import { apiConfig } from "@repo/config";
import { createDb } from "@repo/db";
import { tenants } from "@repo/db/schema";
import { triggerFinanceLicenseSync } from "../apps/api/src/license-finance-sync.js";
import { getActiveLicenseForTenant } from "../apps/api/src/license-utils.js";

async function resyncAll() {
  const url = apiConfig.databaseUrl;
  if (!url) {
    console.error("[ResyncAll] DATABASE_URL is not set");
    process.exit(1);
  }

  const db = createDb(url);
  console.log("[ResyncAll] Starting finance license re-sync...");

  const allTenants = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants);

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const tenant of allTenants) {
    const license = await getActiveLicenseForTenant(db, tenant.id);
    if (!license) {
      console.log(`[ResyncAll] Skipped ${tenant.slug} — no license`);
      skipped++;
      continue;
    }

    try {
      await triggerFinanceLicenseSync(db, tenant.id, (message) => console.log(message));
      console.log(`[ResyncAll] Synced ${tenant.slug}`);
      synced++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ResyncAll] Failed ${tenant.slug}:`, message);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[ResyncAll] Done. Synced: ${synced}, Skipped: ${skipped}, Failed: ${failed}`);
}

resyncAll().catch((err) => {
  console.error("[ResyncAll] Fatal:", err);
  process.exit(1);
});
