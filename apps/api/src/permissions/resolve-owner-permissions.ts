import { owners, platformRoles } from "@repo/db/schema";
import { permissionsForRoleSlug } from "@repo/shared/permissions";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export type ResolvedOwnerAuth = {
  roleSlug: string;
  roleId: string | null;
  roleName: string | null;
  permissions: string[];
};

export type OwnerSessionValidation = {
  ownerId: string;
  role: string;
  sessionVersion: number;
};

export type ValidateAndResolveResult =
  | { success: false; error: string; status: 401 | 403 }
  | { success: true; auth: ResolvedOwnerAuth };

export async function resolveOwnerPermissions(
  db: Db,
  owner: { role: string; roleId?: string | null },
): Promise<ResolvedOwnerAuth> {
  const legacySlug = owner.role.trim();
  // Legacy owners.role slug always wins for built-in super_admin — never downgrade via roleId.
  if (legacySlug === "super_admin") {
    return {
      roleSlug: "super_admin",
      roleId: owner.roleId ?? null,
      roleName: "super admin",
      permissions: ["*"],
    };
  }

  if (owner.roleId) {
    const [row] = await db
      .select({
        slug: platformRoles.slug,
        name: platformRoles.name,
        permissions: platformRoles.permissions,
      })
      .from(platformRoles)
      .where(eq(platformRoles.id, owner.roleId))
      .limit(1);
    if (row) {
      const perms = Array.isArray(row.permissions) ? row.permissions : [];
      return {
        roleSlug: row.slug,
        roleId: owner.roleId,
        roleName: row.name,
        permissions: perms,
      };
    }
  }

  const slug = owner.role.trim();
  return {
    roleSlug: slug,
    roleId: null,
    roleName: slug.replace(/_/g, " "),
    permissions: [...permissionsForRoleSlug(slug)],
  };
}

export async function loadOwnerAuthById(
  db: Db,
  ownerId: string,
): Promise<ResolvedOwnerAuth | null> {
  const [row] = await db
    .select({
      role: owners.role,
      roleId: owners.roleId,
    })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);
  if (!row) return null;
  return resolveOwnerPermissions(db, row);
}

/**
 * Validates a session token payload against the DB and resolves permissions
 * in a single owners query (+ one optional platformRoles query), replacing
 * the previous pattern of validateOwnerSession + loadOwnerAuthById which
 * hit the same owners row twice.
 */
export async function validateAndResolveOwnerAuth(
  db: Db,
  input: OwnerSessionValidation,
): Promise<ValidateAndResolveResult> {
  const [row] = await db
    .select({
      id: owners.id,
      role: owners.role,
      status: owners.status,
      sessionVersion: owners.sessionVersion,
      roleId: owners.roleId,
    })
    .from(owners)
    .where(eq(owners.id, input.ownerId))
    .limit(1);

  if (!row || row.status !== "active") {
    return { success: false, error: "forbidden", status: 403 };
  }
  if (row.role !== input.role || row.sessionVersion !== input.sessionVersion) {
    return { success: false, error: "session_stale", status: 401 };
  }

  return { success: true, auth: await resolveOwnerPermissions(db, row) };
}
