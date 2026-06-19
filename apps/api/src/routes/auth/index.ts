import type { Hono } from "hono";
import { Hono as HonoApp } from "hono";
import { z } from "zod";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { apiConfig } from "@repo/config";
import { logger } from "../../lib/logger.js";

import { capabilitiesFromPermissions } from "@repo/shared/permissions";
import { validateAndResolveOwnerAuth } from "../../permissions/resolve-owner-permissions.js";
import { validateOwnerSession } from "../../services/auth/session-validation.js";
import { loginOwner, reconfirmOwnerPassword } from "../../services/auth/login.js";
import {
  completeOwnerPasswordReset,
  requestOwnerPasswordReset,
} from "../../services/auth/password-reset.js";
import { signMfaToken, signSessionToken, verifyMfaToken, verifySessionToken } from "../../services/auth/tokens.js";
import {
  beginMfaSetup,
  disableMfa,
  enableMfa,
  getMfaStatus,
  verifyMfaCode,
} from "../../services/mfa/mfa.js";
import { acceptInvite, getInviteByToken } from "../../services/invites/invites.js";
import { eq, sql } from "drizzle-orm";
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { getControlPlaneRedisClient } from "../../lib/redis.js";
import { invalidateSessionCache } from "../../middleware/auth.js";

function readCookie(req: Request, name: string): string {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const segments = cookieHeader.split(";").map((segment) => segment.trim());
  const pair = segments.find((segment) => segment.startsWith(`${name}=`));
  if (!pair) return "";
  return decodeURIComponent(pair.slice(name.length + 1));
}

