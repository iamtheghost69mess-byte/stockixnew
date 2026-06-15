CREATE TABLE IF NOT EXISTS "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text NOT NULL,
	"recipient_hash" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"delivery_status" text,
	"error" text,
	"tenant_id" uuid,
	"owner_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_logs_created_at_idx" ON "email_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_logs_template_key_idx" ON "email_logs" USING btree ("template_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_logs_provider_message_id_idx" ON "email_logs" USING btree ("provider_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_logs_tenant_id_idx" ON "email_logs" USING btree ("tenant_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
