/**
 * System DB migrations for the migration Docker image.
 * Uses native Knex + filesystem migration files (not webpack commands.js).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import Knex from "knex";
import { knexSnakeCaseMappers } from "objection";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function systemMigrationDir() {
  const override = process.env.SYSTEM_DB_MIGRATION_DIR?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(serverRoot, override);
  }
  // Match NestJS systemDatabase.migrationDir — do not also load src/system/migrations
  // (duplicate filenames cause ER_TABLE_EXISTS on provision retries).
  return path.join(serverRoot, "src/database/system/migrations");
}

function systemSeedsDir() {
  const override = process.env.SYSTEM_DB_SEEDS_DIR?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(serverRoot, override);
  }
  return path.join(serverRoot, "src/database/system/seeds");
}

function createSystemKnex() {
  const host = process.env.SYSTEM_DB_HOST || process.env.DB_HOST;
  const user = process.env.SYSTEM_DB_USER || process.env.DB_USER;
  const password = process.env.SYSTEM_DB_PASSWORD || process.env.DB_PASSWORD;
  const database = process.env.SYSTEM_DB_NAME;

  if (!host || !user || !password || !database) {
    throw new Error(
      "SYSTEM_DB_HOST, SYSTEM_DB_USER, SYSTEM_DB_PASSWORD, and SYSTEM_DB_NAME are required",
    );
  }

  const port = Number(process.env.SYSTEM_DB_PORT || process.env.DB_PORT || 6033);

  return Knex({
    client: process.env.SYSTEM_DB_CLIENT || process.env.DB_CLIENT || "mysql2",
    connection: {
      host,
      port: Number.isFinite(port) && port > 0 ? port : 6033,
      user,
      password,
      database,
      charset: process.env.SYSTEM_DB_CHARSET || process.env.DB_CHARSET || "utf8",
    },
    migrations: {
      directory: systemMigrationDir(),
    },
    seeds: {
      directory: systemSeedsDir(),
    },
    pool: { min: 0, max: 7 },
    // Match BaseCommand / stockix CLI — migrations use knex('USERS') etc.
    ...knexSnakeCaseMappers({ upperCase: true }),
  });
}

async function unlockMigrationLock(knex) {
  try {
    await knex.raw(
      "UPDATE `knex_migrations_lock` SET `is_locked` = 0 WHERE `index` = 1",
    );
    console.log("Migration lock released.");
  } catch {
    // Lock table may not exist yet on first run.
  }
}

async function main() {
  const knex = createSystemKnex();
  try {
    await unlockMigrationLock(knex);
    const [batchNo, log] = await knex.migrate.latest();
    if (log.length === 0) {
      console.log("Already up to date");
    } else {
      console.log(`Batch ${batchNo} run: ${log.length} migrations`);
      for (const name of log) console.log(`  - ${name}`);
    }
  } finally {
    await knex.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
