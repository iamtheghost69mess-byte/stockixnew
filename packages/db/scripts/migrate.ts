/**
 * Applies Drizzle SQL migrations from packages/db/drizzle using drizzle.__drizzle_migrations.
 * Safe to run repeatedly — only pending journal entries are executed.
 */
import { dbConfig } from "@repo/config";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyOrphanMigrations } from "./apply-orphan-migrations.js";
import { postMigrateBootstrap } from "./post-migrate-bootstrap.js";

const url =
  dbConfig.databaseUrl ??
  "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform";

const migrationsFolder = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "drizzle",
);

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function ensurePostgresExtensions(): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
}

async function appliedHashes(): Promise<Set<string>> {
  try {
    const rows = await sql<{ hash: string }[]>`
      SELECT hash FROM drizzle.__drizzle_migrations
    `;
    return new Set(rows.map((r) => r.hash));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "";
    if (code === "42P01") return new Set();
    throw error;
  }
}

/** Mark journal entries applied when schema drift repair already created their objects. */
async function reconcileOrphanedMigrations(
  journal: MigrationMeta[],
  applied: Set<string>,
): Promise<number> {
  let reconciled = 0;

  for (const file of journal) {
    if (applied.has(file.hash)) continue;

    // 0014_clumsy_dagger — licenses.max_organizations
    if (file.folderMillis === 1778700000000) {
      const col = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'max_organizations'
        LIMIT 1
      `;
      if (col.length === 0) continue;

      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${file.hash}, ${file.folderMillis})
      `;
      applied.add(file.hash);
      reconciled += 1;
      console.log("[migrate] reconciled 0014_clumsy_dagger (column already present).");
    }
  }

  return reconciled;
}

async function main(): Promise<void> {
  const journal = readMigrationFiles({ migrationsFolder });
  const appliedBefore = await appliedHashes();
  const pendingBefore = journal.filter((f) => !appliedBefore.has(f.hash));

  console.log(
    `[migrate] journal=${journal.length} applied=${appliedBefore.size} pending=${pendingBefore.length}`,
  );

  if (pendingBefore.length > 0) {
    console.log(
      `[migrate] applying: ${pendingBefore.map((f) => f.folderMillis).join(", ")}`,
    );
  }

  await ensurePostgresExtensions();

  const db = drizzle(sql);
  await migrate(db, { migrationsFolder });

  let appliedAfter = await appliedHashes();
  const reconciled = await reconcileOrphanedMigrations(journal, appliedAfter);
  if (reconciled > 0) {
    appliedAfter = await appliedHashes();
  }

  const newlyApplied = appliedAfter.size - appliedBefore.size;

  const orphanMessages = await applyOrphanMigrations(sql);
  for (const msg of orphanMessages) {
    console.log(`[migrate] ${msg}`);
  }

  const bootstrapMessages = await postMigrateBootstrap(sql);
  for (const msg of bootstrapMessages) {
    console.log(`[migrate] ${msg}`);
  }

  if (newlyApplied > 0) {
    console.log(`[migrate] applied ${newlyApplied} migration(s). total=${appliedAfter.size}`);
  } else {
    console.log(`[migrate] no new migrations (total=${appliedAfter.size}).`);
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("already exists")) {
    console.error(
      "[migrate] failed: object already exists. Schema may have been created via push/manual SQL.",
    );
    console.error(
      "[migrate] If schema is correct, run: STOCKIX_MIGRATION_REPAIR=baseline pnpm --filter @repo/db db:repair:baseline",
    );
    console.error("[migrate] Then: pnpm db:migrate");
  } else {
    console.error("[migrate] failed:", error);
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
