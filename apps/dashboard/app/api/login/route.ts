import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { createDb } from "@repo/db";
import { adminAuditLog, owners } from "@repo/db/schema";
import { eq, isNotNull } from "drizzle-orm";

import { ROLES, type Role } from "@/lib/roles";
import { MFA_COOKIE, SESSION_COOKIE, signMfaToken, signSession } from "@/lib/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth-security";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function asRole(value: string): Role | null {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

export async function POST(req: Request) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "Auth not configured on server" }, { status: 503 });
  }

  let input: z.infer<typeof loginSchema>;
  try {
    input = loginSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = createDb(databaseUrl);
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || "unknown";
  const rateKey = `${ipAddress}:${input.email.toLowerCase()}`;
  const limiter = checkRateLimit(rateKey);
  if (limiter.limited) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429, headers: { "retry-after": String(limiter.retryAfterSec) } },
    );
  }

  const hasActivated = await db
    .select({ id: owners.id })
    .from(owners)
    .where(isNotNull(owners.passwordHash))
    .limit(1);

  const [owner] = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      status: owners.status,
      passwordHash: owners.passwordHash,
      mfaEnabled: owners.mfaEnabled,
      sessionVersion: owners.sessionVersion,
      failedLoginCount: owners.failedLoginCount,
      lockedUntil: owners.lockedUntil,
    })
    .from(owners)
    .where(eq(owners.email, input.email))
    .limit(1);

  if (hasActivated.length === 0) {
    const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
    const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
    if (
      typeof adminEmail === "string" &&
      typeof adminPassword === "string" &&
      timingSafeEqual(adminEmail, input.email) &&
      timingSafeEqual(adminPassword, input.password)
    ) {
      console.warn("[auth] fallback env-var login used");
      let fallbackOwner = owner ?? undefined;
      if (!fallbackOwner) {
        const [created] = await db
          .insert(owners)
          .values({
            email: input.email,
            name: "Platform Admin",
            role: "super_admin",
            mfaEnabled: false,
          })
          .onConflictDoNothing()
          .returning({
            id: owners.id,
            email: owners.email,
            name: owners.name,
            role: owners.role,
            status: owners.status,
            passwordHash: owners.passwordHash,
            mfaEnabled: owners.mfaEnabled,
            sessionVersion: owners.sessionVersion,
            failedLoginCount: owners.failedLoginCount,
            lockedUntil: owners.lockedUntil,
          });
        fallbackOwner = created ?? owner ?? undefined;
      }
      if (!fallbackOwner) {
        const [existingOwner] = await db
          .select({
            id: owners.id,
            email: owners.email,
            name: owners.name,
            role: owners.role,
            status: owners.status,
            passwordHash: owners.passwordHash,
            mfaEnabled: owners.mfaEnabled,
            sessionVersion: owners.sessionVersion,
            failedLoginCount: owners.failedLoginCount,
            lockedUntil: owners.lockedUntil,
          })
          .from(owners)
          .where(eq(owners.email, input.email))
          .limit(1);
        fallbackOwner = existingOwner ?? undefined;
      }
      if (!fallbackOwner) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      const token = await signSession({
        id: fallbackOwner.id,
        role: asRole(fallbackOwner.role) ?? "read_only",
        email: fallbackOwner.email,
        name: fallbackOwner.name,
        sessionVersion: fallbackOwner.sessionVersion ?? 1,
      });
      const jar = await cookies();
      jar.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      });
      resetRateLimit(rateKey);
      return NextResponse.json({ ok: true });
    }
  }

  if (!owner) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (owner.status !== "active") {
    return NextResponse.json({ error: "Account disabled" }, { status: 403 });
  }

  if (owner.lockedUntil && owner.lockedUntil.getTime() > Date.now()) {
    return NextResponse.json(
      { error: "Account temporarily locked. Try again later." },
      { status: 423 },
    );
  }

  if (!owner.passwordHash) {
    await db
      .update(owners)
      .set({
        failedLoginCount: (owner.failedLoginCount ?? 0) + 1,
        lastFailedAt: new Date(),
      })
      .where(eq(owners.id, owner.id));
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ok = await bcrypt.compare(input.password, owner.passwordHash);
  if (!ok) {
    const nextFailed = (owner.failedLoginCount ?? 0) + 1;
    const lockForMs = 15 * 60 * 1000;
    await db
      .update(owners)
      .set({
        failedLoginCount: nextFailed,
        lastFailedAt: new Date(),
        lockedUntil: nextFailed >= 5 ? new Date(Date.now() + lockForMs) : null,
      })
      .where(eq(owners.id, owner.id));
    await db.insert(adminAuditLog).values({
      actorId: owner.id,
      action: "auth.login_failed",
      targetOwnerId: owner.id,
      ipAddress: forwardedFor || null,
      userAgent: req.headers.get("user-agent"),
      metadata: { reason: "invalid_password", failedCount: nextFailed },
    });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const jar = await cookies();
  if (owner.mfaEnabled) {
    const mfaToken = await signMfaToken(owner.id);
    jar.set(MFA_COOKIE, mfaToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5 * 60,
      path: "/",
    });
    return NextResponse.json({ requiresMfa: true, mfaToken: "cookie" });
  }

  const token = await signSession({
    id: owner.id,
    role: asRole(owner.role) ?? "read_only",
    email: owner.email,
    name: owner.name,
    sessionVersion: owner.sessionVersion ?? 1,
  });
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  jar.delete(MFA_COOKIE);
  await db
    .update(owners)
    .set({
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      lastFailedAt: null,
      lockedUntil: null,
    })
    .where(eq(owners.id, owner.id));
  await db.insert(adminAuditLog).values({
    actorId: owner.id,
    action: "auth.login_success",
    targetOwnerId: owner.id,
    ipAddress: forwardedFor || null,
    userAgent: req.headers.get("user-agent"),
    metadata: { mfa: false },
  });
  resetRateLimit(rateKey);

  return NextResponse.json({ ok: true });
}
