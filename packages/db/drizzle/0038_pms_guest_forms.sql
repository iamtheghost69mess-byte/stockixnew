-- PMS guest pre-arrival forms (RT-25.2 pattern)

CREATE TABLE IF NOT EXISTS "pms_guest_form_templates" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid REFERENCES "pms_properties"("id") ON DELETE cascade,
  "name"        text NOT NULL,
  "fields"      text NOT NULL DEFAULT '[]',
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"  timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_guest_form_templates_tenant_idx"   ON "pms_guest_form_templates" ("tenant_id");
CREATE INDEX IF NOT EXISTS "pms_guest_form_templates_property_idx" ON "pms_guest_form_templates" ("property_id");

CREATE TABLE IF NOT EXISTS "pms_guest_form_submissions" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "booking_id"   uuid NOT NULL REFERENCES "pms_bookings"("id") ON DELETE cascade,
  "template_id"  uuid NOT NULL REFERENCES "pms_guest_form_templates"("id") ON DELETE cascade,
  "share_token"  text NOT NULL,
  "answers"      text,
  "submitted_at" timestamp with time zone,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pms_guest_form_submissions_tenant_idx"  ON "pms_guest_form_submissions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "pms_guest_form_submissions_booking_idx" ON "pms_guest_form_submissions" ("booking_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pms_guest_form_submissions_token_unique" ON "pms_guest_form_submissions" ("share_token");
