#!/usr/bin/env node
/**
 * Backfill tenant_config.public_discovery_slug for tenants missing one.
 * Usage: node apps/api/scripts/backfill-discovery-slugs.mjs
 * Loads DATABASE_URL from repo root .env (same as pnpm db:migrate).
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env") });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required (set in repo root .env)");
  process.exit(1);
}

const sql = postgres(databaseUrl);

function newSlug() {
  return randomBytes(18).toString("base64url");
}

const missing = await sql`
  SELECT tc.tenant_id
  FROM tenant_config tc
  WHERE tc.public_discovery_slug IS NULL
`;

let updated = 0;
for (const row of missing) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = newSlug();
    try {
      await sql`
        UPDATE tenant_config
        SET public_discovery_slug = ${slug}
        WHERE tenant_id = ${row.tenant_id}
          AND public_discovery_slug IS NULL
      `;
      updated++;
      break;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
}

const withoutConfig = await sql`
  SELECT t.id
  FROM tenants t
  LEFT JOIN tenant_config tc ON tc.tenant_id = t.id
  WHERE tc.id IS NULL
`;

for (const row of withoutConfig) {
  const slug = newSlug();
  await sql`
    INSERT INTO tenant_config (tenant_id, public_discovery_slug)
    VALUES (${row.id}, ${slug})
    ON CONFLICT (tenant_id) DO UPDATE
    SET public_discovery_slug = COALESCE(tenant_config.public_discovery_slug, EXCLUDED.public_discovery_slug)
  `;
  updated++;
}

console.log(`Backfilled ${updated} tenant discovery slug(s)`);
await sql.end();
