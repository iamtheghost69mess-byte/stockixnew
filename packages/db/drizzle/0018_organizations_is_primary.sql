ALTER TABLE "organizations" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: mark the earliest-created org per tenant as primary
UPDATE "organizations" o
SET "is_primary" = true
WHERE o."id" = (
  SELECT "id"
  FROM "organizations"
  WHERE "tenant_id" = o."tenant_id"
  ORDER BY "created_at" ASC
  LIMIT 1
);
