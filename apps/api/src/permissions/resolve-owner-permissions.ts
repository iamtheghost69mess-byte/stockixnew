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

export async function resolveOwnerPermissions(
  db: Db,
  owner: { role: string; roleId?: string | null },
): Promise<ResolvedOwnerAuth> {
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
