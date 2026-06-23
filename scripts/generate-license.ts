/**
 * License generator for Stockix tenants.
 *
 * Generates a license for any module combination, assigns it to a tenant
 * (or creates an unassigned pool key), and prints a summary.
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-license.ts [options]
 *
 * Options:
 *   --tenant <slug|id>    Tenant to assign the license to (omit for unassigned pool key)
 *   --plan   <slug>       Plan slug: starter | growth | pro | enterprise  (default: starter)
 *   --modules <list>      Comma-separated: accounting,pos,pms,chat        (default: accounting)
 *   --term <days>         Validity in days                                (default: 365)
 *   --perpetual           Create a never-expiring license
 *   --location <id>       POS/PMS location ObjectId (required for STXI key format)
 *   --dry-run             Print what would be created, skip DB insert
 *   --force               Replace an existing active license for the tenant
 *
 * Examples:
 *   # Finance-only 1-year license for tenant "acme"
 *   pnpm exec tsx scripts/generate-license.ts --tenant acme --plan starter
 *
 *   # Finance + POS perpetual license with STXI key
 *   pnpm exec tsx scripts/generate-license.ts --tenant acme --plan pro \
 *     --modules accounting,pos --perpetual --location 507f1f77bcf86cd799439011
 *
 *   # All modules, 2-year enterprise license
 *   pnpm exec tsx scripts/generate-license.ts --tenant acme --plan enterprise \
 *     --modules accounting,pos,pms,chat --term 730
 *
 *   # Unassigned pool key (assign to tenant later via the dashboard)
 *   pnpm exec tsx scripts/generate-license.ts --plan growth --modules accounting,pos
 */

import { randomBytes } from "node:crypto";
import { apiConfig } from "@repo/config";
import { createDb } from "@repo/db";
import { licenses, plans, tenants } from "@repo/db/schema";
import { eq, and, or } from "drizzle-orm";
import { generateStxiLicenseKey } from "../packages/shared/src/stxi-license-key.js";

// ─── types ────────────────────────────────────────────────────────────────────

const VALID_MODULES = ["accounting", "pos", "pms", "chat"] as const;
type Module = (typeof VALID_MODULES)[number];

const VALID_PLANS = ["starter", "growth", "pro", "enterprise"] as const;

