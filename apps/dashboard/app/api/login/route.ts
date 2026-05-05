import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { eq, isNotNull } from "drizzle-orm";

import { MFA_COOKIE, SESSION_COOKIE, signMfaToken, signSession } from "@/lib/session";

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
      passwordHash: owners.passwordHash,
      mfaEnabled: owners.mfaEnabled,
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
            passwordHash: owners.passwordHash,
            mfaEnabled: owners.mfaEnabled,
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
            passwordHash: owners.passwordHash,
            mfaEnabled: owners.mfaEnabled,
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
        role: fallbackOwner.role,
        email: fallbackOwner.email,
        name: fallbackOwner.name,
      });
      const jar = await cookies();
      jar.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      });
      return NextResponse.json({ ok: true });
    }
  }

  if (!owner) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (!owner.passwordHash) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ok = await bcrypt.compare(input.password, owner.passwordHash);
  if (!ok) {
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
    role: owner.role,
    email: owner.email,
    name: owner.name,
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
    .set({ lastLoginAt: new Date() })
    .where(eq(owners.id, owner.id));

  return NextResponse.json({ ok: true });
}
