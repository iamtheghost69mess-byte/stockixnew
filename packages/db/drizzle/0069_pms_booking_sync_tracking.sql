-- Migration 0069: Add sync-retry tracking columns to pms_bookings
--   sync_attempts  — incremented on each Finance sync attempt
--   sync_error     — last error message (cleared on success)
--   synced_at      — timestamp of last successful sync

--> statement-breakpoint

ALTER TABLE "pms_bookings" ADD COLUMN IF NOT EXISTS "sync_attempts" INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pms_bookings" ADD COLUMN IF NOT EXISTS "sync_error" TEXT;--> statement-breakpoint
ALTER TABLE "pms_bookings" ADD COLUMN IF NOT EXISTS "synced_at" TIMESTAMP WITH TIME ZONE;--> statement-breakpoint

-- Index for the finance-sync cron query: pending bookings with checkout date set
CREATE INDEX IF NOT EXISTS "pms_bookings_sync_status_idx"
  ON "pms_bookings" ("tenant_id", "accounting_sync_status")
  WHERE "deleted_at" IS NULL;--> statement-breakpoint
