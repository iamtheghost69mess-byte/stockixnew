/** Max attempts for `database_migration` (transient Docker/build issues). */
export const TENANT_MIGRATION_MAX_ATTEMPTS = 8;

export const TENANT_MIGRATION_RETRY_DELAY_MS = 3_000;

/** Wait for Stockix Finance `/api/ping` after stack is up. */
export const STOCKIX_FINANCE_HEALTH_TIMEOUT_MS = 180_000;

export const STOCKIX_FINANCE_HEALTH_POLL_MS = 2_000;
