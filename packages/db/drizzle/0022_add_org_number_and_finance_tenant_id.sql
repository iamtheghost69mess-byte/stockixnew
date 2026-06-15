ALTER TABLE "tenant_deployments" ADD COLUMN "finance_tenant_id" integer;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "organization_number" varchar(20);--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_organization_number_unique" ON "tenants" USING btree ("organization_number");
