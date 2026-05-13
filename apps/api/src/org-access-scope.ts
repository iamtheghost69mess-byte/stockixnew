import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "@repo/db/schema";

const { ownerOrganizationAccess } = schema;

type Db = PostgresJsDatabase<typeof schema>;

/**
 * When a support_agent has at least one `owner_organization_access` row for this tenant,
 * they may only read or mutate organizations whose id appears in that set.
 * When there are no rows, they retain full tenant-level access (legacy behavior).
 */
export async function getSupportScopedOrgIdsForTenant(
  db: Db,
  ownerId: string,
  tenantId: string,
): Promise<string[] | null> {
  const rows = await db
    .select({ organizationId: ownerOrganizationAccess.organizationId })
    .from(ownerOrganizationAccess)
    .where(
      and(eq(ownerOrganizationAccess.ownerId, ownerId), eq(ownerOrganizationAccess.tenantId, tenantId)),
    );
  if (rows.length === 0) return null;
  return [...new Set(rows.map((r) => r.organizationId))];
}

export function assertOrgInSupportScope(
  actorRole: string,
  organizationId: string,
  scopedOrgIds: string[] | null,
): boolean {
  if (actorRole !== "support_agent") return true;
  if (scopedOrgIds === null) return true;
  return scopedOrgIds.includes(organizationId);
}

export function filterOrganizationsForSupportAgent<T extends { id: string }>(
  actorRole: string,
  rows: T[],
  scopedOrgIds: string[] | null,
): T[] {
  if (actorRole !== "support_agent" || scopedOrgIds === null) return rows;
  const allowed = new Set(scopedOrgIds);
  return rows.filter((r) => allowed.has(r.id));
}
