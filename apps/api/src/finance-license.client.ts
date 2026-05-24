import { apiConfig } from "@repo/config";
import { tenantDeployments } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import {
  getActiveLicenseForTenant,
  getPlanLimits,
  insertLicenseHistory,
  isLicenseLimitsConsistentWithPlan,
} from "./license-utils.js";

type Db = PostgresJsDatabase<typeof schema>;

export type FinanceLicenseSyncPayload = {
  tenantId: number;
  planSlug: string;
  status: "active" | "expired" | "suspended" | "grace" | "revoked";
  validFrom: string;
  expiresAt: string | null;
  gracePeriodDays: number;
  maxUsers: number;
  maxActivations: number;
  maxOrganizations: number;
  isPerpetual: boolean;
  featureFlags: Record<string, boolean> | null;
};

/** Staff user cap in finance when Stockix licenses do not track maxUsers separately. */
export const FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS = 999;

/**
 * Field mapping — Stockix control plane → Finance tenant_licenses
 *
 * maxUsers:       How many staff users (accountants, managers) can be
 *                 created in the finance app. Sourced from plans.maxUsers.
 *
 * maxActivations: How many POS desktop/device activations are allowed.
 *                 Maps to license.maxActivations on Stockix control plane.
 *                 Enforced at control plane via POST /licenses/activate.
 *                 Stored in finance for reference only — not enforced there.
 *
 * maxOrganizations: How many sub-organizations a tenant can create in finance.
 *                   Maps to license.maxOrganizations; enforced in plan-limits.ts.
 */
type FinanceLicenseLimitSource = {
  maxActivations?: number;
  maxOrganizations?: number;
};

/**
 * Merges Stockix license limits with plan limits. Treats `1` on the license row as an
 * unset sentinel when the plan allows more (matches provision assign / auto-license).
 */
export function resolveFinanceLicenseLimitFields(
  license: FinanceLicenseLimitSource | null | undefined,
  planLimits: { maxActivations: number; maxOrganizations: number; maxUsers: number },
): Pick<FinanceLicenseSyncPayload, "maxUsers" | "maxActivations" | "maxOrganizations"> {
  let maxOrganizations = license?.maxOrganizations ?? planLimits.maxOrganizations;
  let maxActivations = license?.maxActivations ?? planLimits.maxActivations;

  if (license?.maxOrganizations === 1 && planLimits.maxOrganizations !== 1) {
    maxOrganizations = planLimits.maxOrganizations;
  }
  if (license?.maxActivations === 1 && planLimits.maxActivations !== 1) {
    maxActivations = planLimits.maxActivations;
  }

  return {
    maxUsers: planLimits.maxUsers ?? FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS,
    maxOrganizations,
    maxActivations,
  };
}

export function buildFinanceLicenseLimitFields(
  license: FinanceLicenseLimitSource | null | undefined,
  planLimits?: { maxActivations: number; maxOrganizations: number; maxUsers?: number } | null,
): Pick<FinanceLicenseSyncPayload, "maxUsers" | "maxActivations" | "maxOrganizations"> {
  if (planLimits) {
    return resolveFinanceLicenseLimitFields(license, {
      maxOrganizations: planLimits.maxOrganizations,
      maxActivations: planLimits.maxActivations,
      maxUsers: planLimits.maxUsers ?? FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS,
    });
  }
  return {
    maxUsers: FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS,
    maxActivations: license?.maxActivations ?? 1,
    maxOrganizations: license?.maxOrganizations ?? 1,
  };
}

type LicenseStatusInput = {
  status: string;
  isPerpetual: boolean;
  expiresAt: Date | null;
  gracePeriodDays: number;
};

