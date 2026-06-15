/**
 * Idempotent post-migrate fixes for objects that SQL migrations should create
 * but may be missing when an old baseline marked migrations applied without running SQL.
 */
import type postgres from "postgres";
import { ensureDefaultPlans } from "./ensure-default-plans.js";
import { ensureTenantPortSeq } from "./ensure-tenant-port-seq.js";

export async function postMigrateBootstrap(sql: postgres.Sql): Promise<string[]> {
  const messages: string[] = [];

  const plans = await ensureDefaultPlans(sql);
  if (plans > 0) messages.push(`Seeded ${plans} default plan(s).`);

  if (await ensureTenantPortSeq(sql)) {
    messages.push("Created tenant_port_seq.");
  }

  const col = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'max_organizations'
    LIMIT 1
  `;
  if (col.length === 0) {
    await sql.unsafe(
      `ALTER TABLE "licenses" ADD COLUMN "max_organizations" integer DEFAULT 1 NOT NULL`,
    );
    messages.push("Applied missing licenses.max_organizations (0014 drift repair).");
  }

  return messages;
}
