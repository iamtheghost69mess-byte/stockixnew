import type { MiddlewareHandler } from "hono";
import { apiConfig } from "@repo/config";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { validateOwnerSession } from "../services/auth/session-validation.js";
import { verifySessionToken } from "../services/auth/tokens.js";

type Db = PostgresJsDatabase<typeof schema>;

type AuthEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

function readCookie(req: Request, name: string): string {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const segments = cookieHeader.split(";").map((segment) => segment.trim());
  const pair = segments.find((segment) => segment.startsWith(`${name}=`));
  if (!pair) return "";
  return decodeURIComponent(pair.slice(name.length + 1));
}

/**
 * Creates the platform-secret + worker-secret gate middleware.
 * Must run before the actor session resolver.
 */
export function createAuthGate(
  platformApiSecret: string | undefined,
  workerSecret: string | undefined,
): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    if (c.req.path === "/health") {
      await next();
      return;
    }
    // Internal job routes are protected by WORKER_SECRET, not PLATFORM_API_SECRET.
    // A dashboard operator must not be able to reach these endpoints (CRIT-01).
    if (c.req.path.startsWith("/internal/jobs")) {
      const auth = c.req.header("Authorization") ?? "";
      if (!workerSecret || auth !== `Bearer ${workerSecret}`) {
        return c.json({ error: "unauthorized" }, 401);
      }
      await next();
      return;
    }
    if (!platformApiSecret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const auth = c.req.header("Authorization") ?? "";
    if (auth === `Bearer ${platformApiSecret}`) {
      await next();
      return;
    }
    // Allow valid owner session cookie as fallback for dashboard-origin requests.
    const cookieToken = readCookie(c.req.raw, "stockix-session");
    if (cookieToken) {
      const session = await verifySessionToken(cookieToken);
      if (session) {
        await next();
        return;
      }
    }
    return c.json({ error: "unauthorized" }, 401);
  };
}

/**
 * Creates the actor session resolution middleware.
 * Bypasses /health, /auth, and /internal/jobs routes.
 * Sets actorId and actorRole on context.
 */
export function createActorResolver(db: Db | null): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const path = c.req.path;
    if (path === "/health" || path.startsWith("/auth") || path.startsWith("/internal/jobs")) {
      await next();
      return;
    }
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const cookieToken = readCookie(c.req.raw, "stockix-session");
    // Dashboard calls include platform Authorization; actor identity should come from session cookie first.
    const headerToken = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const token = cookieToken || headerToken;
    if (!token) return c.json({ error: "unauthorized_actor" }, 401);

    const session = await verifySessionToken(token);
    if (!session) return c.json({ error: "unauthorized_actor" }, 401);
    const sessionCheck = await validateOwnerSession(db, {
      ownerId: session.sub,
      role: session.role,
      sessionVersion: session.sessionVersion,
    });
    if (!sessionCheck.success) {
      return c.json({ error: "forbidden_actor" }, 403);
    }
    c.set("actorId", session.sub);
    c.set("actorRole", session.role);
    await next();
  };
}
