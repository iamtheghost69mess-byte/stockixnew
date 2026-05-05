import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { and, eq, gt } from "drizzle-orm";

const schema = z.object({
  token: z.string().uuid(),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "Auth not configured on server" }, { status: 503 });
  }
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = createDb(databaseUrl);
  const [owner] = await db
    .select({ id: owners.id })
    .from(owners)
    .where(
      and(
        eq(owners.inviteToken, input.token),
        gt(owners.inviteTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!owner) return NextResponse.json({ error: "Invite token invalid or expired" }, { status: 404 });

  const passwordHash = await bcrypt.hash(input.password, 12);
  await db
    .update(owners)
    .set({
      passwordHash,
      inviteToken: null,
      inviteTokenExpiresAt: null,
    })
    .where(eq(owners.id, owner.id));
  return NextResponse.json({ ok: true });
}
