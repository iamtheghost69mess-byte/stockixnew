/**
 * One-time backfill: copy plan limits to existing license rows
 * that still have default maxOrganizations = 1.
 *
 * Run from repo root: pnpm exec tsx scripts/backfill-license-limits.ts
 * Safe to run multiple times (idempotent).
 */
import { apiConfig } from "@repo/config";
import { createDb } from "@repo/db";
import { licenses, plans } from "@repo/db/schema";
import { eq } from "drizzle-orm";

async function backfill() {
  const url = apiConfig.databaseUrl;
  if (!url) {
    console.error("[Backfill] DATABASE_URL is not set");
    process.exit(1);
  }

  const db = createDb(url);
  console.log("[Backfill] Starting license limits backfill...");

  const allLicenses = await db
    .select({
      id: licenses.id,
      planSlug: licenses.planSlug,
      maxOrganizations: licenses.maxOrganizations,
      maxActivations: licenses.maxActivations,
    })
    .from(licenses);

  const allPlans = await db.select().from(plans);
  const planMap = Object.fromEntries(allPlans.map((p) => [p.slug, p]));

  let updated = 0;
  let skipped = 0;

  for (const license of allLicenses) {
    const plan = planMap[license.planSlug];
    if (!plan) {
      console.warn(`[Backfill] No plan found for slug: ${license.planSlug}`);
      skipped++;
      continue;
    }

    const needsOrg =
      license.maxOrganizations === 1 && plan.maxOrganizations !== 1;
    const needsAct =
      license.maxActivations === 1 && plan.maxActivations !== 1;

    if (!needsOrg && !needsAct) {
      skipped++;
      continue;
    }

    await db
      .update(licenses)
      .set({
        maxOrganizations: plan.maxOrganizations,
        maxActivations: plan.maxActivations,
        updatedAt: new Date(),
      })
      .where(eq(licenses.id, license.id));
    updated++;
    console.log(
      `[Backfill] Updated license ${license.id} (${license.planSlug}) → orgs=${plan.maxOrganizations}, activations=${plan.maxActivations}`,
    );
  }

  console.log(`[Backfill] Done. Updated: ${updated}, Skipped: ${skipped}`);
}

backfill().catch((err) => {
  console.error("[Backfill] Failed:", err);
  process.exit(1);
});
