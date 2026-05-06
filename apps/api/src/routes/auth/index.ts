import { Hono } from "hono";
import { z } from "zod";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { validateOwnerSession } from "../../services/auth/session-validation.js";
import { loginOwner, reconfirmOwnerPassword } from "../../services/auth/login.js";
import { signMfaToken, signSessionToken, verifyMfaToken, verifySessionToken } from "../../services/auth/tokens.js";
import {
  beginMfaSetup,
  disableMfa,
  enableMfa,
  getMfaStatus,
  verifyMfaCode,
} from "../../services/mfa/mfa.js";
import { acceptInvite, getInviteByToken } from "../../services/invites/invites.js";

function readCookie(req: Request, name: string): string {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const segments = cookieHeader.split(";").map((segment) => segment.trim());
  const pair = segments.find((segment) => segment.startsWith(`${name}=`));
  if (!pair) return "";
  return decodeURIComponent(pair.slice(name.length + 1));
}

export function buildAuthRoutes(db: PostgresJsDatabase<typeof schema>) {
  const auth = new Hono();
  const sessionCookie = (token: string) =>
    `stockix-session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`;
  const mfaCookie = (token: string) =>
    `stockix-mfa=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${5 * 60}`;
  const expiredSessionCookie = () =>
    "stockix-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  const expiredMfaCookie = () =>
    "stockix-mfa=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

  async function resolveSessionFromRequest(c: { req: { header: (name: string) => string | undefined; raw: Request } }) {
    const headerToken = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const cookieToken = readCookie(c.req.raw, "stockix-session");
    const token = headerToken || cookieToken;
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
    const session = await resolveSessionFromRequest(c);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await beginMfaSetup(db, session.sub);
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ...result.data });
  });

  auth.post("/mfa/enable", async (c) => {
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
    const result = await validateOwnerSession(db, {
      ownerId: session.sub,
      role: session.role,
      sessionVersion: session.sessionVersion,
    });
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({
      success: true,
      me: {
        id: session.sub,
        role: session.role,
        email: session.email,
        name: session.name,
        capabilities: {
          canAccessSettings: session.role === "super_admin",
          canManageOwners: session.role === "super_admin",
          canManageTenants: session.role !== "read_only",
        },
      },
    });
  });

  auth.post("/logout", (c) => {
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

  return auth;
}

