ALTER TABLE "tenant_config" ADD COLUMN IF NOT EXISTS "public_discovery_slug" text;

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_config_public_discovery_slug_unique"
  ON "tenant_config" ("public_discovery_slug")
  WHERE "public_discovery_slug" IS NOT NULL;
