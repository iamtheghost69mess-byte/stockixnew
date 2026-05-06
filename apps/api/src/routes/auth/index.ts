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

export function buildAuthRoutes(db: PostgresJsDatabase<typeof schema>) {
  const auth = new Hono();
  const sessionCookie = (token: string) =>
    `stockix-session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`;
  const mfaCookie = (token: string) =>
    `stockix-mfa=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${5 * 60}`;

  auth.post("/session/validate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ sessionToken: z.string().min(1) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "invalid_body" }, 400);
    const session = await verifySessionToken(parsed.data.sessionToken);
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
        ipAddress: z.string().optional(),
        userAgent: z.string().nullable().optional(),
      })
      .safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const result = await loginOwner(db, parsed.data);
    if (!result.success) return c.json(result, { status: (result.status ?? 401) as 401 });
    if (result.data.requiresMfa) {
      const mfaToken = await signMfaToken(result.data.ownerId);
      const response = c.json({ success: true, requiresMfa: true });
      response.headers.append("Set-Cookie", mfaCookie(mfaToken));
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
    return response;
  });

  auth.post("/mfa/begin", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ sessionToken: z.string().min(1) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "invalid_body" }, 400);
    const session = await verifySessionToken(parsed.data.sessionToken);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await beginMfaSetup(db, session.sub);
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ...result.data });
  });

  auth.post("/mfa/enable", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ sessionToken: z.string().min(1), code: z.string().min(6).max(8) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const session = await verifySessionToken(parsed.data.sessionToken);
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
    const parsed = z.object({ sessionToken: z.string().min(1), code: z.string().min(6).max(8) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const session = await verifySessionToken(parsed.data.sessionToken);
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
    const sessionToken = c.req.query("sessionToken") ?? "";
    const session = await verifySessionToken(sessionToken);
    if (!session) return c.json({ success: false, error: "unauthorized" }, 401);
    const result = await getMfaStatus(db, session.sub);
    if (!result.success) return c.json(result, { status: (result.status ?? 400) as 400 });
    return c.json({ success: true, ...result.data });
  });

  auth.post("/reconfirm", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ sessionToken: z.string().min(1), password: z.string().min(1) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const session = await verifySessionToken(parsed.data.sessionToken);
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
      .object({ mfaToken: z.string().min(1), code: z.string().min(6).max(8) })
      .safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: "Invalid request body" }, 400);
    const ownerId = await verifyMfaToken(parsed.data.mfaToken);
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

