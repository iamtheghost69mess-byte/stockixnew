import { type PosApiJson, posApiJson } from "@/lib/pos-api-fetch";
import type { PosCartLine } from "@/stores/pos-order-store";
import { cartToReplaceLines } from "@/stores/pos-order-store";

/** Mirrors `accountingPostingFromOrder` in the POS backend (subset used by the UI). */
export type PosAccountingPostingLeg = {
  readonly status: string | null;
  readonly error?: string;
};

export type PosAccountingPosting = {
  readonly sale: PosAccountingPostingLeg;
  readonly cogs: PosAccountingPostingLeg;
};

export type PosOrderStatusApiResponse = PosApiJson<PosOrder> & {
  readonly accountingPosting?: PosAccountingPosting;
};

function postingLegFailureMessage(leg: PosAccountingPostingLeg, prefix: string, fallback: string): string | null {
  if (leg.status !== "failed") return null;
  const detail = leg.error?.trim() ?? "";
  return detail.length > 0 ? `${prefix}: ${detail}` : fallback;
}

/**
 * Human-readable lines for legs that failed to post (paid check still succeeded).
 */
export function describeAccountingPostingFailures(posting: PosAccountingPosting | undefined): readonly string[] {
  if (!posting) return [];
  const lines: string[] = [];
  const saleMsg = postingLegFailureMessage(
    posting.sale,
    "Sale was not posted to the books",
    "Sale was not posted to the books (see Accounting in Studio).",
  );
  if (saleMsg) lines.push(saleMsg);
  const cogsMsg = postingLegFailureMessage(
    posting.cogs,
    "COGS was not posted",
    "COGS was not posted (see Accounting in Studio).",
  );
  if (cogsMsg) lines.push(cogsMsg);
  return lines;
}

export type PosOrderLine = {
  _id?: string;
  menuItem: string | { _id: string; name: string; priceUsd?: number; priceLbp?: number };
  name: string;
  quantity: number;
  pricePerQuantity: number;
  price: number;
  note?: string;
  status?: "pending" | "served" | "void";
};

export type PosOrder = {
  _id: string;
  orderNumber?: number;
  orderStatus: "pending" | "paid" | "cancelled" | "void";
  table?: string | { _id: string; tableNo: number };
  customer?: string | null;
  customerDetails?: { name?: string; phone?: string; guests?: number };
  items: PosOrderLine[];
  bills: {
    total: number;
    tax: number;
    serviceChargeRate?: number;
    serviceChargeAmount?: number;
    totalWithTax: number;
  };
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
};

/** Response from POST /api/order/:id/print */
export type PosPrintOrderResponse = PosApiJson<PosOrder> & {
  readonly printing?: { stations: number; results: readonly unknown[] };
};

/** Minimal order shape from `GET /api/order` (paginated). */
export type PosOrderListItem = {
  _id: string;
  orderNumber?: number;
  orderStatus?: string;
  customer?: string | null;
  bills?: { total?: number; tax?: number; serviceChargeRate?: number; serviceChargeAmount?: number; totalWithTax?: number };
  createdAt?: string;
};

export type PosOrderListingResponse = {
  orders: PosOrderListItem[];
  page: number;
  limit: number;
  total: number;
};

export const ORDER_QUERY_KEYS = {
  all: ["orders"] as const,
  list: (params: { page?: number; limit?: number }) => ["orders", "list", params] as const,
  table: (tableId: string) => ["orders", "table", tableId] as const,
  detail: (id: string) => ["orders", "detail", id] as const,
};

export async function posListOrdersPage(params?: { page?: number; limit?: number }): Promise<PosOrderListingResponse> {
  const q = new URLSearchParams();
  const page = params?.page ?? 1;
  const limit = Math.min(params?.limit ?? 25, 100);
  q.set("page", String(page));
  q.set("limit", String(limit));

  const res = await posApiJson<PosOrderListItem[]>(`/api/order?${q}`);
  const orders = Array.isArray(res.data) ? res.data : [];

  return {
    orders,
    page: typeof res.page === "number" ? res.page : page,
    limit: typeof res.limit === "number" ? res.limit : limit,
    total: typeof res.total === "number" ? res.total : orders.length,
  };
}

export async function posGetOpenOrderForTable(tableId: string) {
  return posApiJson<PosOrder>(`/api/order/for-table/${tableId}`);
}

