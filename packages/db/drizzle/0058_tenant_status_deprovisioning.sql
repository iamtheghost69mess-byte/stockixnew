-- Allow "deprovisioning" while tenant.deprovision worker job is in flight.
ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_status_check";
--> statement-breakpoint
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_status_check"
  CHECK ("status" IN ('provisioning', 'active', 'partial', 'failed', 'suspended', 'stopped', 'deprovisioning'));
