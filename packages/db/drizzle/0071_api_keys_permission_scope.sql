-- Migration 0071: Add permission scoping to api_keys
-- Null means "inherit owner's full permissions"; non-null is an explicit subset.

--> statement-breakpoint

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "permissions" JSONB;--> statement-breakpoint
