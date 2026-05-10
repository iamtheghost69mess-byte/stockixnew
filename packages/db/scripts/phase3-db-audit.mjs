import path from "node:path";
import postgres from "postgres";
import { loadEnvFilesAtRoot } from "../../../scripts/load-root-env.mjs";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
loadEnvFilesAtRoot(root);

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("NO_DATABASE_URL");
  process.exit(1);
}

const sql = postgres(url);

try {
  console.log("=== Q1 columns ===");
  const q1 = await sql`
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN (
  'plans','licenses','license_activations',
  'blacklisted_fingerprints','tenants'
)
ORDER BY table_name, ordinal_position`;
  console.log(JSON.stringify(q1, null, 2));

  console.log("\n=== Q2 constraints (pg_get_constraintdef; consrc removed PG12+) ===");
  const q2 = await sql`
SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) AS consrc
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname IN (
  'plans','licenses','license_activations','blacklisted_fingerprints'
)`;
  console.log(JSON.stringify(q2, null, 2));

  console.log("\n=== Q3 plans ===");
  const q3 = await sql`SELECT slug, name FROM plans ORDER BY sort_order`;
  console.log(JSON.stringify(q3, null, 2));

  console.log("\n=== Q4 tenants.plan_slug ===");
  const q4 = await sql`
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tenants' AND column_name = 'plan_slug'`;
  console.log(JSON.stringify(q4, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
