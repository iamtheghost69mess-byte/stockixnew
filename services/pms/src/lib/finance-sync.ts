import { tenantDeployments } from "@repo/db/schema";
import { pmsBookings } from "@repo/pms-db/schema";
import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as pmsSchema from "@repo/pms-db/schema";
import { pmsConfig, apiConfig } from "@repo/config";

const MAX_SYNC_ATTEMPTS = 3;

type Db = PostgresJsDatabase<typeof pmsSchema>;

interface BookingRow {
  id: string;
  tenantId: string;
  roomId: string;
  guestId: string;
  checkIn: string;
  checkOut: string;
  totalAmountCents: number;
  platform: string;
  financeReceiptId: number | null;
}

/**
 * Sync a confirmed PMS booking to Finance as a SaleReceipt.
 * Mirrors the POS→Finance bridge pattern: idempotent on referenceNo.
 */
export async function syncBookingToFinance(
  db: Db,
  booking: BookingRow,
): Promise<{ receiptId: number | null; error?: string }> {
  // Find the Finance tenant endpoint from tenantDeployments
  const [deployment] = await db
    .select({
      financeTenantId: tenantDeployments.financeTenantId,
      financeCashAccountId: tenantDeployments.financeCashAccountId,
      financeCardAccountId: tenantDeployments.financeCardAccountId,
      financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
    })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, booking.tenantId))
    .limit(1);

  if (!deployment?.financeTenantId) {
    return { receiptId: null, error: "finance_not_provisioned" };
  }

  const financeBaseUrl = pmsConfig.financeInternalBaseUrl;

  const nights = Math.max(
    1,
    Math.round(
      (new Date(`${booking.checkOut}T12:00:00Z`).getTime() -
        new Date(`${booking.checkIn}T12:00:00Z`).getTime()) /
        86_400_000,
    ),
  );

  const payload = {
    referenceNo: `PMS-${booking.id}`,
    date: booking.checkOut,
    customerId: deployment.financeWalkInCustomerId,
    exchangeRate: 1,
    closed: true,
    entries: [
      {
        itemId: null,
        description: `Room stay ${booking.checkIn} → ${booking.checkOut}`,
        quantity: nights,
        rate: Math.round(booking.totalAmountCents / nights),
        total: booking.totalAmountCents,
      },
    ],
    depositAccountId: deployment.financeCashAccountId,
  };

  try {
    const res = await fetch(
      `${financeBaseUrl}/api/internal/pos/receipts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-stockix-internal-secret": apiConfig.platformApiSecret ?? "",
          "x-stockix-tenant-id": booking.tenantId,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const data = (await res.json()) as { id?: number; message?: string };

    if (!res.ok && res.status !== 409) {
      return { receiptId: null, error: data.message ?? `HTTP ${res.status}` };
    }

    const receiptId = data.id ?? null;

    if (receiptId) {
      await db
        .update(pmsBookings)
        .set({
          financeReceiptId: receiptId,
          accountingSyncStatus: "synced",
          syncAttempts: sql`sync_attempts + 1`,
          syncError: null,
          syncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(pmsBookings.id, booking.id), eq(pmsBookings.tenantId, booking.tenantId)));
    }

    return { receiptId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const attempts = sql`sync_attempts + 1`;
    const nextStatus = `failed`;
    await db
      .update(pmsBookings)
      .set({
        accountingSyncStatus: nextStatus,
        syncAttempts: attempts,
        syncError: error.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(and(eq(pmsBookings.id, booking.id), eq(pmsBookings.tenantId, booking.tenantId)));
    return { receiptId: null, error };
  }
}

/**
 * Fetch all bookings that need Finance sync for a given tenantId.
 * Includes: pending bookings + failed bookings with < MAX_SYNC_ATTEMPTS retries.
 */
export async function fetchBookingsPendingSync(
  db: Db,
  tenantId: string,
  limit = 50,
): Promise<BookingRow[]> {
  return db
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
    })
    .from(pmsBookings)
    .where(
      and(
        eq(pmsBookings.tenantId, tenantId),
        isNull(pmsBookings.deletedAt),
        or(
          eq(pmsBookings.accountingSyncStatus, "pending"),
          and(
            eq(pmsBookings.accountingSyncStatus, "failed"),
            lt(pmsBookings.syncAttempts, MAX_SYNC_ATTEMPTS),
          ),
        ),
        // Only sync bookings that have checked out
        lte(pmsBookings.checkOut, new Date().toISOString().split("T")[0] ?? ""),
      ),
    )
    .limit(limit) as unknown as BookingRow[];
}

/**
 * Mark a booking as permanently errored after MAX_SYNC_ATTEMPTS failures.
 */
export async function markBookingSyncError(db: Db, bookingId: string, tenantId: string): Promise<void> {
  await db
    .update(pmsBookings)
    .set({ accountingSyncStatus: "error", updatedAt: new Date() })
    .where(and(eq(pmsBookings.id, bookingId), eq(pmsBookings.tenantId, tenantId)));
}

export { MAX_SYNC_ATTEMPTS };