// ─── key generation (mirrors apps/api/src/license-utils.ts) ───────────────────

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateStkxKey(): string {
  const bytes = randomBytes(12);
  let raw = "";
  for (const b of bytes) raw += CHARSET[b! % CHARSET.length];
  return `STKX-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function pickKeyFormat(modules: Module[], locationId: string | null): {
  licenseKey: string;
  keyFormat: "stkx" | "stxi";
  scopedLocationId: string | null;
} {
  const needsLocation = modules.includes("pos") || modules.includes("pms");
  if (needsLocation && locationId) {
    return {
      licenseKey: generateStxiLicenseKey({
        tenantId: "UNSCOPED",      // overridden below when tenant is known
        locationId,
        secret: apiConfig.licenseSigningSecret,
      }),
      keyFormat: "stxi",
      scopedLocationId: locationId,
    };
  }
  return { licenseKey: generateStkxKey(), keyFormat: "stkx", scopedLocationId: null };
}

// ─── args ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1]! : null;
  };
  const has = (flag: string) => args.includes(flag);

  const rawModules = (get("--modules") ?? "accounting")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean) as Module[];

  const invalidMods = rawModules.filter((m) => !(VALID_MODULES as readonly string[]).includes(m));
  if (invalidMods.length > 0) {
    console.error(`[generate-license] Unknown module(s): ${invalidMods.join(", ")}`);
    console.error(`  Valid: ${VALID_MODULES.join(", ")}`);
    process.exit(1);
  }

  const plan = (get("--plan") ?? "starter") as string;
  if (!(VALID_PLANS as readonly string[]).includes(plan)) {
    console.error(`[generate-license] Unknown plan: ${plan}`);
    console.error(`  Valid: ${VALID_PLANS.join(", ")}`);
    process.exit(1);
  }

  return {
    tenantRef:  get("--tenant"),
    plan,
    modules:    rawModules,
    termDays:   parseInt(get("--term") ?? "365", 10),
    perpetual:  has("--perpetual"),
    locationId: get("--location"),
    dryRun:     has("--dry-run"),
    force:      has("--force"),
  };
}

// ─── collision-safe insert ─────────────────────────────────────────────────────

async function uniqueKey(
  db: ReturnType<typeof createDb>,
  modules: Module[],
  locationId: string | null,
  tenantId: string | null,
): Promise<{ licenseKey: string; keyFormat: "stkx" | "stxi"; scopedLocationId: string | null }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    // For STXI keys we use the real tenantId once we have it
    const needsLocation = (modules.includes("pos") || modules.includes("pms")) && locationId;
    let generated: ReturnType<typeof pickKeyFormat>;
    if (needsLocation && tenantId) {
      generated = {
        licenseKey: generateStxiLicenseKey({
          tenantId,
          locationId: locationId!,
          secret: apiConfig.licenseSigningSecret,
        }),
        keyFormat: "stxi",
        scopedLocationId: locationId,
      };
    } else {
      generated = pickKeyFormat(modules, locationId);
    }

    const clash = await db
      .select({ id: licenses.id })
      .from(licenses)
      .where(eq(licenses.licenseKey, generated.licenseKey))
      .limit(1);
    if (clash.length === 0) return generated;
    if (generated.keyFormat === "stxi") {
      // STXI keys are deterministic — clash means key already exists for this tenant+location
      console.warn("[generate-license] STXI key already exists for this tenant+location. Use --force to replace.");
      process.exit(1);
    }
  }
  throw new Error("Could not generate a unique license key after 5 attempts");
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  const url = apiConfig.databaseUrl;
  if (!url) { console.error("[generate-license] DATABASE_URL is not set"); process.exit(1); }

  const db = createDb(url);

  // 1. Resolve tenant (optional)
  let tenantId: string | null = null;
  let tenantSlug: string | null = null;

  if (opts.tenantRef) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(opts.tenantRef);
    const [row] = await db
      .select({ id: tenants.id, slug: tenants.slug, status: tenants.status })
      .from(tenants)
      .where(isUuid ? eq(tenants.id, opts.tenantRef) : eq(tenants.slug, opts.tenantRef))
      .limit(1);

    if (!row) {
      console.error(`[generate-license] Tenant not found: ${opts.tenantRef}`);
      process.exit(1);
    }
    tenantId   = row.id;
    tenantSlug = row.slug;
    console.log(`[generate-license] Tenant: ${row.slug} (${row.id}) — status: ${row.status}`);
  } else {
    console.log("[generate-license] No --tenant given — creating unassigned pool key");
  }

  // 2. Resolve plan limits
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, opts.plan))
    .limit(1);

  if (!plan) {
    console.error(`[generate-license] Plan not found in DB: ${opts.plan}`);
    process.exit(1);
  }

  // 3. Check for existing license on this tenant
  if (tenantId) {
    const existing = await db
      .select({ id: licenses.id, licenseKey: licenses.licenseKey, status: licenses.status, modules: licenses.modules })
      .from(licenses)
      .where(and(eq(licenses.tenantId, tenantId), or(eq(licenses.status, "active"), eq(licenses.status, "trial"))))
      .limit(1);

    if (existing.length > 0) {
      const ex = existing[0]!;
      if (!opts.force) {
        console.error(`[generate-license] Tenant already has an active license:`);
        console.error(`  Key:     ${ex.licenseKey}`);
        console.error(`  Status:  ${ex.status}`);
        console.error(`  Modules: ${ex.modules}`);
        console.error(`  Use --force to revoke it and create a new one.`);
        process.exit(1);
      }
      console.warn(`[generate-license] --force: revoking existing license ${ex.licenseKey}`);
    }
  }

  // 4. Build the new license row
  const now        = new Date();
  const validFrom  = now;
  const expiresAt  = opts.perpetual ? null : (() => {
    const d = new Date(now);
    d.setDate(d.getDate() + opts.termDays);
    return d;
  })();

  const keyResult = await uniqueKey(db, opts.modules, opts.locationId, tenantId);
  const modulesSerialized = JSON.stringify(opts.modules);

  // 5. Print summary
  console.log("\n─────────────────────────────────────────────────");
  console.log("  LICENSE SUMMARY");
  console.log("─────────────────────────────────────────────────");
  console.log(`  Key:          ${keyResult.licenseKey}`);
  console.log(`  Format:       ${keyResult.keyFormat.toUpperCase()}`);
  console.log(`  Plan:         ${plan.name} (${plan.slug})`);
  console.log(`  Modules:      ${opts.modules.join(", ")}`);
  console.log(`  Tenant:       ${tenantSlug ?? "(unassigned pool key)"}`);
  console.log(`  Valid from:   ${validFrom.toDateString()}`);
  console.log(`  Expires:      ${opts.perpetual ? "never (perpetual)" : expiresAt!.toDateString()}`);
  console.log(`  Max orgs:     ${plan.maxOrganizations}`);
  console.log(`  Max users:    ${plan.maxUsers ?? 999}`);
  console.log(`  Max acts:     ${plan.maxActivations}`);
  if (keyResult.scopedLocationId) {
    console.log(`  Location ID:  ${keyResult.scopedLocationId}`);
  }
  if (opts.dryRun) {
    console.log("\n  [DRY RUN — nothing written to DB]");
    console.log("─────────────────────────────────────────────────\n");
    return;
  }
  console.log("─────────────────────────────────────────────────\n");

  // 6. Revoke existing (--force)
  if (opts.force && tenantId) {
    await db
      .update(licenses)
      .set({ status: "revoked", revokedAt: now, revokeReason: "replaced_by_generate_license_script", updatedAt: now })
      .where(and(eq(licenses.tenantId, tenantId), or(eq(licenses.status, "active"), eq(licenses.status, "trial"))));
  }

  // 7. Insert
  const [inserted] = await db.insert(licenses).values({
    licenseKey:        keyResult.licenseKey,
    keyFormat:         keyResult.keyFormat,
    scopedLocationId:  keyResult.scopedLocationId,
    product:           "platform",
    modules:           modulesSerialized,
    planSlug:          opts.plan,
    tenantId:          tenantId,
    status:            tenantId ? "active" : "unassigned",
    activatedAt:       tenantId ? now : null,
    validFrom,
    expiresAt,
    isPerpetual:       opts.perpetual,
    maxOrganizations:  plan.maxOrganizations,
    maxActivations:    plan.maxActivations,
    maxUsers:          plan.maxUsers ?? 999,
    activationCount:   0,
    gracePeriodDays:   7,
  }).returning();

  console.log(`[generate-license] Created license ${inserted!.id}`);
  console.log(`[generate-license] Key: ${inserted!.licenseKey}`);
  console.log(`[generate-license] Status: ${inserted!.status}`);
  console.log(`[generate-license] Done.`);
}

main().catch((err) => {
  console.error("[generate-license] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
