/**
 * Ensures a Stockix platform owner exists for local dashboard / POST /tenants.
 * Run from `packages/db` after migrations: `pnpm db:seed:local`
 */
import { config } from "dotenv";
import { dbConfig } from "@repo/config";
import postgres from "postgres";

config({ path: ".env", override: true });
config({ path: ".env.local", override: true });

const url = dbConfig.databaseUrl;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const email = "dev-owner@localhost.test";
const name = "Local dev owner";

const sql = postgres(url, { max: 1 });
try {
  await sql`
    INSERT INTO owners (email, name)
    VALUES (${email}, ${name})
    ON CONFLICT (email) DO NOTHING
  `;
  const rows = await sql`
    SELECT id, email, name FROM owners WHERE email = ${email}
  `;
  if (rows.length === 0) {
    console.error("Seed failed: owner row missing after insert attempt");
    process.exitCode = 1;
  } else {
    console.log("Owner ready:", rows[0]);
    console.log("Use owner id in dashboard:", rows[0].id);
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
