import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import { syncAllTenants } from "../lib/calendar-sync.js";
import { pmsConfig } from "@repo/config";

/**
 * Start the periodic iCal sync job.
 * Uses the production sync engine from calendar-sync.ts which handles:
 * - Multi-tenant scoping
 * - Feedback loop prevention (stockix-pms- UID prefix filtering)
 * - Historical booking preservation
 * - Failure tracking with 3-strike alerts
 * - Sync audit logging
 */
export function startIcalSyncJob(
  db: PostgresJsDatabase<typeof schema>,
  log: (message: string) => void = console.log,
): void {
  const intervalMs = pmsConfig.icalSyncIntervalMs;
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await syncAllTenants(db);
    } catch (err) {
      log(`[pms][ical-sync] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isRunning = false;
    }
  };

  void tick();  // fire immediately on startup
  setInterval(tick, intervalMs);
  log(`[pms] iCal sync scheduled every ${intervalMs / 60000} minutes`);
}
