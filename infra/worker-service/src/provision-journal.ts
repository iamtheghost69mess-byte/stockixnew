import { tenantProvisionEvents } from "@repo/db/schema";
import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as dbSchema from "@repo/db/schema";

export type ProvisionJournalState = {
  completedOps: Set<string>;
  financeTenantId?: number;
  financeOrganizationId?: string;
  financeDefaultWarehouseId?: number;
  walkInCustomerId?: number;
  cashAccountId?: number;
  cardAccountId?: number;
  serviceChargeItemId?: number;
  discountItemId?: number;
};

function readPositiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Loads journaled provision ops and numeric ids stored in journal meta (for resume). */
export async function loadProvisionJournalState(
  db: PostgresJsDatabase<typeof dbSchema>,
  correlationId: string,
): Promise<ProvisionJournalState> {
  const rows = await db
    .select({
      phase: tenantProvisionEvents.phase,
      meta: tenantProvisionEvents.meta,
    })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .orderBy(asc(tenantProvisionEvents.createdAt))
    .limit(2000);

  const completedOps = new Set<string>();
  const state: ProvisionJournalState = { completedOps };

  for (const row of rows) {
    if (row.phase !== "journal") continue;
    const meta =
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : undefined;
    const key = readNonEmptyString(meta?.operationKey);
    if (key) completedOps.add(key);

    const financeTenantId = readPositiveInt(meta?.financeTenantId);
    if (financeTenantId) state.financeTenantId = financeTenantId;

    const financeOrganizationId = readNonEmptyString(meta?.financeOrganizationId);
    if (financeOrganizationId) state.financeOrganizationId = financeOrganizationId;

    const warehouseId = readPositiveInt(meta?.primaryWarehouseId ?? meta?.financeDefaultWarehouseId);
    if (warehouseId) state.financeDefaultWarehouseId = warehouseId;

    const walkIn = readPositiveInt(meta?.walkInCustomerId);
    if (walkIn) state.walkInCustomerId = walkIn;

    const cash = readPositiveInt(meta?.cashAccountId);
    if (cash) state.cashAccountId = cash;

    const card = readPositiveInt(meta?.cardAccountId);
    if (card) state.cardAccountId = card;

    const serviceCharge = readPositiveInt(meta?.serviceChargeItemId);
    if (serviceCharge) state.serviceChargeItemId = serviceCharge;

    const discount = readPositiveInt(meta?.discountItemId);
    if (discount) state.discountItemId = discount;
  }

  return state;
}
