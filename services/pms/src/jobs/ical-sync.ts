import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import { runIcalSyncAllTenants } from "../ical/sync.js";

const SYNC_INTERVAL_MS = 10 * 60 * 1000;

export function startIcalSyncJob(
  db: PostgresJsDatabase<typeof schema>,
  log: (message: string) => void = console.log,
): void {
  const tick = () => {
    void runIcalSyncAllTenants(db).catch((err) => {
      log(`[pms][ical-sync] ${err instanceof Error ? err.message : String(err)}`);
    });
  };
  setInterval(tick, SYNC_INTERVAL_MS);
  log(`[pms] iCal sync scheduled every ${SYNC_INTERVAL_MS / 60000} minutes`);
}
