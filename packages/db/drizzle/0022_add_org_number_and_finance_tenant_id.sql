CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_prefix" varchar(32) NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "finance_organization_id" varchar(255);--> statement-breakpoint
ALTER TABLE "tenant_deployments" ADD COLUMN "finance_tenant_id" integer;--> statement-breakpoint
ALTER TABLE "tenant_provision_events" ADD COLUMN "parent_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "organization_number" varchar(20);--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_owner_id_idx" ON "api_keys" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_organization_number_unique" ON "tenants" USING btree ("organization_number");