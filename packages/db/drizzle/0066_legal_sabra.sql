CREATE TABLE "pms_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_tenant_id" uuid,
	"target_owner_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"request_id" text,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD COLUMN "diff" jsonb;--> statement-breakpoint
ALTER TABLE "pms_audit_log" ADD CONSTRAINT "pms_audit_log_actor_id_owners_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_audit_log" ADD CONSTRAINT "pms_audit_log_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_audit_log" ADD CONSTRAINT "pms_audit_log_target_owner_id_owners_id_fk" FOREIGN KEY ("target_owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pms_audit_log_actor_created_idx" ON "pms_audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "pms_audit_log_tenant_created_idx" ON "pms_audit_log" USING btree ("target_tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "pms_audit_log_owner_created_idx" ON "pms_audit_log" USING btree ("target_owner_id","created_at");--> statement-breakpoint
CREATE RULE no_delete_admin_audit AS ON DELETE TO admin_audit_log DO INSTEAD NOTHING;--> statement-breakpoint
CREATE RULE no_delete_pms_audit AS ON DELETE TO pms_audit_log DO INSTEAD NOTHING;