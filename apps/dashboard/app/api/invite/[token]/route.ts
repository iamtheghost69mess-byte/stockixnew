import { NextResponse } from "next/server";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { and, eq, gt } from "drizzle-orm";

type Params = { params: Promise<{ token: string }> };

export async function GET(_: Request, { params }: Params) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "Auth not configured on server" }, { status: 503 });
  }
  const { token } = await params;
  const db = createDb(databaseUrl);
  const [owner] = await db
    .select({ name: owners.name, email: owners.email })
    .from(owners)
    .where(and(eq(owners.inviteToken, token), gt(owners.inviteTokenExpiresAt, new Date())))
    .limit(1);
  if (!owner) return NextResponse.json({ error: "Invite token invalid or expired" }, { status: 404 });
  return NextResponse.json(owner);
}
