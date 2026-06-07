import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { owners } from "@repo/db/schema";
import { ROLE_RANK, type Role } from "@repo/shared/roles";
import { hasAllPermissions } from "@repo/shared/permissions";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { loadOwnerAuthById } from "../permissions/resolve-owner-permissions.js";
import { requiredPermissionsForRoute } from "../permissions/route-permissions.js";

export { ROLE_RANK };

type Db = PostgresJsDatabase<typeof schema>;

type RbacEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    actorEffectiveRole?: string;
    actorPermissions?: string[];
    requestId: string;
    requestStartMs: number;
  };
};

/**
 * @deprecated Use requiredPermissionsForRoute — kept for tests and gradual migration.
 */
export function requiredApiRole(pathname: string, method: string): Role | null {
  const perms = requiredPermissionsForRoute(pathname, method);
  if (!perms) return null;
  if (perms.includes("*")) return "super_admin";
  if (
    perms.includes("owners.manage") ||
    perms.includes("api_keys.manage") ||
    perms.includes("roles.manage") ||
    perms.includes("audit.read") ||
    perms.includes("email_logs.read")
  ) {
    return "super_admin";
  }
  if (perms.includes("licenses.suspend") || perms.includes("plans.manage")) {
    return "super_admin";
  }
  if (perms.includes("licenses.write") && !pathname.includes("/generate")) {
    return "billing_manager";
  }
  if (perms.includes("licenses.write")) return "super_admin";
  if (perms.includes("tenants.provision") || perms.includes("tenants.write")) {
    return "support_agent";
  }
  if (perms.includes("licenses.extend")) return "billing_manager";
  return "read_only";
}

/** Permission-string RBAC — production middleware for control-plane routes. */
export function createRbacMiddleware(db: Db | null): MiddlewareHandler<RbacEnv> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    const required = requiredPermissionsForRoute(path, method);
    if (!required) return next();
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const actorId = c.get("actorId") as string | undefined;
    if (!actorId) return c.json({ error: "unauthorized_actor" }, 401);

    const rows = await db
      .select({
        id: owners.id,
        role: owners.role,
        status: owners.status,
        sessionVersion: owners.sessionVersion,
      })
      .from(owners)
      .where(eq(owners.id, actorId))
      .limit(1);
    const actor = rows[0];
    if (!actor || actor.status !== "active") {
      return c.json({ error: "forbidden_actor" }, 403);
    }

    const auth = await loadOwnerAuthById(db, actorId);
    if (!auth) {
      return c.json({ error: "forbidden_actor" }, 403);
    }

    c.set("actorRole", auth.roleSlug);
    c.set("actorPermissions", [...auth.permissions]);

    if (!hasAllPermissions(auth.permissions, required)) {
      return c.json({ error: "forbidden_permission" }, 403);
    }

    await next();
  };
}

/** Role-rank RBAC used by the control-plane API (legacy path → min role). */
export function createRoleRankRbacMiddleware(db: Db | null): MiddlewareHandler<RbacEnv> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    const minRole = requiredApiRole(path, method);
    if (!minRole) return next();
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const actorId = c.get("actorId") as string | undefined;
    if (!actorId) return c.json({ error: "unauthorized_actor" }, 401);

    const rows = await db
      .select({
        id: owners.id,
        role: owners.role,
        status: owners.status,
        sessionVersion: owners.sessionVersion,
      })
      .from(owners)
      .where(eq(owners.id, actorId))
      .limit(1);
    const actor = rows[0];
    if (!actor || actor.status !== "active") {
      return c.json({ error: "forbidden_actor" }, 403);
    }
    if (!(actor.role in ROLE_RANK)) {
      return c.json({ error: "forbidden_role" }, 403);
    }
    const effectiveRole = (c.get("actorEffectiveRole") as Role | undefined) ?? (actor.role as Role);
    if (!(effectiveRole in ROLE_RANK)) {
      return c.json({ error: "forbidden_role" }, 403);
    }
    const actorRank = ROLE_RANK[effectiveRole];
    if (actorRank < ROLE_RANK[minRole]) {
      return c.json({ error: "forbidden_role" }, 403);
    }
    await next();
  };
}
