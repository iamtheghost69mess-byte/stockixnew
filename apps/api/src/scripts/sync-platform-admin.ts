/**
 * Upserts the platform admin from PLATFORM_ADMIN_* / BOOTSTRAP_* env and removes the legacy dev seed owner.
 */
import { apiConfig, dashboardConfig } from "@repo/config";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const LEGACY_DEV_OWNER_EMAIL = "dev-owner@localhost.test";

async function run() {
  const databaseUrl = apiConfig.databaseUrl;
  const email = dashboardConfig.platformAdminEmail;
  const password = dashboardConfig.platformAdminPassword;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!email || !password) {
    throw new Error("PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required");
  }

  const db = createDb(databaseUrl);
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.email, email))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(owners)
      .set({
        name: "Platform Admin",
        role: "super_admin",
        status: "active",
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        inviteToken: null,
        inviteTokenExpiresAt: null,
        mfaEnabled: false,
      })
      .where(eq(owners.id, existing[0]!.id));
  } else {
    await db.insert(owners).values({
      email,
      name: "Platform Admin",
      role: "super_admin",
      status: "active",
      passwordHash,
      mfaEnabled: false,
    });
  }

  await db.delete(owners).where(eq(owners.email, LEGACY_DEV_OWNER_EMAIL));
  console.log(`Platform admin synced: ${email}`);
}

void run();
