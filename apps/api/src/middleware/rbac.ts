import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { owners } from "@repo/db/schema";
import { ROLE_RANK, type Role } from "@repo/shared/roles";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

export { ROLE_RANK };

type Db = PostgresJsDatabase<typeof schema>;

type RbacEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

/**
 * Minimum role required for a dashboard / platform API route.
 * POS and public routes return null (no owner RBAC — other layers apply).
 */
export function requiredApiRole(pathname: string, method: string): Role | null {
  const m = method.toUpperCase();
  if (pathname === "/health") return null;
  if (pathname.startsWith("/auth")) return null;
  if (pathname.startsWith("/internal/jobs")) return null;
  if (m === "POST" && pathname === "/licenses/activate") return null;
  if (m === "POST" && pathname === "/licenses/verify-offline") return null;
  if (m === "GET" && pathname === "/plans") return null;
  if (m === "GET" && pathname.startsWith("/public/tenant-orgs/")) return null;

  if (pathname.startsWith("/licenses")) {
    if (m === "GET") return "read_only";
    if (m === "POST" && pathname.endsWith("/extend")) return "billing_manager";
    if (m === "PATCH") return "billing_manager";
    if (pathname.endsWith("/deactivate")) return "support_agent";
    return "super_admin";
  }
  if (pathname.startsWith("/fingerprints")) return "super_admin";
  if (pathname.startsWith("/owners")) {
    if (m === "GET") return "read_only";
    return "super_admin";
  }
  if (pathname.startsWith("/tenants")) {
    if (pathname.includes("/organization-access")) return "super_admin";
    if (pathname.includes("/provision")) return "support_agent";
    if (pathname.includes("/organizations") && m !== "GET") return "support_agent";
    if (m === "GET") return "read_only";
    return "super_admin";
  }
  return "read_only";
}

/**
 * Creates the RBAC enforcement middleware.
 */
export function createRbacMiddleware(db: Db | null): MiddlewareHandler<RbacEnv> {
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
    const actorRank = ROLE_RANK[actor.role as Role];
    if (actorRank < ROLE_RANK[minRole]) {
      return c.json({ error: "forbidden_role" }, 403);
    }
    await next();
  };
}
