import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verify } from "otplib";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { ROLES, type Role } from "@/lib/roles";
import { MFA_COOKIE, SESSION_COOKIE, signSession, verifyMfaToken } from "@/lib/session";

const schema = z.object({
  code: z.string().min(6).max(8),
});

function asRole(value: string): Role | null {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

export async function POST(req: Request) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "Auth not configured on server" }, { status: 503 });
  }
  const jar = await cookies();
  const pendingToken = jar.get(MFA_COOKIE)?.value;
  if (!pendingToken) return NextResponse.json({ error: "MFA token missing" }, { status: 401 });
  const ownerId = await verifyMfaToken(pendingToken);
  if (!ownerId) return NextResponse.json({ error: "MFA token expired" }, { status: 401 });

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
      email: owners.email,
      name: owners.name,
      role: owners.role,
      mfaSecret: owners.mfaSecret,
    })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);
  if (!owner || !owner.mfaSecret) {
    return NextResponse.json({ error: "MFA not configured" }, { status: 401 });
  }

  const verifyResult = await verify({ token: input.code, secret: owner.mfaSecret });
  const isValidCode =
    typeof verifyResult === "boolean"
      ? verifyResult
      : Boolean((verifyResult as { valid?: boolean }).valid);
  if (!isValidCode) {
    return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
  }

  const session = await signSession({
    id: owner.id,
    role: asRole(owner.role) ?? "read_only",
    email: owner.email,
    name: owner.name,
  });
  jar.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  jar.delete(MFA_COOKIE);
  await db.update(owners).set({ lastLoginAt: new Date() }).where(eq(owners.id, owner.id));
  return NextResponse.json({ ok: true });
}
