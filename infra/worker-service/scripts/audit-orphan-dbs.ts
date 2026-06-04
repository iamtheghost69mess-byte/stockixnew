/**
 * Audit script: find orphaned stockix_*_finance / stockix_*_system databases
 * that are not referenced by any active tenant.
 *
 * Run: npx tsx infra/worker-service/scripts/audit-orphan-dbs.ts
 *
 * Reports databases present on MySQL with no matching active tenant slug.
 * Does NOT delete anything — report only.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { inArray } from "drizzle-orm";
import { createDb } from "@repo/db";
import { tenants } from "@repo/db/schema";

config({ path: resolve(process.cwd(), ".env") });

function schemaSlug(schemaName: string): string {
  return schemaName
    .replace(/^stockix_/, "")
    .replace(/_finance$/, "")
    .replace(/_system$/, "");
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

  const [rows] = await conn.query<Array<{ schema_name: string }>>(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name LIKE 'stockix_%_finance'
        OR schema_name LIKE 'stockix_%_system'`,
  );

  const db = createDb(databaseUrl);
  const activeTenants = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(inArray(tenants.status, ["active", "partial"]));

  const activeSlugs = new Set(activeTenants.map((t) => t.slug));

  const orphans = rows.filter((r) => {
    const slug = schemaSlug(r.schema_name);
    return slug.length > 0 && !activeSlugs.has(slug);
  });

  console.log("=== Orphaned Databases ===");
  if (orphans.length === 0) {
    console.log("None found.");
  } else {
    for (const r of orphans) {
      console.log(" -", r.schema_name);
    }
    console.log(
      "\nThese databases have no active tenant. Review before manual cleanup.",
    );
  }

  await conn.end();
  process.exit(0);
}

auditOrphanDbs().catch((e) => {
  console.error("Audit failed:", e);
  process.exit(1);
});
