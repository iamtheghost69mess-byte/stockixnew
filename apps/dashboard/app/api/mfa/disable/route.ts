import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verify } from "otplib";
import { createDb } from "@repo/db";
import { adminAuditLog, owners } from "@repo/db/schema";
import { eq } from "drizzle-orm";

import {
  RECENT_AUTH_COOKIE,
  SESSION_COOKIE,
  signSession,
  verifyRecentAuthToken,
  verifySession,
} from "@/lib/session";

const schema = z.object({
  code: z.string().min(6).max(8),
});

export async function POST(req: Request) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      { error: "Auth not configured on server" },
      { status: 503 },
    );
  }
  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value ?? "";
  const session = sessionToken ? await verifySession(sessionToken) : null;
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const recentAuthToken = jar.get(RECENT_AUTH_COOKIE)?.value ?? "";
  const recentOwnerId = recentAuthToken
    ? await verifyRecentAuthToken(recentAuthToken)
    : null;
  if (recentOwnerId !== session.sub) {
    return NextResponse.json({ error: "reauth_required" }, { status: 401 });
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = createDb(databaseUrl);
  const [owner] = await db
    .select({
      id: owners.id,
      mfaSecret: owners.mfaSecret,
      mfaEnabled: owners.mfaEnabled,
      sessionVersion: owners.sessionVersion,
    })
    .from(owners)
    .where(eq(owners.id, session.sub))
    .limit(1);
  if (!owner?.mfaEnabled || !owner.mfaSecret) {
    return NextResponse.json({ error: "not_enabled" }, { status: 409 });
  }

  const verifyResult = await verify({ token: input.code, secret: owner.mfaSecret });
  const isValidCode =
    typeof verifyResult === "boolean"
      ? verifyResult
      : Boolean((verifyResult as { valid?: boolean }).valid);
  if (!isValidCode) {
    return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
  }

  await db
    .update(owners)
    .set({
      mfaSecret: null,
      mfaEnabled: false,
      sessionVersion: (owner.sessionVersion ?? 1) + 1,
    })
    .where(eq(owners.id, session.sub));
  await db.insert(adminAuditLog).values({
    actorId: session.sub,
    action: "auth.mfa_disabled",
    targetOwnerId: session.sub,
    ipAddress: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    metadata: { outcome: "success" },
  });
  const refreshedSession = await signSession({
    id: session.sub,
    role: session.role,
    email: session.email,
    name: session.name,
    sessionVersion: (owner.sessionVersion ?? 1) + 1,
  });
  jar.set(SESSION_COOKIE, refreshedSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
