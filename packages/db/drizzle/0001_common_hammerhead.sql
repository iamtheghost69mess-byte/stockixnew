ALTER TABLE "tenant_deployments" ALTER COLUMN "compose_project_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_deployments" ADD COLUMN "internal_port" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_deployments" ADD COLUMN "mysql_password" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_deployments" ADD COLUMN "mysql_root_password" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_deployments" ADD COLUMN "jwt_secret" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_deployments" ADD COLUMN "mongo_url" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_deployments_compose_project_name_unique" ON "tenant_deployments" USING btree ("compose_project_name");