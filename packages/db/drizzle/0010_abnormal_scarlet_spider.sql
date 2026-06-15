CREATE TABLE IF NOT EXISTS "tenant_lifecycle_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tenant_id" uuid,
	"correlation_id" text,
	"payload" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_lifecycle_jobs" ADD CONSTRAINT "tenant_lifecycle_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_lifecycle_jobs_status_run_at_idx" ON "tenant_lifecycle_jobs" USING btree ("status","run_at","priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_lifecycle_jobs_tenant_created_idx" ON "tenant_lifecycle_jobs" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_lifecycle_jobs_correlation_created_idx" ON "tenant_lifecycle_jobs" USING btree ("correlation_id","created_at");