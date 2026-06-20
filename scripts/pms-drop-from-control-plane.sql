-- Run this ONLY after confirming PMS_DATABASE_URL is live and validated
-- (see docs/adr/ADR-002-pms-database-isolation.md Phase 3).
--
-- Execute against the CONTROL-PLANE database ($DATABASE_URL), NOT against the PMS database.
-- Minimum validation before running:
--   1. PMS service has been running against PMS_DATABASE_URL for ≥ 2 weeks.
--   2. Row counts in PMS_DATABASE_URL match those below at migration time.
--   3. iCal sync, booking creation, and guest APIs have been smoke-tested.

BEGIN;

DROP TABLE IF EXISTS pms_sync_logs;
DROP TABLE IF EXISTS pms_ical_channels;
DROP TABLE IF EXISTS pms_payments;
DROP TABLE IF EXISTS pms_guest_forms;
DROP TABLE IF EXISTS pms_message_templates;
DROP TABLE IF EXISTS pms_bookings;
DROP TABLE IF EXISTS pms_guests;
DROP TABLE IF EXISTS pms_staff;
DROP TABLE IF EXISTS pms_properties;

COMMIT;
