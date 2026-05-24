CREATE TABLE IF NOT EXISTS "pms_properties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "type" text DEFAULT 'hotel' NOT NULL,
  "address" text,
  "city" text,
  "country" text,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_properties_tenant_idx" ON "pms_properties" ("tenant_id");

CREATE TABLE IF NOT EXISTS "pms_rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid NOT NULL REFERENCES "pms_properties"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "type" text DEFAULT 'standard' NOT NULL,
  "capacity" integer DEFAULT 2 NOT NULL,
  "rate_cents" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'available' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_rooms_tenant_idx" ON "pms_rooms" ("tenant_id");
CREATE INDEX IF NOT EXISTS "pms_rooms_property_idx" ON "pms_rooms" ("property_id");

CREATE TABLE IF NOT EXISTS "pms_guests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_guests_tenant_idx" ON "pms_guests" ("tenant_id");

CREATE TABLE IF NOT EXISTS "pms_bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid NOT NULL REFERENCES "pms_properties"("id") ON DELETE cascade,
  "room_id" uuid NOT NULL REFERENCES "pms_rooms"("id") ON DELETE cascade,
  "guest_id" uuid NOT NULL REFERENCES "pms_guests"("id") ON DELETE cascade,
  "check_in" text NOT NULL,
  "check_out" text NOT NULL,
  "total_amount_cents" integer DEFAULT 0 NOT NULL,
  "booking_status" text DEFAULT 'confirmed' NOT NULL,
  "payment_status" text DEFAULT 'pending' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_bookings_tenant_idx" ON "pms_bookings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "pms_bookings_property_idx" ON "pms_bookings" ("property_id");

CREATE TABLE IF NOT EXISTS "pms_ical_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid NOT NULL REFERENCES "pms_properties"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "import_url" text,
  "export_token" text NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_ical_channels_tenant_idx" ON "pms_ical_channels" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pms_ical_export_token_unique" ON "pms_ical_channels" ("export_token");

CREATE TABLE IF NOT EXISTS "pms_staff" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "role" text DEFAULT 'receptionist' NOT NULL,
  "email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_staff_tenant_idx" ON "pms_staff" ("tenant_id");

CREATE TABLE IF NOT EXISTS "pms_cleaning_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "room_id" uuid NOT NULL REFERENCES "pms_rooms"("id") ON DELETE cascade,
  "scheduled_date" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "assignee_id" uuid REFERENCES "pms_staff"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_cleaning_tasks_tenant_idx" ON "pms_cleaning_tasks" ("tenant_id");

CREATE TABLE IF NOT EXISTS "pms_message_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "channel" text DEFAULT 'email' NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_message_templates_tenant_idx" ON "pms_message_templates" ("tenant_id");
