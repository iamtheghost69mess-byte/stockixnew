CREATE TABLE "license_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "license_id" uuid NOT NULL REFERENCES "licenses"("id") ON DELETE CASCADE,
  "actor_id" uuid,
  "actor_email" text,
  "action" text NOT NULL,
  "previous_values" text,
  "new_values" text,
  "notes" text,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "license_history_license_id_idx" ON "license_history"("license_id");
CREATE INDEX "license_history_created_at_idx" ON "license_history"("created_at");
