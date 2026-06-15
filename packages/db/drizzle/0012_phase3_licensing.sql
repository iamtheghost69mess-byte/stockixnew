CREATE TABLE "blacklisted_fingerprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hardware_fingerprint" text NOT NULL,
	"reason" text,
	"blacklisted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" uuid NOT NULL,
	"hardware_fingerprint" text NOT NULL,
	"machine_name" text,
	"ip_address" text,
	"activation_status" text DEFAULT 'active' NOT NULL,
	"offline_token" text,
	"offline_token_expires_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"deactivated_by_id" uuid,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_key" text NOT NULL,
	"product" text DEFAULT 'platform' NOT NULL,
	"plan_slug" text DEFAULT 'starter' NOT NULL,
	"tenant_id" uuid,
	"status" text DEFAULT 'unassigned' NOT NULL,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_perpetual" boolean DEFAULT false NOT NULL,
	"max_activations" integer DEFAULT 1 NOT NULL,
	"activation_count" integer DEFAULT 0 NOT NULL,
	"grace_period_days" integer DEFAULT 7 NOT NULL,
	"notes" text,
	"created_by_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_slug" text DEFAULT 'starter' NOT NULL;--> statement-breakpoint
ALTER TABLE "blacklisted_fingerprints" ADD CONSTRAINT "blacklisted_fingerprints_blacklisted_by_id_owners_id_fk" FOREIGN KEY ("blacklisted_by_id") REFERENCES "public"."owners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_deactivated_by_id_owners_id_fk" FOREIGN KEY ("deactivated_by_id") REFERENCES "public"."owners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_created_by_id_owners_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."owners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_revoked_by_id_owners_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."owners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blacklisted_fp_unique" ON "blacklisted_fingerprints" USING btree ("hardware_fingerprint");--> statement-breakpoint
CREATE INDEX "lic_act_license_id_idx" ON "license_activations" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "lic_act_fingerprint_idx" ON "license_activations" USING btree ("hardware_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "lic_act_license_fingerprint_unique" ON "license_activations" USING btree ("license_id","hardware_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "licenses_key_unique" ON "licenses" USING btree ("license_key");--> statement-breakpoint
CREATE INDEX "licenses_tenant_id_idx" ON "licenses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "licenses_status_idx" ON "licenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "licenses_product_idx" ON "licenses" USING btree ("product");--> statement-breakpoint
CREATE INDEX "licenses_expires_at_idx" ON "licenses" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_slug_unique" ON "plans" USING btree ("slug");
--> statement-breakpoint
INSERT INTO "plans" ("name", "slug", "sort_order", "description") VALUES
  ('Starter', 'starter', 1, 'For small businesses getting started'),
  ('Growth', 'growth', 2, 'For growing teams needing more power'),
  ('Pro', 'pro', 3, 'For established businesses at scale'),
  ('Enterprise', 'enterprise', 4, 'Custom pricing for large operations')
ON CONFLICT ("slug") DO NOTHING;