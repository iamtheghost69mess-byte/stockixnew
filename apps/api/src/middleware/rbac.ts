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
 * Returns the minimum Role required to call a given route, or null if no role is needed.
 */
export function requiredApiRole(pathname: string, method: string): Role | null {
  if (pathname === "/health") return null;
  if (pathname.startsWith("/auth")) return null;
  if (pathname.startsWith("/internal/jobs")) return null;
  if (pathname.startsWith("/owners")) {
    if (method === "GET") return "read_only";
    return "super_admin";
  }
  if (pathname.startsWith("/tenants")) {
    if (pathname.includes("/provision")) return "support_agent";
    if (method === "GET") return "read_only";
    return "super_admin";
  }
  return "read_only";
}

/**
 * Creates the RBAC enforcement middleware.
 * Looks up the actor in the DB, checks their role rank against the required minimum.
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
