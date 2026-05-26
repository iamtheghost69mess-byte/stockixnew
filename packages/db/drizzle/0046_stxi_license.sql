ALTER TABLE "licenses" ADD COLUMN IF NOT EXISTS "key_format" text NOT NULL DEFAULT 'stkx';
ALTER TABLE "licenses" ADD COLUMN IF NOT EXISTS "scoped_location_id" text;

UPDATE "licenses" SET "key_format" = 'stkx' WHERE "key_format" IS NULL OR "key_format" = '';

CREATE INDEX IF NOT EXISTS "licenses_tenant_location_idx"
  ON "licenses" ("tenant_id", "scoped_location_id")
  WHERE "status" = 'active';
