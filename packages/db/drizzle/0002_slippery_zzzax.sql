ALTER TABLE "tenant_deployments" ADD COLUMN "registration_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "admin_email" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "admin_first_name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "admin_last_name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "admin_email" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "admin_first_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "admin_last_name" DROP DEFAULT;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "tenant_port_seq" AS integer START WITH 4100 INCREMENT BY 1 MINVALUE 4100 MAXVALUE 4999 CACHE 1;