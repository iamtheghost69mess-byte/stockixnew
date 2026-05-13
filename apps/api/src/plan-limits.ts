import { licenses, organizations } from "@repo/db/schema";
import { and, count, desc, eq, gt, isNull, lte, ne, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

export type PlanLimitsDb = PostgresJsDatabase<typeof schema>;

function nonExpiredActiveLicenseCondition(now: Date) {
  return and(
    eq(licenses.status, "active"),
    or(isNull(licenses.validFrom), lte(licenses.validFrom, now)),
    or(isNull(licenses.activatedAt), lte(licenses.activatedAt, now)),
    or(
      eq(licenses.isPerpetual, true),
      isNull(licenses.expiresAt),
      gt(licenses.expiresAt, now),
    ),
  );
}

/** A tenant must have at least one active license that is not past expiresAt (unless perpetual). */
export async function getTenantLicenseEligibility(
  db: PlanLimitsDb | null,
  tenantId: string,
): Promise<"ok" | "no_active_license" | "license_expired"> {
  if (!db) return "no_active_license";
  const now = new Date();
  const activeRows = await db
    .select({
      isPerpetual: licenses.isPerpetual,
      expiresAt: licenses.expiresAt,
      validFrom: licenses.validFrom,
      activatedAt: licenses.activatedAt,
    })
    .from(licenses)
    .where(and(eq(licenses.tenantId, tenantId), eq(licenses.status, "active")));

  if (activeRows.length === 0) return "no_active_license";
  const hasValid = activeRows.some((r) => {
    const start = r.validFrom ?? r.activatedAt;
    if (start && start > now) return false;
    return r.isPerpetual || r.expiresAt == null || r.expiresAt > now;
  });
  if (hasValid) return "ok";
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
  const now = new Date();
  const row = await db
    .select({ maxOrganizations: licenses.maxOrganizations })
    .from(licenses)
    .where(and(eq(licenses.tenantId, tenantId), nonExpiredActiveLicenseCondition(now)))
    .orderBy(desc(licenses.updatedAt))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!row) return 0;
  return row.maxOrganizations;
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
