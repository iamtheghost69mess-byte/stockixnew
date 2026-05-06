CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_tenant_id" uuid,
	"target_owner_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_lifecycle_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tenant_id" uuid,
	"correlation_id" text,
	"payload" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "role" text DEFAULT 'super_admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "session_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "failed_login_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "last_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "invite_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "invited_by_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_owners_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_owner_id_owners_id_fk" FOREIGN KEY ("target_owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_actor_id_owners_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_lifecycle_jobs" ADD CONSTRAINT "tenant_lifecycle_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_created_idx" ON "admin_audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_tenant_created_idx" ON "admin_audit_log" USING btree ("target_tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_owner_created_idx" ON "admin_audit_log" USING btree ("target_owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_idempotency_keys_actor_key_unique" ON "api_idempotency_keys" USING btree ("actor_id","key");--> statement-breakpoint
CREATE INDEX "api_idempotency_keys_actor_created_idx" ON "api_idempotency_keys" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "api_idempotency_keys_expires_idx" ON "api_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tenant_lifecycle_jobs_status_run_at_idx" ON "tenant_lifecycle_jobs" USING btree ("status","run_at","priority");--> statement-breakpoint
CREATE INDEX "tenant_lifecycle_jobs_tenant_created_idx" ON "tenant_lifecycle_jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "tenant_lifecycle_jobs_correlation_created_idx" ON "tenant_lifecycle_jobs" USING btree ("correlation_id","created_at");--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_invited_by_id_owners_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;