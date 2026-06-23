/**
 * Seed script: creates one license for every module combination × plan tier.
 * All keys are left UNASSIGNED so they can be picked up via the dashboard
 * or assigned later with `generate-license.ts --tenant <slug> --force`.
 *
 * Idempotent — scenario keys are tracked in `licenses.notes` via a stable
 * "seed:<scenario-id>" tag. Re-running skips already-created scenarios.
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-licenses.ts            # seed everything
 *   pnpm exec tsx scripts/seed-licenses.ts --dry-run  # print plan, no DB writes
 *   pnpm exec tsx scripts/seed-licenses.ts --reset    # revoke + re-create all seed licenses
 *
 * After seeding:
 *   - View all unassigned licenses in the dashboard under Licenses → Unassigned
 *   - Assign to a tenant: pnpm exec tsx scripts/generate-license.ts --tenant <slug> --force
 */

import { randomBytes } from "node:crypto";
import { apiConfig } from "@repo/config";
import { createDb } from "@repo/db";
import { licenses, plans } from "@repo/db/schema";
import { eq, like } from "drizzle-orm";
import { generateStxiLicenseKey } from "../packages/shared/src/stxi-license-key.js";

// ─── scenario definitions ─────────────────────────────────────────────────────

type Module = "accounting" | "pos" | "pms" | "chat";

interface Scenario {
  id: string;
  label: string;
  plan: string;
  modules: Module[];
  termDays: number | null; // null = perpetual
  locationId: string | null;
  notes: string;
}

/** Stable demo location IDs for STXI scenarios (one per scenario to avoid key clash). */
const DEMO_LOCATION_A = "507f1f77bcf86cd799439011";
const DEMO_LOCATION_B = "507f1f77bcf86cd799439022";

