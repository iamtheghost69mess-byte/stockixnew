ALTER TABLE "owners"
ADD CONSTRAINT "owners_role_check"
CHECK ("role" IN ('super_admin', 'support_agent', 'billing_manager', 'read_only'));
