-- PMS schema upgrade (registered in journal; extends 0029_pms_tables)

-- Existing tables from 0029
ALTER TABLE "pms_properties"
  ADD COLUMN IF NOT EXISTS "check_in_time"   text NOT NULL DEFAULT '14:00',
  ADD COLUMN IF NOT EXISTS "check_out_time"  text NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS "min_nights"      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "booking_window"  integer NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS "cleaning_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "feed_slug"       text;

CREATE UNIQUE INDEX IF NOT EXISTS "pms_properties_feed_slug_unique"
  ON "pms_properties" ("feed_slug")
  WHERE "feed_slug" IS NOT NULL;

ALTER TABLE "pms_rooms"
  ADD COLUMN IF NOT EXISTS "description" text,
  ADD COLUMN IF NOT EXISTS "amenities"   text NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "floor"       integer;

ALTER TABLE "pms_guests"
  ADD COLUMN IF NOT EXISTS "address"         text,
  ADD COLUMN IF NOT EXISTS "city"            text,
  ADD COLUMN IF NOT EXISTS "country"         text,
  ADD COLUMN IF NOT EXISTS "nationality"     text,
  ADD COLUMN IF NOT EXISTS "date_of_birth"   text,
  ADD COLUMN IF NOT EXISTS "id_type"         text,
  ADD COLUMN IF NOT EXISTS "id_number"       text,
  ADD COLUMN IF NOT EXISTS "passport_number" text,
  ADD COLUMN IF NOT EXISTS "passport_expiry" text,
  ADD COLUMN IF NOT EXISTS "issued_by"       text,
  ADD COLUMN IF NOT EXISTS "visa_number"     text,
  ADD COLUMN IF NOT EXISTS "visa_from"       text,
  ADD COLUMN IF NOT EXISTS "visa_to"         text,
  ADD COLUMN IF NOT EXISTS "has_visa"        boolean NOT NULL DEFAULT false;

ALTER TABLE "pms_bookings"
  ADD COLUMN IF NOT EXISTS "adults"                  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "children"               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "platform"               text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS "special_requests"       text,
  ADD COLUMN IF NOT EXISTS "check_in_actual_at"     timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "check_out_actual_at"    timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "accounting_sync_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "finance_receipt_id"     integer;

CREATE INDEX IF NOT EXISTS "pms_bookings_status_idx"   ON "pms_bookings" ("booking_status");
CREATE INDEX IF NOT EXISTS "pms_bookings_check_in_idx" ON "pms_bookings" ("check_in");

ALTER TABLE "pms_ical_channels"
  ADD COLUMN IF NOT EXISTS "platform"       text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "buffer_before"  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "buffer_after"   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "last_error"     text,
  ADD COLUMN IF NOT EXISTS "failure_count"  integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "pms_ical_channels_property_idx"
  ON "pms_ical_channels" ("property_id");

-- New tables (create before altering tables that reference them)
CREATE TABLE IF NOT EXISTS "pms_payments" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"          uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "booking_id"         uuid NOT NULL REFERENCES "pms_bookings"("id") ON DELETE cascade,
  "amount_cents"       integer NOT NULL,
  "method"             text NOT NULL DEFAULT 'cash',
  "status"             text NOT NULL DEFAULT 'completed',
  "transaction_id"     text,
  "finance_payment_id" integer,
  "notes"              text,
  "created_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"         timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_payments_tenant_idx"  ON "pms_payments" ("tenant_id");
CREATE INDEX IF NOT EXISTS "pms_payments_booking_idx" ON "pms_payments" ("booking_id");

CREATE TABLE IF NOT EXISTS "pms_calendar_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid NOT NULL REFERENCES "pms_properties"("id") ON DELETE cascade,
  "platform"    text NOT NULL,
  "ical_uid"    text NOT NULL,
  "summary"     text NOT NULL DEFAULT '',
  "start_date"  text NOT NULL,
  "end_date"    text NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"  timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_cal_events_tenant_idx"
  ON "pms_calendar_events" ("tenant_id");
CREATE INDEX IF NOT EXISTS "pms_cal_events_property_platform_idx"
  ON "pms_calendar_events" ("property_id", "platform");
