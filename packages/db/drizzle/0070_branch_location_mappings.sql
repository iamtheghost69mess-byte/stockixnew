-- Migration 0070: branch_location_mappings
-- Maps Finance (Bigcapital) branch IDs to POS location IDs for multi-location reporting.
-- Also adds finance_default_branch_id to tenant_deployments for quick lookups.

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "branch_location_mappings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "finance_branch_id" INTEGER NOT NULL,
  "pos_location_id" TEXT NOT NULL,
  "finance_branch_name" TEXT,
  "pos_location_name" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("organization_id", "finance_branch_id"),
  UNIQUE ("organization_id", "pos_location_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "branch_location_mappings_tenant_idx"
  ON "branch_location_mappings" ("tenant_id");--> statement-breakpoint

-- Store the default Finance branch ID on tenant_deployments so the sync worker
-- can look it up without hitting the Finance API on every run.
ALTER TABLE "tenant_deployments"
  ADD COLUMN IF NOT EXISTS "finance_default_branch_id" INTEGER;--> statement-breakpoint
