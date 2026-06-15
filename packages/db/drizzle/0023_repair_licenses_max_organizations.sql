ALTER TABLE "licenses" ADD COLUMN IF NOT EXISTS "max_organizations" integer DEFAULT 1 NOT NULL;
