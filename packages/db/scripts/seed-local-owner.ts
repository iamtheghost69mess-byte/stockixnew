/**
 * Ensures the platform admin owner exists for local dashboard login.
 * Run from repo root after migrations: `pnpm db:seed:local`
 */
import { dashboardConfig } from "@repo/config";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const url = dashboardConfig.databaseUrl;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const email = dashboardConfig.platformAdminEmail;
const password = dashboardConfig.platformAdminPassword;
const name = "Platform Admin";
const legacyDevOwner = "dev-owner@localhost.test";

const sql = postgres(url, { max: 1 });
try {
  const passwordHash = await bcrypt.hash(password, 12);
  await sql`
    INSERT INTO owners (email, name, role, status, password_hash, mfa_enabled)
    VALUES (${email}, ${name}, 'super_admin', 'active', ${passwordHash}, false)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      password_hash = EXCLUDED.password_hash,
      failed_login_count = 0,
      locked_until = NULL,
      mfa_enabled = false
  `;
  await sql`DELETE FROM owners WHERE email = ${legacyDevOwner}`;
  const rows = await sql`
    SELECT id, email, name FROM owners WHERE email = ${email}
  `;
  if (rows.length === 0) {
    console.error("Seed failed: platform admin row missing after upsert");
    process.exitCode = 1;
  } else {
    console.log("Platform admin ready:", rows[0]);
    console.log("Login with PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD from .env");
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
