#!/usr/bin/env bash
set -e

# ISSUE-015: PMS Database Migration Execution
# This script migrates all 19 PMS tables from the control-plane database to the isolated PMS database.
# Ensure the stockix_pms database exists before running.

SOURCE_DB_URL=${DATABASE_URL:-"postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform"}
TARGET_DB_URL=${PMS_DATABASE_URL:-"postgresql://postgres:postgres@127.0.0.1:54330/stockix_pms"}

echo "Dumping PMS tables from source database..."
pg_dump "$SOURCE_DB_URL" \
  -t pms_properties \
  -t pms_rooms \
  -t pms_guests \
  -t pms_bookings \
  -t pms_payments \
  -t pms_ical_channels \
  -t pms_cal_events \
  -t pms_sync_logs \
  -t pms_date_overrides \
  -t pms_staff \
  -t pms_cleaners \
  -t pms_cleaner_assignments \
  -t pms_cleaning_tasks \
  -t pms_property_managers \
  -t pms_pm_invites \
  -t pms_message_templates \
  -t pms_guest_form_templates \
  -t pms_guest_form_submissions \
  --data-only \
  --no-owner \
  --no-privileges \
  -f /tmp/pms_data_migration.sql

echo "Data dumped successfully."

echo "Applying data to isolated PMS database..."
# Note: The schema should be created beforehand via the pms-db drizzle migrations.
psql "$TARGET_DB_URL" -f /tmp/pms_data_migration.sql

echo "Data migration completed successfully!"
