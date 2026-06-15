#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env") });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL required (.env at repo root)");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const [counts] = await sql`
  SELECT
    (SELECT count(*)::int FROM tenants) AS tenants,
    (SELECT count(*)::int FROM tenant_config) AS configs,
    (SELECT count(*)::int FROM tenant_config WHERE public_discovery_slug IS NOT NULL) AS with_slug
`;
console.log(JSON.stringify(counts, null, 2));
const sample = await sql`
  SELECT t.slug AS tenant_slug, tc.public_discovery_slug
  FROM tenants t
  LEFT JOIN tenant_config tc ON tc.tenant_id = t.id
  ORDER BY t.created_at DESC
  LIMIT 5
`;
console.log("sample:", sample);
await sql.end();
