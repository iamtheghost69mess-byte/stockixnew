CREATE INDEX IF NOT EXISTS "licenses_tenant_status_idx" ON "licenses" USING btree ("tenant_id","status");
