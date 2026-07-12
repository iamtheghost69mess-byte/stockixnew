import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hasPermission } from "@repo/shared/permissions";

import * as schema from "@repo/db/schema";

const { ownerOrganizationAccess } = schema;

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Owners with `tenants.org_scope` (or legacy support_agent) are limited to tenants/orgs
 * listed in `owner_organization_access`. Zero rows = zero access (default-deny) until a
 * super_admin assigns grants — a role that never uses org scope (e.g. super_admin) is the
 * only case that gets unrestricted access, signaled by returning `null` below.
 */
export function ownerUsesTenantOrgScope(
  permissions: readonly string[],
  roleSlug: string,
): boolean {
  // Wildcard = super_admin unrestricted access — never apply org scope restriction
  if (permissions.includes("*")) return false;
  if (permissions.includes("tenants.org_scope")) return true;
  return roleSlug === "support_agent";
}

/**
 * Distinct tenant IDs this owner may access. Returns `null` only when the owner's role
 * doesn't use org scope at all (unrestricted). An org-scoped owner with zero grant rows
 * gets back `[]` — no tenants — rather than unrestricted access.
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
 * Organization ids this owner may access within this tenant, for callers whose role uses
 * org scope (checked via `ownerUsesTenantOrgScope` at the call site). Zero rows means zero
 * organizations — callers must not treat an empty array as unrestricted.
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
