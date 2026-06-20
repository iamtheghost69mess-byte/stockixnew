import { platformRoles } from "@repo/db/schema";
import type { schema, PostgresJsDatabase } from "@repo/db";
import { ALL_PERMISSIONS, hasPermission } from "@repo/shared/permissions";
import { asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

const createBody = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  permissions: z.array(z.string()).min(1),
});

const patchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  permissions: z.array(z.string()).min(1).optional(),
});

function sanitizePermissions(perms: string[], actorPermissions: readonly string[]): string[] {
  const actorHasWildcard = hasPermission(actorPermissions, "*");
  const allowed = new Set<string>(ALL_PERMISSIONS);
  if (actorHasWildcard) allowed.add("*");
  return [...new Set(perms.filter((p) => allowed.has(p)))];
}

export async function handlePlatformRolesList(
  c: Context,
  db: PostgresJsDatabase<typeof schema>,
) {
  const rows = await db
    .select()
    .from(platformRoles)
    .orderBy(asc(platformRoles.isSystem), asc(platformRoles.name));
  return c.json({ roles: rows, allPermissions: ALL_PERMISSIONS });
}

export async function handlePlatformRoleCreate(
  c: Context,
  db: PostgresJsDatabase<typeof schema>,
) {
  const parsed = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid_body", detail: parsed.error.flatten() }, 400);
  }
  const actorPermissions: readonly string[] = c.get("actorPermissions") ?? [];
  const requestedWildcard = parsed.data.permissions.includes("*");
  if (requestedWildcard && !hasPermission(actorPermissions, "*")) {
    return c.json({ error: "forbidden", detail: "Only super_admin may grant wildcard permission" }, 403);
  }
  const permissions = sanitizePermissions(parsed.data.permissions, actorPermissions);
  if (permissions.length === 0) {
    return c.json({ error: "no_valid_permissions" }, 400);
  }
  const [row] = await db
    .insert(platformRoles)
    .values({
      name: parsed.data.name,
      slug: parsed.data.slug,
      isSystem: false,
      permissions,
    })
    .returning();
  return c.json({ role: row }, 201);
}

export async function handlePlatformRolePatch(
  c: Context,
  db: PostgresJsDatabase<typeof schema>,
  roleId: string,
) {
  const parsed = patchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid_body", detail: parsed.error.flatten() }, 400);
  }
  const [existing] = await db
    .select()
    .from(platformRoles)
    .where(eq(platformRoles.id, roleId))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);

  const set: Partial<typeof platformRoles.$inferInsert> = {
    updatedAt: new Date(),
  };
  const actorPermissions: readonly string[] = c.get("actorPermissions") ?? [];
  if (parsed.data.name) set.name = parsed.data.name;
  if (parsed.data.permissions) {
    const requestedWildcard = parsed.data.permissions.includes("*");
    if (requestedWildcard && !hasPermission(actorPermissions, "*")) {
      return c.json({ error: "forbidden", detail: "Only super_admin may grant wildcard permission" }, 403);
    }
    const permissions = sanitizePermissions(parsed.data.permissions, actorPermissions);
    if (permissions.length === 0) {
      return c.json({ error: "no_valid_permissions" }, 400);
    }
    if (existing.slug === "super_admin" && !permissions.includes("*")) {
      return c.json({ error: "super_admin_requires_wildcard" }, 400);
    }
    set.permissions = permissions;
  }

  const [row] = await db
    .update(platformRoles)
    .set(set)
    .where(eq(platformRoles.id, roleId))
    .returning();
  return c.json({ role: row });
}

export async function handlePlatformRoleDelete(
  c: Context,
  db: PostgresJsDatabase<typeof schema>,
  roleId: string,
) {
  const [existing] = await db
    .select()
    .from(platformRoles)
    .where(eq(platformRoles.id, roleId))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.isSystem) {
    return c.json({ error: "cannot_delete_system_role" }, 400);
  }
  await db.delete(platformRoles).where(eq(platformRoles.id, roleId));
  return c.json({ ok: true });
}

export function actorHasPermission(
  actorPermissions: readonly string[],
  required: readonly string[],
): boolean {
  if (hasPermission(actorPermissions, "*")) return true;
  return required.every((p) => hasPermission(actorPermissions, p));
}
