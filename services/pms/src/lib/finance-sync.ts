import { pmsBookings, tenantDeployments } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import { pmsConfig, apiConfig } from "@repo/config";

type Db = PostgresJsDatabase<typeof schema>;

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
        .set({ financeReceiptId: receiptId, accountingSyncStatus: "synced", updatedAt: new Date() })
        .where(and(eq(pmsBookings.id, booking.id), eq(pmsBookings.tenantId, booking.tenantId)));
    }

    return { receiptId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .update(pmsBookings)
      .set({ accountingSyncStatus: "failed", updatedAt: new Date() })
      .where(and(eq(pmsBookings.id, booking.id), eq(pmsBookings.tenantId, booking.tenantId)));
    return { receiptId: null, error };
  }
}
