import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateSecret, generateURI } from "otplib";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { eq } from "drizzle-orm";

import {
  MFA_SETUP_COOKIE,
  RECENT_AUTH_COOKIE,
  SESSION_COOKIE,
  signMfaSetupToken,
  verifyRecentAuthToken,
  verifySession,
} from "@/lib/session";

export async function POST() {
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

  const db = createDb(databaseUrl);
  const [owner] = await db
    .select({ id: owners.id, email: owners.email, mfaEnabled: owners.mfaEnabled })
    .from(owners)
    .where(eq(owners.id, session.sub))
    .limit(1);
  if (!owner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (owner.mfaEnabled) {
    return NextResponse.json({ error: "already_enabled" }, { status: 409 });
  }

  const secret = generateSecret();
  const issuer = "Stockix";
  const otpauthUri = generateURI({ secret, issuer, label: owner.email });
  const setupToken = await signMfaSetupToken({ ownerId: owner.id, secret });
  jar.set(MFA_SETUP_COOKIE, setupToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });

  return NextResponse.json({
    secret,
    issuer,
    account: owner.email,
    otpauthUri,
  });
}
