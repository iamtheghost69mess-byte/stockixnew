ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "failed_login_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "last_failed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "owners" ADD CONSTRAINT "owners_status_check" CHECK ("status" IN ('active', 'suspended'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
