CREATE TABLE "owner_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'info',
  "title" text NOT NULL,
  "body" text NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
  "license_id" uuid REFERENCES "licenses"("id") ON DELETE SET NULL,
  "correlation_id" text,
  "action_url" text,
  "action_label" text,
  "read_at" timestamptz,
  "meta" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "owner_notifications_owner_id_idx"
  ON "owner_notifications"("owner_id");

CREATE INDEX "owner_notifications_owner_unread_idx"
  ON "owner_notifications"("owner_id", "read_at")
  WHERE "read_at" IS NULL;

CREATE INDEX "owner_notifications_created_at_idx"
  ON "owner_notifications"("created_at" DESC);
