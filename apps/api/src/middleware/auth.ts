import { ROLES } from "@repo/shared/roles";
import { and, asc, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { owners } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { isKnownControlPlanePath } from "./known-api-paths.js";
import {
  findActiveApiKeyByRaw,
  scheduleApiKeyLastUsedTouch,
} from "../services/api-keys.js";
import { validateOwnerSession } from "../services/auth/session-validation.js";
import { verifySessionToken } from "../services/auth/tokens.js";
import { loadOwnerAuthById } from "../permissions/resolve-owner-permissions.js";

type Db = PostgresJsDatabase<typeof schema>;

async function attachActorPermissions(db: Db, actorId: string): Promise<string[]> {
  const auth = await loadOwnerAuthById(db, actorId);
  if (!auth) return [];
  return [...auth.permissions];
}

export type ControlPlaneAuthEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    actorEffectiveRole?: string;
    actorPermissions?: string[];
    apiKeyId?: string;
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

/** Platform secret, worker secret, and session-cookie gate before actor resolution. */
export function createPlatformAuthGate(
  platformApiSecret: string | undefined,
  workerSecret: string | undefined,
): MiddlewareHandler<ControlPlaneAuthEnv> {
  return async (c, next) => {
    const pubPath = c.req.path;
    const pubMethod = c.req.method.toUpperCase();
    if (pubPath === "/health" || pubPath === "/ready") {
      await next();
      return;
    }
    if (pubMethod === "GET" && pubPath.startsWith("/public/tenant/")) {
      await next();
      return;
    }
    if (
      pubMethod === "POST"
      && (pubPath === "/licenses/activate" || pubPath === "/licenses/verify-offline")
    ) {
      await next();
      return;
    }
    if (pubPath.startsWith("/webhooks/")) {
      await next();
      return;
    }
    if (
      c.req.path.startsWith("/internal/jobs")
      || c.req.path.startsWith("/internal/organizations")
    ) {
      const auth = c.req.header("Authorization") ?? "";
      if (!workerSecret || auth !== `Bearer ${workerSecret}`) {
        return c.json({ error: "unauthorized" }, 401);
      }
      await next();
      return;
    }
    if (!isKnownControlPlanePath(pubPath)) {
      return c.json(
        {
          success: false,
          error: "Not found",
          path: pubPath,
          method: pubMethod,
        },
        404,
      );
    }
    if (!platformApiSecret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const auth = c.req.header("Authorization") ?? "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    if (auth === `Bearer ${platformApiSecret}`) {
      await next();
      return;
    }
    if (bearer.startsWith("sk_live_")) {
      await next();
      return;
    }
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

/** Resolves actorId / actorRole from session cookie, API key, or platform secret. */
export function createActorResolver(
  db: Db | null,
  platformApiSecret: string | undefined,
): MiddlewareHandler<ControlPlaneAuthEnv> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    if (
      path === "/health"
      || path === "/ready"
      || path.startsWith("/auth")
      || path.startsWith("/webhooks/")
      || path.startsWith("/internal/jobs")
      || path.startsWith("/internal/organizations")
    ) {
      await next();
      return;
    }
    if (method === "GET" && path.startsWith("/public/tenant/")) {
      await next();
      return;
    }
    if (method === "POST" && (path === "/licenses/activate" || path === "/licenses/verify-offline")) {
      await next();
      return;
    }
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const cookieToken = readCookie(c.req.raw, "stockix-session");
    const headerToken = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

    if (cookieToken) {
      const session = await verifySessionToken(cookieToken);
      if (session) {
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
        c.set("actorPermissions", await attachActorPermissions(db, session.sub));
        await next();
        return;
      }
      // Cookie present but expired or invalid — fall through to try other auth methods.
    }

    if (headerToken.startsWith("sk_live_")) {
      const resolved = await findActiveApiKeyByRaw(db, headerToken);
      if (!resolved) {
        return c.json({ error: "unauthorized_actor" }, 401);
      }
      const [ownerRow] = await db
        .select({ id: owners.id, status: owners.status })
        .from(owners)
        .where(eq(owners.id, resolved.ownerId))
        .limit(1);
      if (!ownerRow || ownerRow.status !== "active") {
        return c.json({ error: "forbidden_actor" }, 403);
      }
      c.set("actorId", resolved.ownerId);
      c.set("actorRole", "read_only");
      c.set("actorEffectiveRole", "read_only");
      c.set("actorPermissions", await attachActorPermissions(db, resolved.ownerId));
      c.set("apiKeyId", resolved.keyId);
      scheduleApiKeyLastUsedTouch(db, resolved.keyId);
      await next();
      return;
    }

    if (platformApiSecret && headerToken === platformApiSecret) {
      const [platformActor] = await db
        .select({ id: owners.id })
        .from(owners)
        .where(and(eq(owners.role, ROLES[0]), eq(owners.status, "active")))
        .orderBy(asc(owners.createdAt))
        .limit(1);
      if (!platformActor) {
        return c.json(
          {
            error: "platform_actor_unresolved",
            message: "No active super_admin owner for platform API secret auth",
          },
          503,
        );
      }
      c.set("actorId", platformActor.id);
      c.set("actorRole", "super_admin");
      c.set("actorPermissions", await attachActorPermissions(db, platformActor.id));
      await next();
      return;
    }

    if (!headerToken) {
      return c.json({ error: "unauthorized_actor" }, 401);
    }

    const session = await verifySessionToken(headerToken);
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
    c.set("actorPermissions", await attachActorPermissions(db, session.sub));
    await next();
  };
}
