-- Migration 0072: Add chatwoot_account_id to organizations table
-- Migration 0030 only added this column to tenants; the organizations table was missed.
-- The deprovision job queries organizations.chatwoot_account_id to clean up Chatwoot accounts.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "chatwoot_account_id" text;
