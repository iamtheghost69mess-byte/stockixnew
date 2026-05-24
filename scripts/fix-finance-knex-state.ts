/**
 * Repairs local finance system DB when tenant_licenses is missing but Knex
 * expects later migrations. Run: pnpm exec tsx scripts/fix-finance-knex-state.ts
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const serverDir = join(repoRoot, "services", "stockix-finance", "packages", "server");
const migrationsDir = join(
  serverDir,
  "src",
  "database",
  "system",
  "migrations",
);

config({ path: join(serverDir, ".env") });

const host = process.env.SYSTEM_DB_HOST ?? process.env.DB_HOST ?? "127.0.0.1";
const user = process.env.SYSTEM_DB_USER ?? process.env.DB_USER ?? "stockix";
const password =
  process.env.SYSTEM_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "stockix";
const database = process.env.SYSTEM_DB_NAME ?? "stockix_system";

const require = createRequire(join(serverDir, "package.json"));
const Knex = require("knex") as typeof import("knex").default;

const CREATE_TABLE_MIGRATION = "20260519000002_create_tenant_licenses_table.js";
const PENDING_LICENSE_MIGRATIONS = [
  "20260519000002_create_tenant_licenses_table.js",
  "20260522000001_add_revoked_to_tenant_license_status.js",
  "20260522000002_add_max_activations_to_tenant_licenses.js",
];
const MAX_ACTIVATIONS_MIGRATION =
  "20260522000002_add_max_activations_to_tenant_licenses.js";

async function main() {
  const knex = Knex({
    client: "mysql",
    connection: { host, user, password, database, charset: "utf8" },
    pool: { min: 0, max: 2 },
  });

  try {
    const hasTable = await knex.schema.hasTable("tenant_licenses");
    console.log(`[fix] tenant_licenses exists: ${hasTable}`);

    const applied = await knex("knex_migrations")
      .select("name")
      .orderBy("id");
    const appliedNames = new Set(applied.map((r: { name: string }) => r.name));
    console.log(`[fix] Applied migrations: ${applied.length}`);

    for (const name of PENDING_LICENSE_MIGRATIONS) {
      console.log(`  - ${name}: ${appliedNames.has(name) ? "applied" : "pending"}`);
    }

    if (!hasTable) {
      await knex.schema.dropTableIfExists("tenant_licenses");

      const tenantIdCol = await knex("information_schema.columns")
        .select("COLUMN_TYPE", "IS_NULLABLE")
        .where({
          table_schema: database,
          table_name: "tenants",
          column_name: "id",
        })
        .first();

      const tenantIdType =
        (tenantIdCol as { COLUMN_TYPE?: string } | undefined)?.COLUMN_TYPE ??
        "bigint(20) unsigned";
      console.log(`[fix] tenants.id type: ${tenantIdType}`);

      await knex.raw(`
        CREATE TABLE tenant_licenses (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id ${tenantIdType} NOT NULL,
          plan_slug VARCHAR(100) NOT NULL DEFAULT 'owner-managed',
          status ENUM('active', 'expired', 'suspended', 'grace') NOT NULL DEFAULT 'active',
          valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NULL DEFAULT NULL,
          grace_period_days INT NOT NULL DEFAULT 30,
          max_users INT NOT NULL DEFAULT 10,
          max_organizations INT NOT NULL DEFAULT 1,
          is_perpetual TINYINT(1) NOT NULL DEFAULT 0,
          feature_flags JSON NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY tenant_licenses_tenant_id_unique (tenant_id),
          CONSTRAINT tenant_licenses_tenant_id_foreign
            FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("[fix] tenant_licenses created (manual DDL).");
    }
  } finally {
    await knex.destroy();
  }

  const unlockKnex = Knex({
    client: "mysql",
    connection: { host, user, password, database, charset: "utf8" },
    pool: { min: 0, max: 1 },
  });
  try {
    await unlockKnex.migrate.forceFreeMigrationsLock();
    console.log("[fix] Released knex migration lock.");
  } finally {
    await unlockKnex.destroy();
  }

  console.log("[fix] Running pnpm cli:system:migrate:latest ...");
  const result = spawnSync("pnpm", ["cli:system:migrate:latest"], {
    cwd: serverDir,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const verify = Knex({
    client: "mysql",
    connection: { host, user, password, database, charset: "utf8" },
    pool: { min: 0, max: 1 },
  });
  try {
    const cols = await verify("information_schema.columns")
      .select("COLUMN_NAME", "COLUMN_TYPE")
      .where({ table_schema: database, table_name: "tenant_licenses" })
      .orderBy("ORDINAL_POSITION");
    const names = (cols as { COLUMN_NAME: string }[]).map((c) => c.COLUMN_NAME);
    console.log("[fix] tenant_licenses columns:", names.join(", "));
    const status = (cols as { COLUMN_NAME: string; COLUMN_TYPE: string }[]).find(
      (c) => c.COLUMN_NAME === "status",
    );
    if (status) console.log("[fix] status enum:", status.COLUMN_TYPE);

    if (!names.includes("max_activations")) {
      console.log(
        `[fix] max_activations missing — running ${MAX_ACTIVATIONS_MIGRATION} up()...`,
      );
      const migration = require(join(migrationsDir, MAX_ACTIVATIONS_MIGRATION));
      await migration.up(verify);
      console.log("[fix] max_activations column added.");
    }
  } finally {
    await verify.destroy();
  }

  console.log("[fix] Finance system migrations complete.");
}

main().catch((err) => {
  console.error("[fix] Failed:", err);
  process.exit(1);
});
