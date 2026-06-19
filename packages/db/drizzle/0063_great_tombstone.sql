CREATE TABLE "dead_letter_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"type" text NOT NULL,
	"tenant_id" uuid,
	"correlation_id" text,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dead_letter_jobs" ADD CONSTRAINT "dead_letter_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dead_letter_jobs_tenant_created_idx" ON "dead_letter_jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "dead_letter_jobs_correlation_created_idx" ON "dead_letter_jobs" USING btree ("correlation_id","created_at");