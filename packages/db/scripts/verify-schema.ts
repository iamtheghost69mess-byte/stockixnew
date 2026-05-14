import postgres from "postgres";

const REQUIRED_COLUMNS = [
  { table: "organizations", column: "is_primary", type: "boolean" },
  {
    table: "organizations",
    column: "finance_organization_id",
    type: "character varying",
  },
  { table: "tenant_provision_events", column: "parent_tenant_id", type: "uuid" },
  { table: "api_keys", column: "key_hash", type: "text" },
  { table: "api_keys", column: "key_prefix", type: "character varying" },
  { table: "api_keys", column: "revoked_at", type: "timestamp with time zone" },
  { table: "licenses", column: "max_organizations", type: "integer" },
  { table: "licenses", column: "valid_from", type: "timestamp with time zone" },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  let failed = false;

  console.log("Verifying schema columns...\n");

  for (const { table, column, type } of REQUIRED_COLUMNS) {
    const rows = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = ${table}
        AND column_name  = ${column}
    `;

    if (rows.length === 0) {
      console.error(
        `❌ MISSING   ${table}.${column}\n` +
          `   Expected: ${type}\n` +
          `   Fix:      ALTER TABLE "${table}" ADD COLUMN "${column}" ${type};\n`,
      );
      failed = true;
    } else {
      console.log(`✅ OK        ${table}.${column}`);
    }
  }

  await sql.end();

  if (failed) {
    console.error(
      "\n❌ Schema drift detected.\n" +
        "   Run the ALTER TABLE statements above, then re-run this script.",
    );
    process.exit(1);
  }

  console.log("\n✅ All columns verified. Schema is in sync.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
