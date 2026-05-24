/**
 * Ensures Postgres sequence tenant_port_seq exists (migration 0002).
 * Baseline-only DBs often have tables but no sequence.
 */
import { dbConfig } from "@repo/config";
import postgres from "postgres";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const url = dbConfig.databaseUrl;

export async function ensureTenantPortSeq(sql: postgres.Sql): Promise<boolean> {
  const maxPort = Number(process.env.MAX_TENANT_PORT ?? "4999");
  const maxValue = Number.isFinite(maxPort) && maxPort > 4100 ? maxPort : 4999;
  const rows = await sql`
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND c.relname = 'tenant_port_seq' AND n.nspname = 'public'
    LIMIT 1
  `;
  if (rows.length > 0) return false;
  await sql.unsafe(`
    CREATE SEQUENCE IF NOT EXISTS tenant_port_seq
      AS integer
      START WITH 4100
      INCREMENT BY 1
      MINVALUE 4100
      MAXVALUE ${maxValue}
      CACHE 1
  `);
  return true;
}

async function main(): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    const created = await ensureTenantPortSeq(sql);
    if (created) {
      console.log("Created tenant_port_seq.");
    } else {
      console.log("tenant_port_seq already exists.");
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

const entry = process.argv[1];
if (entry && fileURLToPath(import.meta.url) === resolve(entry)) {
  void main();
}
