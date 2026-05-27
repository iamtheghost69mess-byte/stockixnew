ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "invite_token_hash" text;
--> statement-breakpoint
UPDATE "owners"
SET "invite_token_hash" = encode(digest("invite_token", 'sha256'), 'hex')
WHERE "invite_token" IS NOT NULL
  AND "invite_token_hash" IS NULL;
