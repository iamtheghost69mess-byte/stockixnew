import { apiConfig } from "@repo/config";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function run() {
  const databaseUrl = apiConfig.databaseUrl;
  const email = apiConfig.bootstrapAdminEmail;
  const password = apiConfig.bootstrapAdminPassword;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!email || !password) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required");
  }

  const db = createDb(databaseUrl);
  const activated = await db
    .select({ id: owners.id })
    .from(owners)
    .where(isNotNull(owners.passwordHash))
    .limit(1);
  if (activated.length > 0) {
    process.stdout.write("Bootstrap skipped: activated admin already exists\n");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.email, email))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(owners)
      .set({
        name: "Bootstrap Admin",
        role: "super_admin",
        passwordHash,
        inviteToken: null,
        inviteTokenExpiresAt: null,
        mfaEnabled: false,
      })
      .where(eq(owners.id, existing[0]!.id));
  } else {
    await db.insert(owners).values({
      email,
      name: "Bootstrap Admin",
      role: "super_admin",
      passwordHash,
      mfaEnabled: false,
    });
  }
  process.stdout.write(`Bootstrap admin created: ${email}\n`);
}

void run();
