ALTER TABLE "tenant_deployments" ADD COLUMN IF NOT EXISTS "finance_walk_in_customer_id" integer;
ALTER TABLE "tenant_deployments" ADD COLUMN IF NOT EXISTS "finance_cash_account_id" integer;
ALTER TABLE "tenant_deployments" ADD COLUMN IF NOT EXISTS "finance_card_account_id" integer;
