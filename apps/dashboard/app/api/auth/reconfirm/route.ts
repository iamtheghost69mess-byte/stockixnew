import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { eq } from "drizzle-orm";

import {
  RECENT_AUTH_COOKIE,
  SESSION_COOKIE,
  signRecentAuthToken,
  verifySession,
} from "@/lib/session";

const schema = z.object({
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "Auth not configured on server" }, { status: 503 });
  }
  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value ?? "";
  const session = sessionToken ? await verifySession(sessionToken) : null;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = createDb(databaseUrl);
  const [owner] = await db
    .select({ id: owners.id, passwordHash: owners.passwordHash })
    .from(owners)
    .where(eq(owners.id, session.sub))
    .limit(1);
  if (!owner?.passwordHash) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const ok = await bcrypt.compare(input.password, owner.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid password" }, { status: 401 });

  const token = await signRecentAuthToken(owner.id);
  jar.set(RECENT_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