const SCENARIOS: Scenario[] = [
  // ── Finance only ─────────────────────────────────────────────────────────────
  {
    id: "finance-starter-1y",
    label: "Finance — Starter, 1 year",
    plan: "starter",
    modules: ["accounting"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-starter-1y",
  },
  {
    id: "finance-growth-1y",
    label: "Finance — Growth, 1 year",
    plan: "growth",
    modules: ["accounting"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-growth-1y",
  },
  {
    id: "finance-pro-perpetual",
    label: "Finance — Pro, perpetual",
    plan: "pro",
    modules: ["accounting"],
    termDays: null,
    locationId: null,
    notes: "seed:finance-pro-perpetual",
  },
  {
    id: "finance-enterprise-perpetual",
    label: "Finance — Enterprise, perpetual",
    plan: "enterprise",
    modules: ["accounting"],
    termDays: null,
    locationId: null,
    notes: "seed:finance-enterprise-perpetual",
  },

  // ── Finance + POS (STKX — no location binding) ───────────────────────────────
  {
    id: "finance-pos-starter-1y",
    label: "Finance + POS — Starter, 1 year (STKX)",
    plan: "starter",
    modules: ["accounting", "pos"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-pos-starter-1y",
  },
  {
    id: "finance-pos-pro-perpetual",
    label: "Finance + POS — Pro, perpetual (STKX)",
    plan: "pro",
    modules: ["accounting", "pos"],
    termDays: null,
    locationId: null,
    notes: "seed:finance-pos-pro-perpetual",
  },

  // ── Finance + POS (STXI — location-scoped, tamper-proof) ─────────────────────
  {
    id: "finance-pos-pro-stxi-1y",
    label: "Finance + POS — Pro, 1 year (STXI / location-scoped)",
    plan: "pro",
    modules: ["accounting", "pos"],
    termDays: 365,
    locationId: DEMO_LOCATION_A,
    notes: "seed:finance-pos-pro-stxi-1y",
  },
  {
    id: "finance-pos-enterprise-stxi-perpetual",
    label: "Finance + POS — Enterprise, perpetual (STXI)",
    plan: "enterprise",
    modules: ["accounting", "pos"],
    termDays: null,
    locationId: DEMO_LOCATION_B,
    notes: "seed:finance-pos-enterprise-stxi-perpetual",
  },

  // ── Finance + PMS ─────────────────────────────────────────────────────────────
  {
    id: "finance-pms-growth-1y",
    label: "Finance + PMS — Growth, 1 year",
    plan: "growth",
    modules: ["accounting", "pms"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-pms-growth-1y",
  },
  {
    id: "finance-pms-pro-perpetual",
    label: "Finance + PMS — Pro, perpetual",
    plan: "pro",
    modules: ["accounting", "pms"],
    termDays: null,
    locationId: null,
    notes: "seed:finance-pms-pro-perpetual",
  },

  // ── Finance + Chat ────────────────────────────────────────────────────────────
  {
    id: "finance-chat-starter-1y",
    label: "Finance + Chat — Starter, 1 year",
    plan: "starter",
    modules: ["accounting", "chat"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-chat-starter-1y",
  },
  {
    id: "finance-chat-growth-1y",
    label: "Finance + Chat — Growth, 1 year",
    plan: "growth",
    modules: ["accounting", "chat"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-chat-growth-1y",
  },

  // ── Finance + POS + PMS ───────────────────────────────────────────────────────
  {
    id: "finance-pos-pms-pro-1y",
    label: "Finance + POS + PMS — Pro, 1 year",
    plan: "pro",
    modules: ["accounting", "pos", "pms"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-pos-pms-pro-1y",
  },
  {
    id: "finance-pos-pms-enterprise-2y",
    label: "Finance + POS + PMS — Enterprise, 2 years",
    plan: "enterprise",
    modules: ["accounting", "pos", "pms"],
    termDays: 730,
    locationId: null,
    notes: "seed:finance-pos-pms-enterprise-2y",
  },

  // ── Finance + POS + Chat ──────────────────────────────────────────────────────
  {
    id: "finance-pos-chat-pro-1y",
    label: "Finance + POS + Chat — Pro, 1 year",
    plan: "pro",
    modules: ["accounting", "pos", "chat"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-pos-chat-pro-1y",
  },

  // ── Finance + PMS + Chat ──────────────────────────────────────────────────────
  {
    id: "finance-pms-chat-pro-1y",
    label: "Finance + PMS + Chat — Pro, 1 year",
    plan: "pro",
    modules: ["accounting", "pms", "chat"],
    termDays: 365,
    locationId: null,
    notes: "seed:finance-pms-chat-pro-1y",
  },

  // ── All modules ───────────────────────────────────────────────────────────────
  {
    id: "all-modules-enterprise-2y",
    label: "All modules — Enterprise, 2 years",
    plan: "enterprise",
    modules: ["accounting", "pos", "pms", "chat"],
    termDays: 730,
    locationId: null,
    notes: "seed:all-modules-enterprise-2y",
  },
  {
    id: "all-modules-enterprise-perpetual",
    label: "All modules — Enterprise, perpetual",
    plan: "enterprise",
    modules: ["accounting", "pos", "pms", "chat"],
    termDays: null,
    locationId: null,
    notes: "seed:all-modules-enterprise-perpetual",
  },

  // ── Short-term trial ──────────────────────────────────────────────────────────
  {
    id: "finance-starter-trial-30d",
    label: "Finance — Starter, 30-day trial",
    plan: "starter",
    modules: ["accounting"],
    termDays: 30,
    locationId: null,
    notes: "seed:finance-starter-trial-30d",
  },
  {
    id: "finance-pos-growth-trial-30d",
    label: "Finance + POS — Growth, 30-day trial",
    plan: "growth",
    modules: ["accounting", "pos"],
    termDays: 30,
    locationId: null,
    notes: "seed:finance-pos-growth-trial-30d",
  },
];

// ─── key generation ───────────────────────────────────────────────────────────

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateStkxKey(): string {
  const bytes = randomBytes(12);
  let raw = "";
  for (const b of bytes) raw += CHARSET[b! % CHARSET.length];
  return `STKX-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

async function uniqueStkxKey(db: ReturnType<typeof createDb>): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const key = generateStkxKey();
    const clash = await db.select({ id: licenses.id }).from(licenses).where(eq(licenses.licenseKey, key)).limit(1);
    if (clash.length === 0) return key;
  }
  throw new Error("Could not generate unique STKX key after 5 attempts");
}

function buildStxiKey(locationId: string): string {
  return generateStxiLicenseKey({
    tenantId: "SEEDPOOL",
    locationId,
    secret: apiConfig.licenseSigningSecret,
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const reset  = process.argv.includes("--reset");

  const url = apiConfig.databaseUrl;
  if (!url) { console.error("[seed-licenses] DATABASE_URL not set"); process.exit(1); }

  const db = createDb(url);

  // Load plan limits
  const allPlans = await db.select().from(plans);
  const planMap = Object.fromEntries(allPlans.map((p) => [p.slug, p]));

  // Find already-seeded scenarios
  const existing = await db
    .select({ notes: licenses.notes, licenseKey: licenses.licenseKey, status: licenses.status })
    .from(licenses)
    .where(like(licenses.notes, "seed:%"));

  const seededIds = new Set(
    existing
      .filter((r) => r.notes?.startsWith("seed:"))
      .map((r) => r.notes!.replace("seed:", "")),
  );

  if (reset && !dryRun) {
    console.log("[seed-licenses] --reset: revoking all existing seed licenses...");
    const now = new Date();
    await db
      .update(licenses)
      .set({ status: "revoked", revokedAt: now, revokeReason: "seed_reset", updatedAt: now })
      .where(like(licenses.notes, "seed:%"));
    seededIds.clear();
    console.log("[seed-licenses] Existing seed licenses revoked.\n");
  }

  console.log(`\n${"─".repeat(72)}`);
  console.log("  STOCKIX LICENSE SEED — ALL SCENARIOS");
  console.log(`${"─".repeat(72)}`);
  console.log(`  Total scenarios: ${SCENARIOS.length}`);
  console.log(`  Dry run:         ${dryRun ? "YES (no DB writes)" : "NO"}`);
  console.log(`  Reset mode:      ${reset ? "YES" : "NO"}`);
  console.log(`${"─".repeat(72)}\n`);

  const results: Array<{ label: string; key: string; status: "created" | "skipped" | "dry-run" }> = [];

  for (const scenario of SCENARIOS) {
    const scenarioId = scenario.id;

    if (!reset && seededIds.has(scenarioId)) {
      const existing_ = existing.find((r) => r.notes === `seed:${scenarioId}`);
      results.push({ label: scenario.label, key: existing_?.licenseKey ?? "(existing)", status: "skipped" });
      continue;
    }

    const plan = planMap[scenario.plan];
    if (!plan) {
      console.error(`[seed-licenses] Plan not found: ${scenario.plan}`);
      continue;
    }

    const needsStxi = (scenario.modules.includes("pos") || scenario.modules.includes("pms")) && scenario.locationId;
    const licenseKey = needsStxi ? buildStxiKey(scenario.locationId!) : (dryRun ? `STKX-XXXX-XXXX-XXXX` : await uniqueStkxKey(db));
    const keyFormat: "stkx" | "stxi" = needsStxi ? "stxi" : "stkx";

    const now = new Date();
    const expiresAt = scenario.termDays === null ? null : (() => {
      const d = new Date(now);
      d.setDate(d.getDate() + scenario.termDays!);
      return d;
    })();

    if (!dryRun) {
      const clash = await db.select({ id: licenses.id }).from(licenses).where(eq(licenses.licenseKey, licenseKey)).limit(1);
      if (clash.length > 0) {
        results.push({ label: scenario.label, key: licenseKey, status: "skipped" });
        continue;
      }

      await db.insert(licenses).values({
        licenseKey,
        keyFormat,
        scopedLocationId: scenario.locationId,
        product: "platform",
        modules: JSON.stringify(scenario.modules),
        planSlug: scenario.plan,
        tenantId: null,
        status: "unassigned",
        activatedAt: null,
        validFrom: now,
        expiresAt,
        isPerpetual: scenario.termDays === null,
        maxOrganizations: plan.maxOrganizations,
        maxActivations: plan.maxActivations,
        maxUsers: plan.maxUsers ?? 999,
        activationCount: 0,
        gracePeriodDays: 7,
        notes: `seed:${scenarioId}`,
      });
    }

    results.push({ label: scenario.label, key: licenseKey, status: dryRun ? "dry-run" : "created" });
  }

  // Print results table
  const colW = Math.max(...results.map((r) => r.label.length)) + 2;
  console.log(`  ${"Scenario".padEnd(colW)}  ${"Key".padEnd(26)}  Status`);
  console.log(`  ${"─".repeat(colW)}  ${"─".repeat(26)}  ${"─".repeat(8)}`);
  for (const r of results) {
    const status = r.status === "created" ? "✓ created" : r.status === "skipped" ? "— skipped" : "· dry-run";
    console.log(`  ${r.label.padEnd(colW)}  ${r.key.padEnd(26)}  ${status}`);
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  console.log(`\n${"─".repeat(72)}`);
  if (dryRun) {
    console.log(`  DRY RUN complete — ${SCENARIOS.length} scenarios previewed, nothing written.`);
  } else {
    console.log(`  Done — ${created} created, ${skipped} skipped (already seeded).`);
  }
  console.log(`${"─".repeat(72)}\n`);
}

main().catch((err) => {
  console.error("[seed-licenses] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
