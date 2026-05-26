/** Default post-expiry grace period (days) for Stockix licenses and Finance sync. */
export const DEFAULT_GRACE_PERIOD_DAYS = 7;

/** Staff user cap when plan/license does not specify maxUsers. */
export const DEFAULT_MAX_USERS = 999;

/** Days before expiry when milestone warning emails/notifications fire. */
export const LICENSE_EXPIRY_MILESTONE_DAYS = [90, 60, 30, 15, 7, 3, 2, 1] as const;

function readDefaultLicenseTermDays(): number {
  const raw = process.env.DEFAULT_LICENSE_TERM_DAYS?.trim();
  const n = raw ? Number(raw) : 365;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 365;
}

/** Default term for auto-assigned licenses on provision (override via DEFAULT_LICENSE_TERM_DAYS). */
export const DEFAULT_LICENSE_TERM_DAYS = readDefaultLicenseTermDays();
