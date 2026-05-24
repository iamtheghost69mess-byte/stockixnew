CREATE TABLE IF NOT EXISTS "api_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "api_idempotency_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_actor_id_owners_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_idempotency_keys_actor_created_idx" ON "api_idempotency_keys" USING btree ("actor_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_idempotency_keys_expires_idx" ON "api_idempotency_keys" USING btree ("expires_at");
