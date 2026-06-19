-- PMS Row-Level Security (RLS) — Tenant Isolation
--
-- Enables RLS on all 18 pms_* tables and installs tenant-isolation policies.
-- Policies enforce that every DML operation is scoped to the tenant identified
-- by the session-local variable app.current_tenant_id.
--
-- Defense-in-depth layers:
--   1. Application layer: all route handlers already filter by tenantId
--   2. This RLS layer: database-level enforcement for a non-privileged app user
--
-- For RLS to actively block queries the application must connect as a role
-- WITHOUT the SUPERUSER / BYPASSRLS privilege. The recommended role is
-- stockix_pms_app (created below). Production deployments should set:
--   PMS_DATABASE_URL=postgres://stockix_pms_app:<password>@host/db
--
-- Public routes (iCal export, guest forms) and the background sync job need
-- to bootstrap tenant context without an auth token. Three SECURITY DEFINER
-- functions bypass RLS for those narrow lookups.

-- ─── App role (no BYPASSRLS, owns nothing) ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stockix_pms_app') THEN
    CREATE ROLE stockix_pms_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END$$;

-- ─── Session-variable helper ─────────────────────────────────────────────────

-- Returns the current tenant UUID from the session variable, or NULL if unset.
CREATE OR REPLACE FUNCTION current_pms_tenant_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

-- ─── SECURITY DEFINER helpers for public / background routes ─────────────────
-- These functions run as their owner (postgres superuser) and are therefore
-- not subject to RLS (FORCE not used). They perform the minimal single-row
-- lookup needed to bootstrap tenant context before the caller sets
-- app.current_tenant_id and continues with normal tenant-scoped queries.

-- Resolve tenantId from an iCal export token (public /api/ical/:token route).
CREATE OR REPLACE FUNCTION pms_tenant_for_export_token(p_token text)
RETURNS uuid AS $$
  SELECT tenant_id FROM pms_ical_channels WHERE export_token = p_token LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Resolve tenantId from a guest-form share token (public /public/g/:token route).
CREATE OR REPLACE FUNCTION pms_tenant_for_share_token(p_token text)
RETURNS uuid AS $$
  SELECT tenant_id FROM pms_guest_form_submissions WHERE share_token = p_token LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Return all distinct tenant IDs that have at least one property (sync job).
CREATE OR REPLACE FUNCTION pms_all_tenant_ids()
RETURNS SETOF uuid AS $$
  SELECT DISTINCT tenant_id FROM pms_properties;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ─── Enable RLS on all pms_* tables ─────────────────────────────────────────

ALTER TABLE pms_properties                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_rooms                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_guests                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_bookings                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_payments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_ical_channels               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_calendar_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_sync_logs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_date_overrides              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_staff                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_cleaners                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_cleaner_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_cleaning_tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_property_managers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_property_manager_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_message_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_guest_form_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_guest_form_submissions      ENABLE ROW LEVEL SECURITY;

-- ─── Tenant isolation policies ───────────────────────────────────────────────
-- One permissive policy per table. Uses current_pms_tenant_id() so the policy
-- automatically applies to SELECT, INSERT, UPDATE, and DELETE.

CREATE POLICY pms_tenant_isolation ON pms_properties
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_rooms
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_guests
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_bookings
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_payments
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_ical_channels
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_calendar_events
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_sync_logs
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_date_overrides
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_staff
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_cleaners
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_cleaner_assignments
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_cleaning_tasks
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_property_managers
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_property_manager_invites
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_message_templates
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_guest_form_templates
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

CREATE POLICY pms_tenant_isolation ON pms_guest_form_submissions
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());

-- ─── Grant table access to app role ─────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON
  pms_properties, pms_rooms, pms_guests, pms_bookings, pms_payments,
  pms_ical_channels, pms_calendar_events, pms_sync_logs, pms_date_overrides,
  pms_staff, pms_cleaners, pms_cleaner_assignments, pms_cleaning_tasks,
  pms_property_managers, pms_property_manager_invites, pms_message_templates,
  pms_guest_form_templates, pms_guest_form_submissions
TO stockix_pms_app;

GRANT EXECUTE ON FUNCTION current_pms_tenant_id() TO stockix_pms_app;
GRANT EXECUTE ON FUNCTION pms_tenant_for_export_token(text) TO stockix_pms_app;
GRANT EXECUTE ON FUNCTION pms_tenant_for_share_token(text) TO stockix_pms_app;
GRANT EXECUTE ON FUNCTION pms_all_tenant_ids() TO stockix_pms_app;
