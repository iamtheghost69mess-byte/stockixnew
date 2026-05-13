CREATE TABLE IF NOT EXISTS "owner_organization_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_organization_access" ADD CONSTRAINT "owner_organization_access_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "owner_organization_access" ADD CONSTRAINT "owner_organization_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "owner_organization_access" ADD CONSTRAINT "owner_organization_access_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "owner_org_access_owner_org_unique" ON "owner_organization_access" USING btree ("owner_id","organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_org_access_owner_idx" ON "owner_organization_access" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_org_access_tenant_idx" ON "owner_organization_access" USING btree ("tenant_id");
