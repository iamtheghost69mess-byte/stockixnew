/**
 * Applies manual SQL migrations 0044–0046 (not yet in drizzle journal).
 * Safe to re-run: uses IF NOT EXISTS / ON CONFLICT DO NOTHING where possible.
 *
 * Usage (from repo root):
 *   pnpm --filter @repo/db exec tsx scripts/apply-section1-migrations.ts
 *
 * Production (on server, after compose is up):
 *   docker exec -i stockix-postgres-1 psql -U postgres -d stockix_platform \
 *     < packages/db/drizzle/0044_platform_roles.sql
 *   (repeat for 0045, 0046 — or run this script with DATABASE_URL pointing at prod)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dbConfig } from "@repo/config";
import postgres from "postgres";

const files = [
  "0044_platform_roles.sql",
  "0045_tenants_org_scope_permission.sql",
  "0046_stxi_license.sql",
] as const;

const drizzleDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "drizzle");

const url =
  dbConfig.databaseUrl ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:15432/stockix_platform";

async function main(): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  console.log(`[section1-migrate] target=${url.replace(/:[^:@/]+@/, ":****@")}`);

  for (const file of files) {
    const path = join(drizzleDir, file);
    const body = readFileSync(path, "utf8");
    console.log(`[section1-migrate] applying ${file}…`);
    await sql.unsafe(body);
    console.log(`[section1-migrate] ok ${file}`);
  }

  const roles = await sql<{ slug: string }[]>`
    SELECT slug FROM platform_roles ORDER BY slug
  `;
  console.log(`[section1-migrate] platform_roles: ${roles.map((r) => r.slug).join(", ")}`);

  await sql.end({ timeout: 2 });
  console.log("[section1-migrate] done.");
}

main().catch((err) => {
  console.error("[section1-migrate] failed:", err);
  process.exitCode = 1;
});
