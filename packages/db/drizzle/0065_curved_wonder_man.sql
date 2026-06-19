ALTER TABLE "tenant_lifecycle_jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_lifecycle_jobs" ADD COLUMN "max_duration" integer DEFAULT 3600 NOT NULL;--> statement-breakpoint
CREATE INDEX "tlj_status_type_run_at_idx" ON "tenant_lifecycle_jobs" USING btree ("status","type","run_at");