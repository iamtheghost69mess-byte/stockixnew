ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_slug_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_tenant_slug_unique" ON "organizations" USING btree ("tenant_id", "slug");
