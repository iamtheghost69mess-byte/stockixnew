import postgres from "postgres";
import { dbConfig } from "@repo/config";

const sql = postgres(
  dbConfig.databaseUrl ?? "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform",
);

const statements = [
  `ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "password_hash" text;`,
  `ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'super_admin' NOT NULL;`,
  `ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "mfa_secret" text;`,
  `ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean DEFAULT false NOT NULL;`,
  `ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;`,
  `ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "invite_token" text;`,
  `ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "invite_token_expires_at" timestamp with time zone;`,
  `ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "invited_by_id" uuid;`,
  `DO $$ BEGIN
    ALTER TABLE "owners" ADD CONSTRAINT "owners_invited_by_id_owners_id_fk"
    FOREIGN KEY ("invited_by_id") REFERENCES "public"."owners"("id")
    ON DELETE no action ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;`,
  `CREATE TABLE IF NOT EXISTS "admin_audit_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "actor_id" uuid NOT NULL,
    "action" text NOT NULL,
    "target_tenant_id" uuid,
    "target_owner_id" uuid,
    "ip_address" text,
    "user_agent" text,
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );`,
];

try {
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  console.log("Auth repair SQL applied.");
} finally {
  await sql.end({ timeout: 1 });
}
