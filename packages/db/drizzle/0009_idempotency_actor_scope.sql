DO $$ BEGIN
 ALTER TABLE "api_idempotency_keys" DROP CONSTRAINT IF EXISTS "api_idempotency_keys_key_unique";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_actor_key_unique" UNIQUE("actor_id","key");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
