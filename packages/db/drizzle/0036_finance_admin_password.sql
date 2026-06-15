ALTER TABLE "tenant_deployments"
  ADD COLUMN IF NOT EXISTS "finance_admin_password" text;
