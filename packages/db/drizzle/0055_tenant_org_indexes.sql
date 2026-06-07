CREATE INDEX IF NOT EXISTS "tenants_owner_id_idx" ON "tenants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_tenant_id_idx" ON "organizations" USING btree ("tenant_id");