CREATE UNIQUE INDEX IF NOT EXISTS "pms_cal_events_uid_unique"
  ON "pms_calendar_events" ("property_id", "platform", "ical_uid");

CREATE TABLE IF NOT EXISTS "pms_sync_logs" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid REFERENCES "pms_properties"("id") ON DELETE set null,
  "level"       text NOT NULL DEFAULT 'info',
  "message"     text NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_sync_logs_tenant_idx"   ON "pms_sync_logs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "pms_sync_logs_property_idx" ON "pms_sync_logs" ("property_id");

CREATE TABLE IF NOT EXISTS "pms_date_overrides" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid NOT NULL REFERENCES "pms_properties"("id") ON DELETE cascade,
  "date"        text NOT NULL,
  "type"        text NOT NULL DEFAULT 'closed',
  "note"        text NOT NULL DEFAULT '',
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_date_overrides_tenant_idx" ON "pms_date_overrides" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pms_date_overrides_property_date_unique"
  ON "pms_date_overrides" ("property_id", "date");

CREATE TABLE IF NOT EXISTS "pms_cleaners" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name"       text NOT NULL,
  "phone"      text,
  "email"      text,
  "notes"      text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_cleaners_tenant_idx" ON "pms_cleaners" ("tenant_id");

CREATE TABLE IF NOT EXISTS "pms_cleaner_assignments" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid NOT NULL REFERENCES "pms_properties"("id") ON DELETE cascade,
  "cleaner_id"  uuid NOT NULL REFERENCES "pms_cleaners"("id") ON DELETE cascade,
  "priority"    integer NOT NULL DEFAULT 0,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_cleaner_assignments_tenant_idx"
  ON "pms_cleaner_assignments" ("tenant_id");
CREATE INDEX IF NOT EXISTS "pms_cleaner_assignments_property_idx"
  ON "pms_cleaner_assignments" ("property_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pms_cleaner_assignments_property_cleaner_unique"
  ON "pms_cleaner_assignments" ("property_id", "cleaner_id");

CREATE TABLE IF NOT EXISTS "pms_property_managers" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"      uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id"    uuid NOT NULL REFERENCES "pms_properties"("id") ON DELETE cascade,
  "staff_id"       uuid NOT NULL REFERENCES "pms_staff"("id") ON DELETE cascade,
  "granted_by_id"  uuid REFERENCES "owners"("id") ON DELETE set null,
  "created_at"     timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_property_managers_tenant_idx"
  ON "pms_property_managers" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pms_property_managers_property_staff_unique"
  ON "pms_property_managers" ("property_id", "staff_id");

CREATE TABLE IF NOT EXISTS "pms_property_manager_invites" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"             uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id"           uuid NOT NULL REFERENCES "pms_properties"("id") ON DELETE cascade,
  "token"                 text NOT NULL,
  "created_by_id"         uuid REFERENCES "owners"("id") ON DELETE set null,
  "accepted_by_staff_id"  uuid REFERENCES "pms_staff"("id") ON DELETE set null,
  "accepted_at"           timestamp with time zone,
  "expires_at"            timestamp with time zone NOT NULL,
  "revoked_at"            timestamp with time zone,
  "created_at"            timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_pm_invites_tenant_idx"
  ON "pms_property_manager_invites" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pms_pm_invites_token_unique"
  ON "pms_property_manager_invites" ("token");

-- Alter 0029 tables that reference new tables
ALTER TABLE "pms_cleaning_tasks"
  ADD COLUMN IF NOT EXISTS "property_id" uuid REFERENCES "pms_properties"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "cleaner_id"  uuid REFERENCES "pms_cleaners"("id")   ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "done_at"     timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "notes"       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "photos"      text NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "updated_at"  timestamp with time zone DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "pms_cleaning_tasks_date_idx" ON "pms_cleaning_tasks" ("scheduled_date");

ALTER TABLE "pms_message_templates"
  ADD COLUMN IF NOT EXISTS "property_id"      uuid REFERENCES "pms_properties"("id") ON DELETE cascade,
  ADD COLUMN IF NOT EXISTS "subject"          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "trigger"          text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS "send_offset_days" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updated_at"       timestamp with time zone DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "pms_message_templates_property_idx"
  ON "pms_message_templates" ("property_id");
