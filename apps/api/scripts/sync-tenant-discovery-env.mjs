#!/usr/bin/env node
/**
 * Patch per-tenant Finance .env files with REACT_APP_STOCKIX_DISCOVERY_SLUG from Postgres.
 * Run on the server after backfill-discovery-slugs.mjs.
 *
 * Usage:
 *   node apps/api/scripts/sync-tenant-discovery-env.mjs
 *   node apps/api/scripts/sync-tenant-discovery-env.mjs --dry-run
 */
import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env") });

const dryRun = process.argv.includes("--dry-run");
const databaseUrl = process.env.DATABASE_URL?.trim();
const tenantEnvRoot =
  process.env.TENANT_ENV_ROOT?.trim() || "/opt/stockix/tenants";

if (!databaseUrl) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const rows = await sql`
  SELECT t.slug, tc.public_discovery_slug
  FROM tenants t
  INNER JOIN tenant_config tc ON tc.tenant_id = t.id
  WHERE tc.public_discovery_slug IS NOT NULL
`;

let updated = 0;
for (const row of rows) {
  const envPath = join(tenantEnvRoot, row.slug, ".env");
  try {
    let content = await readFile(envPath, "utf8");
    const line = `REACT_APP_STOCKIX_DISCOVERY_SLUG=${row.public_discovery_slug}`;
    if (/^REACT_APP_STOCKIX_DISCOVERY_SLUG=/m.test(content)) {
      content = content.replace(/^REACT_APP_STOCKIX_DISCOVERY_SLUG=.*$/m, line);
    } else {
      content = `${content.trimEnd()}\n${line}\n`;
    }
    if (!dryRun) {
      await writeFile(envPath, content, "utf8");
    }
    console.log(`${dryRun ? "[dry-run] " : ""}${row.slug}: ${line}`);
    updated++;
  } catch (err) {
    console.warn(`${row.slug}: skip (${err instanceof Error ? err.message : err})`);
  }
}

console.log(`Done. ${updated} tenant env file(s) ${dryRun ? "would be " : ""}updated.`);
await sql.end();