export function mapStockixLicenseStatus(
  license: LicenseStatusInput | null | undefined,
  tenantStatus?: string,
): FinanceLicenseSyncPayload["status"] {
  if (tenantStatus === "suspended") {
    return "suspended";
  }
  if (!license) {
    return "active";
  }
  if (license.status === "revoked") {
    return "revoked";
  }
  if (license.isPerpetual) {
    return "active";
  }
  if (license.expiresAt) {
    const now = new Date();
    const graceEnd = new Date(license.expiresAt);
    graceEnd.setDate(graceEnd.getDate() + (license.gracePeriodDays ?? 7));

    const pastExpiry = license.expiresAt <= now;
    if (pastExpiry && now <= graceEnd) {
      return "grace";
    }
    if (pastExpiry) {
      return "expired";
    }
  }
  if (license.status === "expired") {
    return "expired";
  }
  return "active";
}

export async function resolveTenantInternalBaseUrl(
  db: Db,
  stockixTenantId: string,
): Promise<string | null> {
  const [deployment] = await db
    .select({ internalPort: tenantDeployments.internalPort })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, stockixTenantId))
    .limit(1);

  if (!deployment?.internalPort) {
    return null;
  }

  const host = process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? "127.0.0.1";
  return `http://${host}:${deployment.internalPort}`;
}

export async function syncFinanceLicenseForStockixTenant(
  db: Db,
  params: {
    stockixTenantId: string;
    financeTenantId: number;
    internalBaseUrl?: string | null;
  },
  log: (message: string) => void = () => {},
): Promise<void> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    log("[finance-license] INTERNAL_API_SECRET not configured; skipping sync");
    return;
  }

  const internalBaseUrl =
    params.internalBaseUrl ??
    (await resolveTenantInternalBaseUrl(db, params.stockixTenantId));

  if (!internalBaseUrl) {
    log("[finance-license] No internal base URL; skipping sync");
    return;
  }

  const license = await getActiveLicenseForTenant(db, params.stockixTenantId);

  const [tenantRow] = await db
    .select({ status: schema.tenants.status, planSlug: schema.tenants.planSlug })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, params.stockixTenantId))
    .limit(1);

  const planSlug = license?.planSlug ?? tenantRow?.planSlug ?? "owner-managed";
  const planLimits = await getPlanLimits(db, planSlug);

  if (license) {
    const isConsistent = await isLicenseLimitsConsistentWithPlan(db, license);
    if (!isConsistent) {
      log(
        `[LicenseSync] License limits differ from plan limits for license ${license.id}, tenant ${license.tenantId ?? "none"} — plan limits will be applied for sync`,
      );
    }
  }

  const payload: FinanceLicenseSyncPayload = {
    tenantId: params.financeTenantId,
    planSlug,
    status: mapStockixLicenseStatus(
      license
        ? {
            status: license.status,
            isPerpetual: license.isPerpetual,
            expiresAt: license.expiresAt,
            gracePeriodDays: license.gracePeriodDays,
          }
        : null,
      tenantRow?.status,
    ),
    validFrom: (license?.validFrom ?? new Date()).toISOString(),
    expiresAt: license?.expiresAt?.toISOString() ?? null,
    gracePeriodDays: license?.gracePeriodDays ?? 30,
    ...resolveFinanceLicenseLimitFields(license, planLimits),
    isPerpetual: license?.isPerpetual ?? false,
    featureFlags: null,
  };

  const url = `${internalBaseUrl.replace(/\/+$/, "")}/api/internal/license/sync`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      log(
        `[finance-license] Sync failed HTTP ${res.status}: ${text.slice(0, 300)}`,
      );
      return;
    }

    log(`[finance-license] Synced license for finance tenant ${params.financeTenantId}`);

    if (license) {
      await insertLicenseHistory(db, {
        licenseId: license.id,
        action: "synced_to_finance",
        newValues: {
          syncedStatus: payload.status,
          maxOrganizations: payload.maxOrganizations,
          maxUsers: payload.maxUsers,
          maxActivations: payload.maxActivations,
          planSlug: payload.planSlug,
        },
      });
    }
  } catch (error) {
    log(
      `[finance-license] Sync error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
