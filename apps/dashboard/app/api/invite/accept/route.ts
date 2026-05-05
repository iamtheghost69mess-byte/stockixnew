import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { and, eq, gt } from "drizzle-orm";

const schema = z.object({
  token: z.string().uuid(),
  password: z
    .string()
    .min(12)
    .regex(/[A-Z]/, "Must include at least one uppercase letter")
    .regex(/[a-z]/, "Must include at least one lowercase letter")
    .regex(/[0-9]/, "Must include at least one number")
    .regex(/[^A-Za-z0-9]/, "Must include at least one special character"),
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
    return NextResponse.json(
      {
        error:
          "Password must be at least 12 characters and include uppercase, lowercase, number, and special character.",
      },
      { status: 400 },
    );
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
