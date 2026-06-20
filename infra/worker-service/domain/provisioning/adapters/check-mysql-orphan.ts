import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { tenants } from "@repo/db/schema";
import type * as schema from "@repo/db/schema";
import { slugToMysqlSafe, tenantMysqlDatabaseNames } from "../../provisioner.js";

type Db = PostgresJsDatabase<typeof schema>;

export type MysqlOrphanResult = {
  isOrphan: boolean;
  mysqlDatabase: string;
  slug: string;
};

/**
 * Check whether a MySQL database exists for the given slug but has no matching
 * control-plane tenant record. Returns orphan info if detected.
 *
 * This is called as a preflight check in provision-runtime before Docker compose up,
 * and in provision-failure.ts as part of terminal failure cleanup.
 */
export async function checkMysqlOrphan(
  db: Db,
  slug: string,
  log: (msg: string) => void,
): Promise<MysqlOrphanResult> {
  const mysqlHost = process.env.WORKER_SHARED_MYSQL_HOST?.trim()
    || process.env.SHARED_MYSQL_HOST
    || "stockix-mysql";
  const rootPassword = process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";
  const { financeDb } = tenantMysqlDatabaseNames(slug);

  if (!rootPassword) {
    log(`[orphan-check] SHARED_MYSQL_ROOT_PASSWORD not set — skipping MySQL orphan check for slug="${slug}"`);
    return { isOrphan: false, mysqlDatabase: financeDb, slug };
  }

  let mysqlDbExists = false;
  try {
    const mysql2 = await import("mysql2/promise");
    const conn = await mysql2.createConnection({
      host: mysqlHost,
      port: 3306,
      user: "root",
      password: rootPassword,
      connectTimeout: 10_000,
    });
    try {
      const safe = slugToMysqlSafe(slug);
      const [rows] = await conn.query(
        `SHOW DATABASES LIKE 'stockix_${safe}\\_%'`,
      ) as [Array<Record<string, string>>, unknown];
      mysqlDbExists = rows.length > 0;
    } finally {
      await conn.end();
    }
  } catch (err) {
    log(`[orphan-check] MySQL connect failed — skipping orphan check for slug="${slug}": ${err instanceof Error ? err.message : String(err)}`);
    return { isOrphan: false, mysqlDatabase: financeDb, slug };
  }

  if (!mysqlDbExists) {
    return { isOrphan: false, mysqlDatabase: financeDb, slug };
  }

  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  const isOrphan = !existing;
  if (isOrphan) {
    log(`[orphan-check] ORPHAN DETECTED: MySQL databases exist for slug="${slug}" but no control-plane tenant record found`);
  }
  return { isOrphan, mysqlDatabase: financeDb, slug };
}

/**
 * Drop MySQL databases for an orphaned tenant slug. Safe to call even if DBs don't exist.
 */
export async function cleanupMysqlOrphan(
  slug: string,
  log: (msg: string) => void,
): Promise<boolean> {
  const mysqlHost = process.env.WORKER_SHARED_MYSQL_HOST?.trim()
    || process.env.SHARED_MYSQL_HOST
    || "stockix-mysql";
  const rootPassword = process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";

  if (!rootPassword) {
    log(`[orphan-cleanup] SHARED_MYSQL_ROOT_PASSWORD not set — cannot clean MySQL orphan for slug="${slug}"`);
    return false;
  }

  const { financeDb, systemDb, tenantUser, dbPrefix } = tenantMysqlDatabaseNames(slug);

  try {
    const mysql2 = await import("mysql2/promise");
    const conn = await mysql2.createConnection({
      host: mysqlHost,
      port: 3306,
      user: "root",
      password: rootPassword,
      connectTimeout: 10_000,
    });
    try {
      await conn.execute(`DROP DATABASE IF EXISTS \`${financeDb}\``);
      log(`[orphan-cleanup] Dropped ${financeDb}`);
      await conn.execute(`DROP DATABASE IF EXISTS \`${systemDb}\``);
      log(`[orphan-cleanup] Dropped ${systemDb}`);

      const [orgRows] = await conn.query(
        `SELECT schema_name AS schemaName FROM information_schema.schemata WHERE schema_name LIKE ?`,
        [`${dbPrefix}%`],
      ) as [Array<Record<string, string>>, unknown];
      for (const row of orgRows) {
        const dbName = row.schemaName;
        if (dbName) {
          await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``);
          log(`[orphan-cleanup] Dropped ${dbName}`);
        }
      }

      await conn.execute(`DROP USER IF EXISTS '${tenantUser}'@'%'`);
      await conn.execute("FLUSH PRIVILEGES");
      log(`[orphan-cleanup] Cleaned MySQL orphan for slug="${slug}"`);
      return true;
    } finally {
      await conn.end();
    }
  } catch (err) {
    log(`[orphan-cleanup] Failed to clean MySQL orphan for slug="${slug}": ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
