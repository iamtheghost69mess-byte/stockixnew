import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "path";

// Load from root .env
config({ path: resolve("../../.env") });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const sql = postgres(connectionString);
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "tenant_deletion_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid,
        "slug" text,
        "status" text NOT NULL,
        "message" text,
        "meta" jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS "tenant_deletion_logs_tenant_idx" ON "tenant_deletion_logs" ("tenant_id");`;
    await sql`CREATE INDEX IF NOT EXISTS "tenant_deletion_logs_created_idx" ON "tenant_deletion_logs" ("created_at");`;
    console.log("Table tenant_deletion_logs created successfully.");
  } finally {
    await sql.end();
  }
}

main().catch(console.error);
