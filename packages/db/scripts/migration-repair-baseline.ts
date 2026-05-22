/**
 * ONE-TIME repair: mark all journal migrations as applied WITHOUT running SQL.
 * Only use when the public schema already matches migrations and migrate fails with
 * "already exists". Requires: STOCKIX_MIGRATION_REPAIR=baseline
 *
 *   STOCKIX_MIGRATION_REPAIR=baseline pnpm --filter @repo/db db:repair:baseline
 */
import { dbConfig } from "@repo/config";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const url = dbConfig.databaseUrl;
const migrationsFolder = join(fileURLToPath(new URL(".", import.meta.url)), "..", "drizzle");

async function main(): Promise<void> {
  if (process.env.STOCKIX_MIGRATION_REPAIR !== "baseline") {
    console.error(
      "Refusing to run. Set STOCKIX_MIGRATION_REPAIR=baseline to acknowledge this marks migrations applied without executing SQL.",
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const files = readMigrationFiles({ migrationsFolder });
    let inserted = 0;
    for (const file of files) {
      const existing = await sql`
        SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = ${file.hash} LIMIT 1
      `;
      if (existing.length > 0) continue;
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${file.hash}, ${file.folderMillis})
      `;
      inserted += 1;
      console.log(`[repair] marked ${file.folderMillis}`);
    }
    console.log(`[repair] Done. Newly marked: ${inserted}, journal entries: ${files.length}`);
    console.log("[repair] Run: pnpm db:migrate && pnpm --filter @repo/db verify-schema");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
