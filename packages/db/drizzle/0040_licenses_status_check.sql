ALTER TABLE "licenses"
  ADD CONSTRAINT "licenses_status_check"
  CHECK ("status" IN ('unassigned', 'active', 'expired', 'revoked', 'suspended'));
