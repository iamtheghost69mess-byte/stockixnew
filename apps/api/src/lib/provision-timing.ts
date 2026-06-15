/** Completed provision older than this is flagged as stuck in readiness reconciler. */
export const PROVISION_STUCK_AFTER_MS = 10 * 60 * 1000;

/** Interval between readiness reconciler ticks. */
export const RECONCILE_INTERVAL_MS = 30 * 1000;
