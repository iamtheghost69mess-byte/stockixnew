import { licenses, organizations } from "@repo/db/schema";
import { and, count, eq, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

export type PlanLimitsDb = PostgresJsDatabase<typeof schema>;

/**
 * Returns the max organizations allowed for a tenant's active license.
 * Returns -1 for unlimited.
 * Returns 1 as default if no active license found.
 */
export async function getMaxOrganizations(
  db: PlanLimitsDb | null,
  tenantId: string,
): Promise<number> {
  if (!db) return 1;
  const row = await db
    .select({ maxOrganizations: licenses.maxOrganizations })
    .from(licenses)
    .where(
      and(eq(licenses.tenantId, tenantId), eq(licenses.status, "active")),
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!row) return 1;
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
