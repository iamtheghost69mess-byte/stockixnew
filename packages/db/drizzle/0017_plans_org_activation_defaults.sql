ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "max_organizations" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "max_activations" integer DEFAULT 1 NOT NULL;
