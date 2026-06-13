ALTER TABLE "tenant_lifecycle_jobs" DROP CONSTRAINT "tenant_lifecycle_jobs_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "tenant_lifecycle_jobs" ADD CONSTRAINT "tenant_lifecycle_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;