import { branchLocationMappings, organizations } from "@repo/db/schema";
import { and, count, eq, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { getActiveLicenseForTenant } from "./license-utils.js";

export type PlanLimitsDb = PostgresJsDatabase<typeof schema>;

function isLicenseDateValid(
  license: {
    isPerpetual: boolean;
    expiresAt: Date | null;
    validFrom: Date | null;
    activatedAt: Date | null;
    status: string;
    gracePeriodDays: number;
  },
  now: Date,
): boolean {
  const start = license.validFrom ?? license.activatedAt;
  if (start && start > now) return false;
  if (license.status === "active") {
    return license.isPerpetual || license.expiresAt == null || license.expiresAt > now;
  }
  if (license.status === "expired" && license.expiresAt) {
    const graceEnd = new Date(license.expiresAt);
    graceEnd.setDate(graceEnd.getDate() + (license.gracePeriodDays ?? 7));
    return now <= graceEnd;
  }
  return false;
}

/** A tenant must have at least one active license that is not past expiresAt (unless perpetual). */
export async function getTenantLicenseEligibility(
  db: PlanLimitsDb | null,
  tenantId: string,
): Promise<"ok" | "no_active_license" | "license_expired"> {
  if (!db) return "no_active_license";
  const license = await getActiveLicenseForTenant(db, tenantId);
  if (!license) return "no_active_license";
  const now = new Date();
  if (isLicenseDateValid(license, now)) return "ok";
  return "license_expired";
}

/**
 * Returns the max organizations allowed for a tenant's active license.
 * Returns -1 for unlimited.
 * Returns 0 if there is no date-valid active license.
 */
export async function getMaxOrganizations(
  db: PlanLimitsDb | null,
  tenantId: string,
): Promise<number> {
  if (!db) return 0;
  const license = await getActiveLicenseForTenant(db, tenantId);
  if (!license) return 0;
  if (!isLicenseDateValid(license, new Date())) return 0;
  return license.maxOrganizations;
}

/**
 * Returns true if the tenant is allowed to create one more organization.
 */
export async function canCreateOrganization(
  db: PlanLimitsDb | null,
  tenantId: string,
): Promise<boolean> {
  if (!db) return false;
  const elig = await getTenantLicenseEligibility(db, tenantId);
  if (elig !== "ok") return false;
  const [max, rows] = await Promise.all([
    getMaxOrganizations(db, tenantId),
    db
      .select({ count: count() })
      .from(organizations)
      .where(
        and(
          eq(organizations.tenantId, tenantId),
          ne(organizations.status, "failed"),
        ),
      ),
  ]);
  const current = Number(rows[0]?.count ?? 0);
  return max === -1 || current < max;
}

/**
 * Returns the max locations allowed for a tenant's active license.
 * Returns -1 for unlimited.
 * Returns 0 if there is no date-valid active license.
 */
export async function getMaxLocations(
  db: PlanLimitsDb | null,
  tenantId: string,
): Promise<number> {
  if (!db) return 0;
  const license = await getActiveLicenseForTenant(db, tenantId);
  if (!license) return 0;
  if (!isLicenseDateValid(license, new Date())) return 0;
  return license.maxLocations;
}

/**
 * Returns true if the tenant is allowed to create one more location.
 */
export async function canCreateLocation(
  db: PlanLimitsDb | null,
  tenantId: string,
): Promise<boolean> {
  if (!db) return false;
  const elig = await getTenantLicenseEligibility(db, tenantId);
  if (elig !== "ok") return false;
  const [max, rows] = await Promise.all([
    getMaxLocations(db, tenantId),
    db
      .select({ count: count() })
      .from(branchLocationMappings)
      .where(eq(branchLocationMappings.tenantId, tenantId)),
  ]);
  const current = Number(rows[0]?.count ?? 0);
  return max === -1 || current < max;
}
