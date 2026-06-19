-- Revoke DELETE permission on admin_audit_log from the application role.
-- Audit records must be immutable for regulatory compliance (GDPR, SOC 2).
-- Hard deletes are still possible via superuser for emergency situations only.
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'stockix_api_user'
  ) THEN
    REVOKE DELETE ON admin_audit_log FROM stockix_api_user;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'stockix_pms_app'
  ) THEN
    REVOKE DELETE ON admin_audit_log FROM stockix_pms_app;
  END IF;
END $$;
