-- Migration 0061: PMS data model improvements
--   1. Soft-delete columns (deleted_at) on pms_properties, pms_rooms, pms_guests, pms_bookings
--   2. Partial unique index on pms_guests(tenant_id, email) WHERE email IS NOT NULL
--   3. Cast pms_bookings.check_in / check_out from text to date
--   4. Composite indexes for fast "not deleted" tenant queries
--   5. RESTRICTIVE RLS policies so soft-deleted rows are invisible to the app role

--> statement-breakpoint

-- ── 1. Add soft-delete columns ─────────────────────────────────────────────────

ALTER TABLE "pms_properties" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE;--> statement-breakpoint
ALTER TABLE "pms_rooms"      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE;--> statement-breakpoint
ALTER TABLE "pms_guests"     ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE;--> statement-breakpoint
ALTER TABLE "pms_bookings"   ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE;--> statement-breakpoint

-- ── 2. Composite (tenant_id, deleted_at) indexes for fast "active" scans ───────

CREATE INDEX IF NOT EXISTS "pms_properties_deleted_at_idx" ON "pms_properties" ("tenant_id", "deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pms_rooms_deleted_at_idx"      ON "pms_rooms"      ("tenant_id", "deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pms_guests_deleted_at_idx"     ON "pms_guests"     ("tenant_id", "deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pms_bookings_deleted_at_idx"   ON "pms_bookings"   ("tenant_id", "deleted_at");--> statement-breakpoint

-- ── 3. Partial unique index — one active guest email per tenant ────────────────
-- Drizzle cannot express a partial index in schema, so it lives here.
-- Deleted guests are excluded so the same email can be re-added after removal.

CREATE UNIQUE INDEX IF NOT EXISTS "pms_guests_tenant_email_unique"
  ON "pms_guests" ("tenant_id", "email")
  WHERE "email" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint

-- ── 4. Cast check_in / check_out from text to date ────────────────────────────
-- All existing values were validated as YYYY-MM-DD by the API schema, so the
-- implicit cast is safe.

ALTER TABLE "pms_bookings"
  ALTER COLUMN "check_in"  TYPE date USING "check_in"::date,
  ALTER COLUMN "check_out" TYPE date USING "check_out"::date;--> statement-breakpoint

-- ── 5. RESTRICTIVE RLS policies for soft delete ────────────────────────────────
-- These policies AND with the existing permissive tenant-isolation policies from
-- migration 0060. Any SELECT/UPDATE/DELETE touching a soft-deleted row is blocked
-- at the database layer for the stockix_pms_app role.
-- Application code adds isNull(deletedAt) as a second layer of defence.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pms_properties' AND policyname = 'pms_hide_deleted_properties'
  ) THEN
    EXECUTE $P$
      CREATE POLICY pms_hide_deleted_properties ON pms_properties
        AS RESTRICTIVE USING (deleted_at IS NULL)
    $P$;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pms_rooms' AND policyname = 'pms_hide_deleted_rooms'
  ) THEN
    EXECUTE $P$
      CREATE POLICY pms_hide_deleted_rooms ON pms_rooms
        AS RESTRICTIVE USING (deleted_at IS NULL)
    $P$;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pms_guests' AND policyname = 'pms_hide_deleted_guests'
  ) THEN
    EXECUTE $P$
      CREATE POLICY pms_hide_deleted_guests ON pms_guests
        AS RESTRICTIVE USING (deleted_at IS NULL)
    $P$;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pms_bookings' AND policyname = 'pms_hide_deleted_bookings'
  ) THEN
    EXECUTE $P$
      CREATE POLICY pms_hide_deleted_bookings ON pms_bookings
        AS RESTRICTIVE USING (deleted_at IS NULL)
    $P$;
  END IF;
END $$;
