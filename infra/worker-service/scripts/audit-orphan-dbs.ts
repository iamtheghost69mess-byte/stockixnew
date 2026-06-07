/**
 * Audit script: find orphaned stockix_*_finance / stockix_*_system databases
 * that are not referenced by any active tenant.
 *
 * Run: npx tsx infra/worker-service/scripts/audit-orphan-dbs.ts
 *
 * Reports databases present on MySQL with no matching tenant slug in Postgres.
 * Does NOT delete anything — report only.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { createDb } from "@repo/db";
import { tenants } from "@repo/db/schema";

config({ path: resolve(process.cwd(), ".env") });

function schemaSlug(schemaName: string): string {
  return schemaName
    .replace(/^stockix_/, "")
    .replace(/_finance$/, "")
    .replace(/_system$/, "");
}

function isFinanceDb(schemaName: string): boolean {
  return schemaName.endsWith("_finance");
}

async function auditOrphanDbs(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const rootPassword = process.env.SHARED_MYSQL_ROOT_PASSWORD;
  if (!rootPassword) {
    throw new Error("SHARED_MYSQL_ROOT_PASSWORD is required");
  }

  const conn = await mysql.createConnection({
    host: process.env.SHARED_MYSQL_HOST ?? "stockix-mysql",
    user: "root",
    password: rootPassword,
    port: 3306,
    connectTimeout: 15_000,
  });

  const [financeRows] = await conn.query<Array<{ schema_name: string }>>(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name LIKE 'stockix\\_%\\_finance' ESCAPE '\\'`,
  );
  const [systemRows] = await conn.query<Array<{ schema_name: string }>>(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name LIKE 'stockix\\_%\\_system' ESCAPE '\\'`,
  );
  const rows = [...financeRows, ...systemRows];

  const db = createDb(databaseUrl);
  const knownTenants = await db.select({ slug: tenants.slug }).from(tenants);
  const knownSlugs = new Set(knownTenants.map((t) => t.slug));

  const orphans = rows.filter((r) => {
    const slug = schemaSlug(r.schema_name);
    return slug.length > 0 && !knownSlugs.has(slug);
  });

  const financeOrphans = orphans.filter((r) => isFinanceDb(r.schema_name));
  const systemOrphans = orphans.filter((r) => !isFinanceDb(r.schema_name));

  console.log("=== Orphaned _finance databases ===");
  if (financeOrphans.length === 0) {
    console.log("None found.");
  } else {
    for (const r of financeOrphans) {
      console.log(" -", r.schema_name);
    }
    console.log(
      "\nLegacy compat DBs with no Postgres tenant row. Drop manually after review:",
    );
    console.log("  DROP DATABASE IF EXISTS stockix_{safe}_finance;");
  }

  console.log("\n=== Orphaned _system databases ===");
  if (systemOrphans.length === 0) {
    console.log("None found.");
  } else {
    for (const r of systemOrphans) {
      console.log(" -", r.schema_name);
    }
    console.log(
      "\nThese databases have no matching tenant. Review before manual cleanup.",
    );
  }

  await conn.end();
  process.exit(orphans.length === 0 ? 0 : 1);
}

auditOrphanDbs().catch((e) => {
  console.error("Audit failed:", e);
  process.exit(1);
});
