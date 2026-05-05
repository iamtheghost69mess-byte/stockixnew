import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { eq } from "drizzle-orm";

import { MFA_SETUP_COOKIE, SESSION_COOKIE, verifySession } from "@/lib/session";

export async function GET() {
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

  const db = createDb(databaseUrl);
  const [owner] = await db
    .select({ mfaEnabled: owners.mfaEnabled })
    .from(owners)
    .where(eq(owners.id, session.sub))
    .limit(1);

  return NextResponse.json({
    enabled: Boolean(owner?.mfaEnabled),
    setupPending: Boolean(jar.get(MFA_SETUP_COOKIE)?.value),
  });
}
