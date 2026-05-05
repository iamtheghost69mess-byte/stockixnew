import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verify } from "otplib";
import { createDb } from "@repo/db";
import { adminAuditLog, owners } from "@repo/db/schema";
import { eq } from "drizzle-orm";

import {
  MFA_SETUP_COOKIE,
  SESSION_COOKIE,
  signSession,
  verifyMfaSetupToken,
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

  const setupToken = jar.get(MFA_SETUP_COOKIE)?.value ?? "";
  const setup = setupToken ? await verifyMfaSetupToken(setupToken) : null;
  if (!setup || setup.ownerId !== session.sub) {
    return NextResponse.json({ error: "setup_expired" }, { status: 401 });
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const verifyResult = await verify({ token: input.code, secret: setup.secret });
  const isValidCode =
    typeof verifyResult === "boolean"
      ? verifyResult
      : Boolean((verifyResult as { valid?: boolean }).valid);
  if (!isValidCode) {
    return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
  }

  const db = createDb(databaseUrl);
  await db
    .update(owners)
    .set({
      mfaSecret: setup.secret,
      mfaEnabled: true,
      sessionVersion: session.sessionVersion + 1,
    })
    .where(eq(owners.id, session.sub));
  await db.insert(adminAuditLog).values({
    actorId: session.sub,
    action: "auth.mfa_enabled",
    targetOwnerId: session.sub,
    ipAddress: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    metadata: { outcome: "success" },
  });
  jar.delete(MFA_SETUP_COOKIE);
  const refreshedSession = await signSession({
    id: session.sub,
    role: session.role,
    email: session.email,
    name: session.name,
    sessionVersion: session.sessionVersion + 1,
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