export async function posCreateOrder(body: {
  table: string;
  customerDetails?: { name?: string; phone?: string; guests?: number };
  items: Partial<PosOrderLine>[];
  orderStatus?: string;
  bills?: { total: number; tax: number; serviceChargeRate?: number; serviceChargeAmount?: number; totalWithTax: number };
}) {
  return posApiJson<PosOrder>("/api/order/", {
    method: "POST",
    body: JSON.stringify({
      customerDetails: body.customerDetails ?? {
        name: "Walk-in",
        phone: "-",
        guests: 1,
      },
      bills: body.bills ?? { total: 0, tax: 0, serviceChargeRate: 0, serviceChargeAmount: 0, totalWithTax: 0 },
      orderStatus: body.orderStatus ?? "pending",
      table: body.table,
      items: body.items,
    }),
  });
}

export async function posPatchOrderItems(
  orderId: string,
  cart: PosCartLine[],
  options?: { reason?: string },
) {
  return posApiJson<PosOrder>(`/api/order/${orderId}/items`, {
    method: "PATCH",
    body: JSON.stringify({
      replaceLines: cartToReplaceLines(cart),
      ...(options?.reason ? { reason: options.reason } : {}),
    }),
  });
}

export async function posPatchOrderReplaceLines(
  orderId: string,
  replaceLines: Partial<PosOrderLine>[],
  options?: { reason?: string },
) {
  return posApiJson<PosOrder>(`/api/order/${orderId}/items`, {
    method: "PATCH",
    body: JSON.stringify({
      replaceLines,
      ...(options?.reason ? { reason: options.reason } : {}),
    }),
  });
}

export async function posMarkOrderPaid(
  orderId: string,
  paymentMethod = "cash",
  options?: {
    paymentData?: { amountReceived?: number; reference?: string; note?: string };
    paymentSplits?: { methodKey: string; amount: number }[];
  },
): Promise<PosOrderStatusApiResponse> {
  const res = await posApiJson<PosOrder>(`/api/order/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      orderStatus: "paid",
      paymentMethod,
      ...(options?.paymentData ? { paymentData: options.paymentData } : {}),
      ...(options?.paymentSplits ? { paymentSplits: options.paymentSplits } : {}),
    }),
  });
  return res as PosOrderStatusApiResponse;
}

export async function posUpdateOrderStatus(
  orderId: string,
  orderStatus: string,
  paymentMethod?: string,
): Promise<PosOrderStatusApiResponse> {
  const res = await posApiJson<PosOrder>(`/api/order/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      orderStatus,
      ...(paymentMethod ? { paymentMethod } : {}),
    }),
  });
  return res as PosOrderStatusApiResponse;
}

export async function posPrintOrder(
  orderId: string,
  options: { type: "kitchen" | "receipt"; printerId?: string },
): Promise<PosPrintOrderResponse> {
  const body: Record<string, unknown> = { type: options.type };
  if (options.printerId) {
    body.printerId = options.printerId;
  }
  const res = await posApiJson<PosOrder>(`/api/order/${orderId}/print`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res as PosPrintOrderResponse;
}

export async function posDeleteOrder(orderId: string) {
  return posApiJson<{ message: string }>(`/api/order/${orderId}`, {
    method: "DELETE",
  });
}

export async function posApplyManualDiscount(
  orderId: string,
  body: {
    discountType: "percentage" | "fixed";
    discountValue: number;
    reason?: string;
    discountScope?: "bill" | "item";
    itemId?: string;
  },
) {
  return posApiJson<PosOrder>(`/api/order/${orderId}/manual-discount`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type PosSplitBill = {
  _id: string;
  order: string;
  method: "equal" | "by_item" | "custom";
  totalAmount: number;
  paidAmount: number;
  status: "pending" | "partial" | "paid";
  splits: Array<{
    _id: string;
    label: string;
    amount: number;
    paidAmount: number;
    status: "pending" | "partial" | "paid";
    orderItemIds?: string[];
  }>;
};

export async function posCreateSplitBill(body: {
  orderId: string;
  method: "equal" | "by_item" | "custom";
  splits: Array<{ label?: string; amount: number; orderItemIds?: string[] }>;
}) {
  return posApiJson<PosSplitBill>("/api/split-bills", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function posPaySplitBillSplit(
  splitBillId: string,
  splitEntryId: string,
  body: { amount: number; paymentMethod: string },
) {
  return posApiJson<PosSplitBill>(
    `/api/split-bills/${splitBillId}/splits/${splitEntryId}/pay`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}