export function buildAuthRoutes(db: PostgresJsDatabase<typeof schema>) {
  const auth = new HonoApp();
  const redisClient = getControlPlaneRedisClient();
  function makeAuthLimiter(keyPrefix: string, points: number) {
    if (redisClient) {
      return new RateLimiterRedis({ storeClient: redisClient, keyPrefix, points, duration: 60 });
    }
    return new RateLimiterMemory({ keyPrefix, points, duration: 60 });
  }
  const authLimiters = {
    "/auth/login": makeAuthLimiter("rl_auth_login", 10),
    "/auth/verify-mfa": makeAuthLimiter("rl_auth_mfa", 8),
    "/auth/invite/accept": makeAuthLimiter("rl_auth_invite", 6),
    "/auth/password/forgot": makeAuthLimiter("rl_auth_forgot", 5),
    "/auth/password/reset": makeAuthLimiter("rl_auth_reset", 5),
  } as const;
  const secureCookie = apiConfig.nodeEnv === "production" || apiConfig.publicBaseUrlScheme === "https";
  const cookieBase = `Path=/; HttpOnly; SameSite=Lax${secureCookie ? "; Secure" : ""}`;
  const dashboardOrigin = (() => {
    try {
      return new URL(apiConfig.dashboardUrl).origin;
    } catch {
      return "";
    }
  })();
  const sessionCookie = (token: string) =>
    `stockix-session=${encodeURIComponent(token)}; ${cookieBase}; Max-Age=${30 * 24 * 60 * 60}`;
  const mfaCookie = (token: string) =>
    `stockix-mfa=${encodeURIComponent(token)}; ${cookieBase}; Max-Age=${5 * 60}`;
  const expiredSessionCookie = () =>
    `stockix-session=; ${cookieBase}; Max-Age=0`;
  const expiredMfaCookie = () =>
    `stockix-mfa=; ${cookieBase}; Max-Age=0`;

  function csrfViolation(c: { req: { header: (name: string) => string | undefined } }) {
    const authHeader = c.req.header("authorization");
    if (authHeader) return false;
    const origin = c.req.header("origin");
    if (!origin) return true;
    if (!dashboardOrigin) return true;
    return origin !== dashboardOrigin;
  }

  function resolveClientIp(c: { req: { header: (name: string) => string | undefined } }) {
    const fwd = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "";
    return fwd.split(",")[0]?.trim() || "unknown";
  }

  async function enforceRateLimit(
    c: { req: { path: string; method: string; header: (name: string) => string | undefined }; header: (name: string, value: string) => void; json: (body: unknown, status?: number) => Response },
    routeKey: keyof typeof authLimiters,
    accountHint?: string,
  ): Promise<Response | null> {
    if (c.req.method.toUpperCase() !== "POST") return null;
    if (c.req.path !== routeKey) return null;
    const ip = resolveClientIp(c);
    const key = `${ip}:${accountHint ?? "anon"}`;
    try {
      await authLimiters[routeKey].consume(key);
      return null;
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfter = Math.max(1, Math.ceil(err.msBeforeNext / 1000));
        c.header("Retry-After", String(retryAfter));
        logger.warn("auth_rate_limit", {
          route: routeKey,
          ip,
          accountHint: accountHint ?? null,
          retryAfter,
        });
        return c.json({ success: false, error: "rate_limited", retryAfter }, 429);
      }
      // Fail open on Redis errors — don't block login on store unavailability
      return null;
    }
  }

  async function resolveSessionFromRequest(c: { req: { header: (name: string) => string | undefined; raw: Request } }) {
    const cookieToken = readCookie(c.req.raw, "stockix-session");
    // Platform API key is also sent via Authorization; session identity must come from auth cookie first.
    const headerToken = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const token = cookieToken || headerToken;
    if (!token) return null;
    return verifySessionToken(token);
  }

  auth.post("/session/validate", async (c) => {
    const session = await resolveSessionFromRequest(c);
    if (!session) return c.json({ success: false, error: "session_stale" }, 401);
    const result = await validateOwnerSession(db, {
      ownerId: session.sub,
      role: session.role,
      sessionVersion: session.sessionVersion,
    });
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, data: { ...result.data, session } });
  });

  auth.post("/login", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
        code: z.string().min(6).max(8).optional(),
        ipAddress: z.string().optional(),
        userAgent: z.string().nullable().optional(),
      })
      .safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const limited = await enforceRateLimit(c, "/auth/login", parsed.data.email.toLowerCase());
    if (limited) return limited;
    const result = await loginOwner(db, parsed.data);
    if (!result.success) return c.json(result, { status: (result.status ?? 401) as 401 });
    if (result.data.requiresMfa) {
      if (!parsed.data.code) {
        const mfaToken = await signMfaToken(result.data.ownerId);
        const response = c.json({ success: false, error: "mfa_required", requiresMfa: true }, 401);
        response.headers.append("Set-Cookie", mfaCookie(mfaToken));
        return response;
      }
      const verifyResult = await verifyMfaCode(db, {
        ownerId: result.data.ownerId,
        code: parsed.data.code,
        ipAddress: parsed.data.ipAddress ?? null,
        userAgent: parsed.data.userAgent ?? null,
      });
      if (!verifyResult.success) {
        return c.json(verifyResult, { status: (verifyResult.status ?? 401) as 401 });
      }
      const sessionToken = await signSessionToken({
        sub: verifyResult.data.id,
        role: verifyResult.data.role,
        email: verifyResult.data.email,
        name: verifyResult.data.name,
        sessionVersion: verifyResult.data.sessionVersion,
      });
      const response = c.json({ success: true, ok: true });
      response.headers.append("Set-Cookie", sessionCookie(sessionToken));
      response.headers.append("Set-Cookie", expiredMfaCookie());
      return response;
    }
    const sessionToken = await signSessionToken({
      sub: result.data.id,
      role: result.data.role,
      email: result.data.email,
      name: result.data.name,
      sessionVersion: result.data.sessionVersion,
    });
    const response = c.json({ success: true, ok: true });
    response.headers.append("Set-Cookie", sessionCookie(sessionToken));
    response.headers.append("Set-Cookie", expiredMfaCookie());
    return response;
  });

  auth.post("/mfa/begin", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const session = await resolveSessionFromRequest(c);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await beginMfaSetup(db, session.sub);
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ...result.data });
  });

  auth.post("/mfa/enable", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ code: z.string().min(6).max(8) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const session = await resolveSessionFromRequest(c);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await enableMfa(db, {
      ownerId: session.sub,
      code: parsed.data.code,
      ipAddress: c.req.header("x-forwarded-for"),
      userAgent: c.req.header("user-agent"),
    });
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ok: true, sessionVersion: result.data.sessionVersion });
  });

  auth.post("/mfa/disable", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ code: z.string().min(6).max(8) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const session = await resolveSessionFromRequest(c);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await disableMfa(db, {
      ownerId: session.sub,
      code: parsed.data.code,
      ipAddress: c.req.header("x-forwarded-for"),
      userAgent: c.req.header("user-agent"),
    });
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ok: true, sessionVersion: result.data.sessionVersion });
  });

  auth.get("/mfa/status", async (c) => {
    const session = await resolveSessionFromRequest(c);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await getMfaStatus(db, session.sub);
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ...result.data });
  });

  auth.post("/reconfirm", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ password: z.string().min(1) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const session = await resolveSessionFromRequest(c);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await reconfirmOwnerPassword(db, {
      ownerId: session.sub,
      password: parsed.data.password,
    });
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ok: true });
  });

  auth.post("/verify-mfa", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const limited = await enforceRateLimit(c, "/auth/verify-mfa");
    if (limited) return limited;
    const body = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({ code: z.string().min(6).max(8) })
      .safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const mfaToken = readCookie(c.req.raw, "stockix-mfa");
    const ownerId = mfaToken ? await verifyMfaToken(mfaToken) : null;
    if (!ownerId) return c.json({ success: false, error: "MFA token expired", status: 401 }, 401);
    const result = await verifyMfaCode(db, {
      ownerId,
      code: parsed.data.code,
      ipAddress: c.req.header("x-forwarded-for"),
      userAgent: c.req.header("user-agent"),
    });
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    const sessionToken = await signSessionToken({
      sub: result.data.id,
      role: result.data.role,
      email: result.data.email,
      name: result.data.name,
      sessionVersion: result.data.sessionVersion,
    });
    const response = c.json({ success: true, ok: true });
    response.headers.append("Set-Cookie", sessionCookie(sessionToken));
    response.headers.append("Set-Cookie", expiredMfaCookie());
    return response;
  });

  auth.get("/me", async (c) => {
    const session = await resolveSessionFromRequest(c);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await validateAndResolveOwnerAuth(db, {
      ownerId: session.sub,
      role: session.role,
      sessionVersion: session.sessionVersion,
    });
    if (!result.success) return c.json(result, { status: result.status });
    const { auth } = result;
    const capabilities = capabilitiesFromPermissions(auth.permissions);
    return c.json({
      success: true,
      me: {
        id: session.sub,
        role: auth.roleSlug,
        roleId: auth.roleId,
        roleName: auth.roleName,
        email: session.email,
        name: session.name,
        permissions: auth.permissions,
        capabilities,
      },
    });
  });

  auth.post("/logout", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    // Bump sessionVersion so all outstanding tokens are invalidated on next use.
    const cookieToken = readCookie(c.req.raw, "stockix-session");
    const headerToken = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const token = cookieToken || headerToken;
    if (token) {
      const session = await verifySessionToken(token).catch(() => null);
      if (session?.sub) {
        await db
          .update(schema.owners)
          .set({ sessionVersion: sql`${schema.owners.sessionVersion} + 1` })
          .where(eq(schema.owners.id, session.sub))
          .catch(() => null);
        await invalidateSessionCache(token);
      }
    }
    const response = c.json({ success: true, ok: true });
    response.headers.append("Set-Cookie", expiredSessionCookie());
    response.headers.append("Set-Cookie", expiredMfaCookie());
    return response;
  });

  auth.get("/invite/:token", async (c) => {
    const token = c.req.param("token");
    const parsed = z.string().uuid().safeParse(token);
    if (!parsed.success) return c.json({ success: false, error: "Invite token invalid or expired" }, 404);
    const result = await getInviteByToken(db, parsed.data);
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ...result.data });
  });

  auth.post("/invite/accept", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const limited = await enforceRateLimit(c, "/auth/invite/accept");
    if (limited) return limited;
    const body = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({
        token: z.string().uuid(),
        password: z
          .string()
          .min(12)
          .regex(/[A-Z]/)
          .regex(/[a-z]/)
          .regex(/[0-9]/)
          .regex(/[^A-Za-z0-9]/),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error:
            "Password must be at least 12 characters and include uppercase, lowercase, number, and special character.",
        },
        400,
      );
    }
    const result = await acceptInvite(db, parsed.data);
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ok: true });
  });

  auth.post("/password/forgot", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ email: z.string().email() }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const limited = await enforceRateLimit(c, "/auth/password/forgot", parsed.data.email.toLowerCase());
    if (limited) return limited;
    const result = await requestOwnerPasswordReset(db, {
      email: parsed.data.email,
      ipAddress: c.req.header("x-forwarded-for"),
      userAgent: c.req.header("user-agent"),
    });
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    if (result.data.ok) {
      logger.info("Password reset requested", {
        event: "auth_password_reset_requested",
        emailSent: result.data.emailSent,
        mailConfigured: result.data.mailConfigured,
        mailStatus: result.data.mailStatus,
        accountPending: result.data.accountPending,
      });
    }
    return c.json({ success: true, ok: true });
  });

  auth.post("/password/reset", async (c) => {
    if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
    const limited = await enforceRateLimit(c, "/auth/password/reset");
    if (limited) return limited;
    const body = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({
        token: z.string().min(1),
        password: z
          .string()
          .min(12)
          .regex(/[A-Z]/)
          .regex(/[a-z]/)
          .regex(/[0-9]/)
          .regex(/[^A-Za-z0-9]/),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error:
            "Password must be at least 12 characters and include uppercase, lowercase, number, and special character.",
        },
        400,
      );
    }
    const result = await completeOwnerPasswordReset(db, {
      token: parsed.data.token,
      password: parsed.data.password,
      ipAddress: c.req.header("x-forwarded-for"),
      userAgent: c.req.header("user-agent"),
    });
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ok: true });
  });

  return auth;
}

type AuthMountEnv = {
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

/** Mounts `/auth/*` login, MFA, invite, and password-reset routes. */
export function registerAuthRoutes(
  app: Hono<AuthMountEnv>,
  db: PostgresJsDatabase<typeof schema> | null,
): void {
  if (!db) return;
  app.route("/auth", buildAuthRoutes(db));
}
