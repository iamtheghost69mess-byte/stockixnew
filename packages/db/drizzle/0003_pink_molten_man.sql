CREATE TABLE "tenant_provision_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlation_id" text NOT NULL,
	"slug" text,
	"tenant_id" uuid,
	"deployment_id" uuid,
	"phase" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tpe_correlation_created_idx" ON "tenant_provision_events" USING btree ("correlation_id","created_at");