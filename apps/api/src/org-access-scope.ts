import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hasPermission } from "@repo/shared/permissions";

import * as schema from "@repo/db/schema";

const { ownerOrganizationAccess } = schema;

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Owners with `tenants.org_scope` (or legacy support_agent) may be limited to tenants
 * listed in `owner_organization_access`. Empty rows = full tenant access (legacy).
 */
export function ownerUsesTenantOrgScope(
  permissions: readonly string[],
  roleSlug: string,
): boolean {
  if (hasPermission(permissions, "tenants.org_scope")) return true;
  return roleSlug === "support_agent";
}

/**
 * Distinct tenant IDs this owner may access when org-scoped rows exist.
 * Returns `null` when no scope rows (full access) or owner is not org-scoped.
 */
export async function getScopedTenantIdsForOwner(
  db: Db,
  ownerId: string,
  permissions: readonly string[],
  roleSlug: string,
): Promise<string[] | null> {
  if (!ownerUsesTenantOrgScope(permissions, roleSlug)) return null;

  const rows = await db
    .select({ tenantId: ownerOrganizationAccess.tenantId })
    .from(ownerOrganizationAccess)
    .where(eq(ownerOrganizationAccess.ownerId, ownerId));

  if (rows.length === 0) return null;

  return [...new Set(rows.map((r) => r.tenantId))];
}

export async function assertTenantInOwnerScope(
  db: Db,
  ownerId: string,
  tenantId: string,
  permissions: readonly string[],
  roleSlug: string,
): Promise<boolean> {
  const scopedTenantIds = await getScopedTenantIdsForOwner(db, ownerId, permissions, roleSlug);
  if (scopedTenantIds === null) return true;
  return scopedTenantIds.includes(tenantId);
}

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
  permissions: readonly string[] = [],
): boolean {
  if (!ownerUsesTenantOrgScope(permissions, actorRole)) return true;
  if (scopedOrgIds === null) return true;
  return scopedOrgIds.includes(organizationId);
}

export function filterOrganizationsForSupportAgent<T extends { id: string }>(
  actorRole: string,
  rows: T[],
  scopedOrgIds: string[] | null,
  permissions: readonly string[] = [],
): T[] {
  if (!ownerUsesTenantOrgScope(permissions, actorRole) || scopedOrgIds === null) {
    return rows;
  }
  const allowed = new Set(scopedOrgIds);
  return rows.filter((r) => allowed.has(r.id));
}
