import { createHash } from "node:crypto";
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

// ---------------------------------------------------------------------------
// Session validation cache
// Eliminates redundant DB lookups when the same session fires multiple
// concurrent requests (e.g. the 7+ parallel fetches on dashboard page load).
// TTL is short enough that session revocations (sessionVersion bump) take
// effect within SESSION_CACHE_TTL_MS milliseconds.
// ---------------------------------------------------------------------------
const SESSION_CACHE_TTL_MS = 5_000;
type SessionCacheEntry = { ownerId: string; role: string; permissions: string[]; validUntil: number };
const _sessionCache = new Map<string, SessionCacheEntry>();

function sessionCacheKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getSessionCache(tokenHash: string): SessionCacheEntry | undefined {
  const entry = _sessionCache.get(tokenHash);
  if (!entry) return undefined;
  if (Date.now() > entry.validUntil) {
    _sessionCache.delete(tokenHash);
    return undefined;
  }
  return entry;
}

function setSessionCache(tokenHash: string, ownerId: string, role: string, permissions: string[]): void {
  // Evict stale entries before inserting to keep memory bounded.
  if (_sessionCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of _sessionCache) {
      if (now > v.validUntil) _sessionCache.delete(k);
    }
  }
  _sessionCache.set(tokenHash, { ownerId, role, permissions, validUntil: Date.now() + SESSION_CACHE_TTL_MS });
}

/** Invalidate a session immediately (call after password change / forced logout). */
export function invalidateSessionCache(token: string): void {
  _sessionCache.delete(sessionCacheKey(token));
}

// ---------------------------------------------------------------------------
// Platform actor cache
// The "first active super_admin" almost never changes; cache it to avoid a
// DB round-trip on every server-to-server request using the platform secret.
// ---------------------------------------------------------------------------
const PLATFORM_ACTOR_TTL_MS = 60_000;
let _platformActor: { id: string; permissions: string[] } | null = null;
let _platformActorValidUntil = 0;

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

    // ── Session cookie ─────────────────────────────────────────────────────
    if (cookieToken) {
      const session = await verifySessionToken(cookieToken);
      if (session) {
        const tokenHash = sessionCacheKey(cookieToken);
        const cached = getSessionCache(tokenHash);
        if (cached) {
          c.set("actorId", cached.ownerId);
          c.set("actorRole", cached.role);
          c.set("actorPermissions", cached.permissions);
          await next();
          return;
        }

        const sessionCheck = await validateOwnerSession(db, {
          ownerId: session.sub,
          role: session.role,
          sessionVersion: session.sessionVersion,
        });
        if (!sessionCheck.success) {
          return c.json({ error: "forbidden_actor" }, 403);
        }
        const permissions = await attachActorPermissions(db, session.sub);
        setSessionCache(tokenHash, session.sub, session.role, permissions);
        c.set("actorId", session.sub);
        c.set("actorRole", session.role);
        c.set("actorPermissions", permissions);
        await next();
        return;
      }
      // Invalid/expired cookie — fall through to API key / Bearer token.
    }

    // ── API key ────────────────────────────────────────────────────────────
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

    // ── Platform API secret ────────────────────────────────────────────────
    if (platformApiSecret && headerToken === platformApiSecret) {
      // Use a cached platform actor to avoid a DB round-trip on every
      // server-to-server request (dashboard Route Handlers use this path).
      if (_platformActor && Date.now() < _platformActorValidUntil) {
        c.set("actorId", _platformActor.id);
        c.set("actorRole", "super_admin");
        c.set("actorPermissions", _platformActor.permissions);
        await next();
        return;
      }
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
      const platformPermissions = await attachActorPermissions(db, platformActor.id);
      _platformActor = { id: platformActor.id, permissions: platformPermissions };
      _platformActorValidUntil = Date.now() + PLATFORM_ACTOR_TTL_MS;
      c.set("actorId", platformActor.id);
      c.set("actorRole", "super_admin");
      c.set("actorPermissions", platformPermissions);
      await next();
      return;
    }

    // ── Bearer token (session in Authorization header) ─────────────────────
    if (!headerToken) {
      return c.json({ error: "unauthorized_actor" }, 401);
    }

    const session = await verifySessionToken(headerToken);
    if (!session) return c.json({ error: "unauthorized_actor" }, 401);

    const tokenHash = sessionCacheKey(headerToken);
    const cached = getSessionCache(tokenHash);
    if (cached) {
      c.set("actorId", cached.ownerId);
      c.set("actorRole", cached.role);
      c.set("actorPermissions", cached.permissions);
      await next();
      return;
    }

    const sessionCheck = await validateOwnerSession(db, {
      ownerId: session.sub,
      role: session.role,
      sessionVersion: session.sessionVersion,
    });
    if (!sessionCheck.success) {
      return c.json({ error: "forbidden_actor" }, 403);
    }
    const permissions = await attachActorPermissions(db, session.sub);
    setSessionCache(tokenHash, session.sub, session.role, permissions);
    c.set("actorId", session.sub);
    c.set("actorRole", session.role);
    c.set("actorPermissions", permissions);
    await next();
  };
}
