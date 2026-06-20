import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as pmsSchema from "@repo/pms-db/schema";
import { pmsBookings } from "@repo/pms-db/schema";
import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  syncBookingToFinance,
  markBookingSyncError,
  MAX_SYNC_ATTEMPTS,
} from "../lib/finance-sync.js";

type Db = PostgresJsDatabase<typeof pmsSchema>;

const SYNC_INTERVAL_MS = parseInt(process.env.PMS_FINANCE_SYNC_INTERVAL_MS ?? "900000", 10); // 15 min

async function runSync(db: Db, log: (m: string) => void): Promise<void> {
  const today = new Date().toISOString().split("T")[0] ?? "";

  // Fetch bookings that need sync: pending or failed-and-retryable, already checked out
  const bookings = await db
    .select({
      id: pmsBookings.id,
      tenantId: pmsBookings.tenantId,
      roomId: pmsBookings.roomId,
      guestId: pmsBookings.guestId,
      checkIn: pmsBookings.checkIn,
      checkOut: pmsBookings.checkOut,
      totalAmountCents: pmsBookings.totalAmountCents,
      platform: pmsBookings.platform,
      financeReceiptId: pmsBookings.financeReceiptId,
      syncAttempts: pmsBookings.syncAttempts,
    })
    .from(pmsBookings)
    .where(
      and(
        isNull(pmsBookings.deletedAt),
        or(
          eq(pmsBookings.accountingSyncStatus, "pending"),
          and(
            eq(pmsBookings.accountingSyncStatus, "failed"),
            lt(pmsBookings.syncAttempts, MAX_SYNC_ATTEMPTS),
          ),
        ),
        lte(pmsBookings.checkOut, today),
      ),
    )
    .limit(200);

  if (bookings.length === 0) return;
  log(`[finance-sync] processing ${bookings.length} booking(s)`);

  for (const booking of bookings) {
    const { receiptId, error } = await syncBookingToFinance(db, {
      id: booking.id,
      tenantId: booking.tenantId,
      roomId: booking.roomId,
      guestId: booking.guestId,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalAmountCents: booking.totalAmountCents,
      platform: booking.platform,
      financeReceiptId: booking.financeReceiptId ?? null,
    });

    if (receiptId) {
      log(`[finance-sync] booking=${booking.id} synced → receipt=${receiptId}`);
    } else {
      const nextAttempts = (booking.syncAttempts ?? 0) + 1;
      if (nextAttempts >= MAX_SYNC_ATTEMPTS) {
        await markBookingSyncError(db, booking.id, booking.tenantId);
        log(`[finance-sync][error] booking=${booking.id} permanently failed after ${nextAttempts} attempts: ${error}`);
      } else {
        log(`[finance-sync][warn] booking=${booking.id} attempt ${nextAttempts} failed: ${error}`);
      }
    }
  }
}

export function startFinanceSyncJob(
  db: Db,
  log: (message: string) => void = console.log,
): void {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await runSync(db, log);
    } catch (err) {
      log(`[finance-sync] tick error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isRunning = false;
    }
  };

  void tick();
  setInterval(tick, SYNC_INTERVAL_MS);
  log(`[pms] Finance sync scheduled every ${SYNC_INTERVAL_MS / 60000} minutes`);
}
