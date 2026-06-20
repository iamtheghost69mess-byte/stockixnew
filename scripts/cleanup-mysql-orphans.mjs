#!/usr/bin/env node
/**
 * cleanup-mysql-orphans.mjs
 *
 * Lists and optionally drops MySQL databases that have no corresponding
 * control-plane tenant record (orphans from failed provisioning).
 *
 * Usage:
 *   node scripts/cleanup-mysql-orphans.mjs              # dry-run (safe)
 *   node scripts/cleanup-mysql-orphans.mjs --delete     # drop orphaned databases
 *
 * Required environment variables:
 *   DATABASE_URL              — Control-plane Postgres connection string
 *   SHARED_MYSQL_HOST         — MySQL host (default: stockix-mysql)
 *   SHARED_MYSQL_ROOT_PASSWORD — MySQL root password
 */

import mysql2 from "mysql2/promise";
import postgres from "postgres";

const DRY_RUN = !process.argv.includes("--delete");

const mysqlHost = process.env.SHARED_MYSQL_HOST ?? "stockix-mysql";
const mysqlRootPassword = process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";
const databaseUrl = process.env.DATABASE_URL ?? "";

if (!mysqlRootPassword) {
  console.error("[ERROR] SHARED_MYSQL_ROOT_PASSWORD is not set.");
  process.exit(1);
}
if (!databaseUrl) {
  console.error("[ERROR] DATABASE_URL is not set.");
  process.exit(1);
}

console.log(`[info] MySQL host: ${mysqlHost}`);
console.log(`[info] Mode: ${DRY_RUN ? "DRY RUN (--delete to actually drop)" : "LIVE — will DROP orphaned databases"}`);
console.log();

const pg = postgres(databaseUrl, { max: 1 });

try {
  const conn = await mysql2.createConnection({
    host: mysqlHost,
    port: 3306,
    user: "root",
    password: mysqlRootPassword,
    connectTimeout: 15_000,
  });

  try {
    const [allDbs] = await conn.query("SHOW DATABASES");

    // Find all stockix_* databases
    const stockixDbs = allDbs
      .map((r) => Object.values(r)[0])
      .filter((name) => typeof name === "string" && name.startsWith("stockix_"));

    // Extract unique tenant slug prefixes (strip known suffixes and org suffixes)
    const prefixSet = new Set();
    for (const dbName of stockixDbs) {
      // Format: stockix_{safe}_finance | stockix_{safe}_system | stockix_{safe}_{orgId}
      const withoutPrefix = dbName.slice("stockix_".length);
      // Try stripping known suffixes
      for (const suffix of ["_finance", "_system"]) {
        if (withoutPrefix.endsWith(suffix)) {
          prefixSet.add(withoutPrefix.slice(0, withoutPrefix.length - suffix.length));
          break;
        }
      }
    }

    console.log(`Found ${stockixDbs.length} stockix_* databases, ${prefixSet.size} unique slug prefixes.\n`);

    const orphanedPrefixes = [];

    for (const safeSlug of prefixSet) {
      // Check if any tenant has a slug that maps to this safe prefix
      // (slugToMysqlSafe: replace non-alphanumeric with _, lowercase, slice to 28)
      const rows = await pg`
        SELECT id, slug, status FROM tenants
        WHERE LOWER(REGEXP_REPLACE(slug, '[^a-zA-Z0-9]', '_', 'g')) = ${safeSlug}
           OR LOWER(REGEXP_REPLACE(slug, '[^a-zA-Z0-9]', '_', 'g')) LIKE ${safeSlug + "%"}
        LIMIT 1
      `.catch(() => []);

      if (rows.length === 0) {
        orphanedPrefixes.push(safeSlug);
      }
    }

    if (orphanedPrefixes.length === 0) {
      console.log("[ok] No orphaned MySQL databases found.");
    } else {
      console.log(`[warn] Found ${orphanedPrefixes.length} orphaned tenant MySQL prefix(es):\n`);
      console.log("| Safe Slug Prefix        | Databases                                    |");
      console.log("|------------------------|----------------------------------------------|");
      for (const prefix of orphanedPrefixes) {
        const dbs = stockixDbs.filter((d) => d.startsWith(`stockix_${prefix}_`));
        console.log(`| ${prefix.padEnd(22)} | ${dbs.join(", ")} |`);
      }
      console.log();

      if (!DRY_RUN) {
        console.log("Dropping orphaned databases...");
        for (const prefix of orphanedPrefixes) {
          const dbs = stockixDbs.filter((d) => d.startsWith(`stockix_${prefix}_`));
          const tenantUser = `tenant_${prefix.slice(0, 25)}`;
          for (const dbName of dbs) {
            await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``);
            console.log(`  Dropped: ${dbName}`);
          }
          await conn.execute(`DROP USER IF EXISTS '${tenantUser}'@'%'`);
          await conn.execute("FLUSH PRIVILEGES");
          console.log(`  Dropped user: ${tenantUser}`);
        }
        console.log("\n[done] Orphaned databases dropped.");
      } else {
        console.log("Run with --delete to drop these databases.");
      }
    }
  } finally {
    await conn.end();
  }
} finally {
  await pg.end();
}
