CREATE TABLE "tenant_deletion_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"slug" text,
	"status" text NOT NULL,
	"message" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ORIGINAL: ALTER TABLE "organizations" DROP CONSTRAINT "organizations_slug_unique";
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_slug_unique";--> statement-breakpoint
-- ORIGINAL: ALTER TABLE "tenant_lifecycle_jobs" ADD COLUMN "cancel_requested_at" timestamp with time zone;
ALTER TABLE "tenant_lifecycle_jobs" ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tenant_deletion_logs_tenant_idx" ON "tenant_deletion_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_deletion_logs_created_idx" ON "tenant_deletion_logs" USING btree ("created_at");--> statement-breakpoint
-- ORIGINAL: CREATE UNIQUE INDEX "organizations_tenant_slug_unique" ON "organizations" USING btree ("tenant_id","slug");
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_tenant_slug_unique" ON "organizations" USING btree ("tenant_id","slug");