/**
 * Applies SQL migrations that exist in packages/db/drizzle but are missing from
 * drizzle/meta/_journal.json (so `drizzle-kit migrate` skips them).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type postgres from "postgres";

const drizzleDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "drizzle");

type OrphanMigration = {
  file: string;
  when: number;
  isApplied: (sql: postgres.Sql) => Promise<boolean>;
};

const ORPHANS: OrphanMigration[] = [
  {
    file: "0038_one_active_license_per_tenant.sql",
    when: 1781020000000,
    isApplied: async (sql) => {
      const rows = await sql`
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'licenses_one_active_per_tenant'
        LIMIT 1
      `;
      return rows.length > 0;
    },
  },
  {
    file: "0039_licenses_max_users.sql",
    when: 1781030000000,
    isApplied: async (sql) => {
      const rows = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'max_users'
        LIMIT 1
      `;
      return rows.length > 0;
    },
  },
  {
    file: "0040_licenses_status_check.sql",
    when: 1781040000000,
    isApplied: async (sql) => {
      const rows = await sql`
        SELECT 1 FROM pg_constraint
        WHERE conname = 'licenses_status_check'
        LIMIT 1
      `;
      return rows.length > 0;
    },
  },
  {
    file: "0043_email_logs.sql",
    when: 1781050000000,
    isApplied: async (sql) => {
      const rows = await sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'email_logs'
        LIMIT 1
      `;
      return rows.length > 0;
    },
  },
  {
    file: "0044_platform_roles.sql",
    when: 1781060000000,
    isApplied: async (sql) => {
      const rows = await sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'platform_roles'
        LIMIT 1
      `;
      return rows.length > 0;
    },
  },
  {
    file: "0045_tenants_org_scope_permission.sql",
    when: 1781070000000,
    isApplied: async (sql) => {
      const rows = await sql<{ permissions: unknown }[]>`
        SELECT permissions FROM platform_roles WHERE slug = 'support_agent' LIMIT 1
      `;
      const perms = rows[0]?.permissions;
      return Array.isArray(perms) && perms.includes("tenants.org_scope");
    },
  },
  {
    file: "0046_stxi_license.sql",
    when: 1781080000000,
    isApplied: async (sql) => {
      const rows = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'key_format'
        LIMIT 1
      `;
      return rows.length > 0;
    },
  },
  {
    file: "0048_organizations_pos_organization_id.sql",
    when: 1781120000000,
    isApplied: async (sql) => {
      const rows = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'organizations'
          AND column_name = 'pos_organization_id'
        LIMIT 1
      `;
      return rows.length > 0;
    },
  },
];

function migrationHash(file: string): string {
  const query = readFileSync(join(drizzleDir, file), "utf8");
  return createHash("sha256").update(query).digest("hex");
}

async function recordApplied(
  sql: postgres.Sql,
  file: string,
  when: number,
): Promise<void> {
  const hash = migrationHash(file);
  const existing = await sql<{ hash: string }[]>`
    SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash} LIMIT 1
  `;
  if (existing.length > 0) return;
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${when})
  `;
}

export async function applyOrphanMigrations(sql: postgres.Sql): Promise<string[]> {
  const messages: string[] = [];

  for (const orphan of ORPHANS) {
    if (await orphan.isApplied(sql)) continue;
    const path = join(drizzleDir, orphan.file);
    const body = readFileSync(path, "utf8");
    await sql.unsafe(body);
    await recordApplied(sql, orphan.file, orphan.when);
    messages.push(`Applied orphan migration ${orphan.file}`);
  }

  return messages;
}
