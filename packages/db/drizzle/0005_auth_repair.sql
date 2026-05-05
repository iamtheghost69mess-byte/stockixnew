ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "password_hash" text;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'super_admin' NOT NULL;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "mfa_secret" text;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "invite_token" text;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "invite_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "invited_by_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "owners" ADD CONSTRAINT "owners_invited_by_id_owners_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_tenant_id" uuid,
	"target_owner_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_owners_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_owner_id_owners_id_fk" FOREIGN KEY ("target_owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_actor_created_idx" ON "admin_audit_log" USING btree ("actor_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_tenant_created_idx" ON "admin_audit_log" USING btree ("target_tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_owner_created_idx" ON "admin_audit_log" USING btree ("target_owner_id","created_at");
