CREATE UNIQUE INDEX IF NOT EXISTS "licenses_one_active_per_tenant"
  ON "licenses" ("tenant_id")
  WHERE "status" = 'active' AND "tenant_id" IS NOT NULL;
