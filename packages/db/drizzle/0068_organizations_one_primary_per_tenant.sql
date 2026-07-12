CREATE UNIQUE INDEX IF NOT EXISTS "organizations_one_primary_per_tenant"
  ON "organizations" ("tenant_id")
  WHERE "is_primary" = true;
