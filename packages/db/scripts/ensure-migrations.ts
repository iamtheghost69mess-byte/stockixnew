/**
 * Applies Drizzle SQL migrations. If the schema was created via `drizzle-kit push`
 * (empty drizzle.__drizzle_migrations but public tables exist), records all known
 * migrations first so `migrate` does not fail with "relation already exists".
 */
import { dbConfig } from "@repo/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const url =
  dbConfig.databaseUrl ??
  "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform";

const migrationsFolder = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "drizzle",
);

const sql = postgres(url, { max: 1 });

async function schemaExists(): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tenants'
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

async function appliedMigrationCount(): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations
  `;
  return Number(rows[0]?.count ?? 0);
}

async function baselineMigrationJournal(): Promise<void> {
  const files = readMigrationFiles({ migrationsFolder });
  if (files.length === 0) {
    console.error("No migration files found in", migrationsFolder);
    process.exitCode = 1;
    return;
  }
  for (const file of files) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${file.hash}, ${file.folderMillis})
    `;
  }
  console.log(
    `Baselined ${files.length} migration(s) (schema already present from push or manual setup).`,
  );
}

try {
  const hasSchema = await schemaExists();
  const applied = await appliedMigrationCount();

  if (hasSchema && applied === 0) {
    await baselineMigrationJournal();
  }

  const db = drizzle(sql);
  await migrate(db, { migrationsFolder });
  const { ensureDefaultPlans } = await import("./ensure-default-plans.js");
  const planInserted = await ensureDefaultPlans(sql);
  if (planInserted > 0) {
    console.log(`Seeded ${planInserted} default plan(s).`);
  }
  const { ensureTenantPortSeq } = await import("./ensure-tenant-port-seq.js");
  if (await ensureTenantPortSeq(sql)) {
    console.log("Created tenant_port_seq.");
  }
  console.log("Migrations up to date.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
