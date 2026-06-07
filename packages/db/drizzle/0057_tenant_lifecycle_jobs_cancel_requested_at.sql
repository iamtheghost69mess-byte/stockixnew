ALTER TABLE "tenant_lifecycle_jobs" ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamp with time zone;
