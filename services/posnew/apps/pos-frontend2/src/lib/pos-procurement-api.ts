import { posApiJson } from "@/lib/pos-api-fetch";
import type { PosGoodsReceiptNote } from "@/lib/pos-grn-api";
import { getPosLocationScopeId } from "@/lib/pos-location-scope";

export type PosSupplier = {
  _id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  categoryId?: string | null;
  categoryName?: string;
  status?: "active" | "archived";
  createdAt?: string;
  active?: boolean;
};

export type PosPurchaseOrderItem = {
  ingredientId: string;
  name?: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
};

export type PosPurchaseOrder = {
  _id: string;
  publicNumber: string;
  supplierId: string;
  supplierName?: string;
  createdByName?: string;
  items: PosPurchaseOrderItem[];
  totalAmount: number;
  status: "draft" | "confirmed" | "partial" | "received" | "cancelled";
  expectedAt?: string;
  receivedAt?: string;
  createdAt: string;
  /** Extended procurement metadata (mirrors `purchaseOrderModel.js`). */
  isDropship?: boolean;
  customerOrder?: string | null;
  costCenter?: string;
  department?: string;
  rfqReference?: string;
  threeWayMatchStatus?: "pending" | "matched" | "mismatch" | "overridden";
};

type BackendPurchaseOrderLine = {
  _id?: string;
  ingredient?: string | { _id?: string; name?: string };
  quantityOrdered?: number;
  quantityReceived?: number;
  unitCost?: number;
};

type BackendPurchaseOrder = {
  _id: string;
  supplier?: string | { _id?: string; name?: string };
  status?: PosPurchaseOrder["status"];
  expectedAt?: string;
  receivedAt?: string;
  createdAt?: string;
  lines?: BackendPurchaseOrderLine[];
  isDropship?: boolean;
  customerOrder?: string | { _id?: string } | null;
  costCenter?: string;
  department?: string;
  rfqReference?: string;
  threeWayMatchStatus?: PosPurchaseOrder["threeWayMatchStatus"];
  createdBy?: { name?: string } | string | null;
  reference?: string;
};

function toUiPo(row: BackendPurchaseOrder): PosPurchaseOrder {
  const items = Array.isArray(row.lines)
    ? row.lines.map((line) => {
        const ingredient = line.ingredient;
        const ingredientId = typeof ingredient === "string" ? ingredient : String(ingredient?._id || "");
        const name = typeof ingredient === "object" ? ingredient?.name : undefined;
        const quantity = Number(line.quantityOrdered) || 0;
        const unitPrice = Number(line.unitCost) || 0;
        return {
          ingredientId,
          name,
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
        };
      })
    : [];
  const totalAmount = items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
  const supplierObj = row.supplier && typeof row.supplier === "object" ? row.supplier : null;
  const supplierId = typeof row.supplier === "string" ? row.supplier : String(supplierObj?._id || "");
  const customerOrderRaw = row.customerOrder;
  const customerOrderId =
    typeof customerOrderRaw === "string"
      ? customerOrderRaw
      : customerOrderRaw && typeof customerOrderRaw === "object"
        ? String(customerOrderRaw._id ?? "")
        : null;
  return {
    _id: String(row._id),
    publicNumber: row.reference && String(row.reference).trim() ? String(row.reference) : `PO-${String(row._id).slice(-6).toUpperCase()}`,
    supplierId,
    supplierName: supplierObj?.name,
    createdByName: row.createdBy && typeof row.createdBy === "object" ? row.createdBy.name || "—" : "—",
    items,
    totalAmount,
    status: row.status || "draft",
    expectedAt: row.expectedAt,
    receivedAt: row.receivedAt,
    createdAt: row.createdAt || new Date().toISOString(),
    isDropship: !!row.isDropship,
    customerOrder: customerOrderId || null,
    costCenter: row.costCenter ?? "",
    department: row.department ?? "",
    rfqReference: row.rfqReference ?? "",
    threeWayMatchStatus: row.threeWayMatchStatus ?? "pending",
  };
}

function requireLocationScopeId() {
  const locationId = getPosLocationScopeId();
  if (!locationId) {
    throw new Error("Please select a location scope before creating purchase orders.");
  }
  return locationId;
}

// -- Suppliers --

export type PosSupplierQuery = {
  page?: number;
  limit?: number;
  q?: string;
  sortBy?: "name" | "createdAt" | "status";
  sortDir?: "asc" | "desc";
};

function normalizePosSupplierFetchArg(raw: unknown): PosSupplierQuery {
  if (raw == null || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.queryKey) && o.signal instanceof AbortSignal) return {};
  return raw as PosSupplierQuery;
}

export async function posFetchSuppliers(query: unknown = {}) {
  const q = normalizePosSupplierFetchArg(query);
  const params = new URLSearchParams();
  if (q.page) params.set("page", String(q.page));
  if (q.limit) params.set("limit", String(q.limit));
  if (q.q) params.set("q", q.q);
  if (q.sortBy) params.set("sortBy", q.sortBy);
  if (q.sortDir) params.set("sortDir", q.sortDir);
  const search = params.toString();
  const res = await posApiJson<{
    data: PosSupplier[];
    total?: number;
    page?: number;
    limit?: number;
  } | PosSupplier[]>(`/api/suppliers${search ? `?${search}` : ""}`);
  const payload = res.data;
  if (Array.isArray(payload)) return { data: payload, total: payload.length };
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    total: Number(payload?.total) || 0,
    page: Number(payload?.page) || 1,
    limit: Number(payload?.limit) || q.limit || 20,
  };
}

export async function posCreateSupplier(data: Partial<PosSupplier>) {
  return posApiJson<PosSupplier>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function posUpdateSupplier(id: string, data: Partial<PosSupplier>) {
  return posApiJson<PosSupplier>(`/api/suppliers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function posDeleteSupplier(id: string) {
  return posApiJson<void>(`/api/suppliers/${id}`, {
    method: "DELETE",
  });
}

// -- Purchase Orders --

export type PosPurchaseOrderQuery = {
  page?: number;
  limit?: number;
  q?: string;
  sortBy?: "createdAt" | "status" | "reference";
  sortDir?: "asc" | "desc";
};

/** TanStack Query invokes `queryFn` with a context object; strip it so list params stay valid. */
function normalizePosPurchaseOrderFetchArg(raw: unknown): PosPurchaseOrderQuery {
  if (raw == null || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.queryKey) && o.signal instanceof AbortSignal) return {};
  return raw as PosPurchaseOrderQuery;
}

export type PosPurchaseOrderListResult = {
  readonly data: PosPurchaseOrder[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};

/**
 * Normalizes React Query `data` from {@link posFetchPurchaseOrders} (or legacy shapes)
 * so callers always get a PO array.
 */
export function posPurchaseOrderRowsFromListQuery(result: unknown): PosPurchaseOrder[] {
  if (result == null) return [];
  if (Array.isArray(result)) return result as PosPurchaseOrder[];
  if (typeof result !== "object") return [];
  const inner = (result as { data?: unknown }).data;
  return Array.isArray(inner) ? (inner as PosPurchaseOrder[]) : [];
}

export async function posFetchPurchaseOrders(query: unknown = {}): Promise<PosPurchaseOrderListResult> {
  const q = normalizePosPurchaseOrderFetchArg(query);
  const params = new URLSearchParams();
  if (q.page) params.set("page", String(q.page));
  if (q.limit) params.set("limit", String(q.limit));
  if (q.q) params.set("q", q.q);
  if (q.sortBy) params.set("sortBy", q.sortBy);
  if (q.sortDir) params.set("sortDir", q.sortDir);
  const search = params.toString();
  const res = await posApiJson<{
    data: BackendPurchaseOrder[];
    total?: number;
    page?: number;
    limit?: number;
  } | BackendPurchaseOrder[]>(`/api/purchase-orders${search ? `?${search}` : ""}`);
  const payload = res.data;
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return {
    data: rows.map(toUiPo),
    total: Array.isArray(payload) ? rows.length : Number(payload?.total) || 0,
    page: Array.isArray(payload) ? 1 : Number(payload?.page) || 1,
    limit: Array.isArray(payload) ? rows.length : Number(payload?.limit) || q.limit || 20,
  };
}

export async function posCreatePurchaseOrder(data: Partial<PosPurchaseOrder>) {
  const location = requireLocationScopeId();
  const payload: Record<string, unknown> = {
    supplier: data.supplierId,
    location,
    expectedAt: data.expectedAt,
    lines: Array.isArray(data.items)
      ? data.items.map((item) => ({
          ingredient: item.ingredientId,
          quantityOrdered: Number(item.quantity) || 0,
          unitCost: Number(item.unitPrice) || 0,
        }))
      : [],
    isDropship: !!data.isDropship,
    costCenter: typeof data.costCenter === "string" ? data.costCenter.trim() : "",
    department: typeof data.department === "string" ? data.department.trim() : "",
    rfqReference: typeof data.rfqReference === "string" ? data.rfqReference.trim() : "",
  };
  if (data.customerOrder && typeof data.customerOrder === "string" && /^[a-fA-F0-9]{24}$/.test(data.customerOrder)) {
    payload.customerOrder = data.customerOrder;
  }
  const res = await posApiJson<BackendPurchaseOrder>("/api/purchase-orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ...res, data: res.data ? toUiPo(res.data) : undefined };
}

export async function posUpdatePurchaseOrder(id: string, data: Partial<PosPurchaseOrder>) {
  const payload = {
    expectedAt: data.expectedAt,
    lines: Array.isArray(data.items)
      ? data.items.map((item) => ({
          ingredient: item.ingredientId,
          quantityOrdered: Number(item.quantity) || 0,
          unitCost: Number(item.unitPrice) || 0,
        }))
      : undefined,
  };
  const res = await posApiJson<BackendPurchaseOrder>(`/api/purchase-orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return { ...res, data: res.data ? toUiPo(res.data) : undefined };
}

export async function posReceivePurchaseOrder(id: string) {
  return posApiJson<PosGoodsReceiptNote>(`/api/purchase-orders/${id}/receive`, {
    method: "POST",
  });
}

// -- RFQs --

export type PosRFQLine = {
  ingredientId: string;
  name?: string;
  quantity: number;
  description?: string;
};

export type PosRFQResponse = {
  _id: string;
  supplier: string | { _id: string; name: string };
  unitCost?: number;
  lineCosts?: { rfqLineId: string; unitCost: number }[];
  availableDate?: string;
  notes?: string;
  isSelected?: boolean;
};

export type PosRFQ = {
  _id: string;
  reference?: string;
  suppliers: string[] | { _id: string; name: string }[];
  status: "draft" | "sent" | "received" | "converted" | "cancelled";
  expectedAt?: string;
  notes?: string;
  lines: PosRFQLine[];
  responses: PosRFQResponse[];
  convertedToPurchaseOrder?: string;
  createdAt?: string;
};

export async function posFetchRFQs(status?: string) {
  const q = status ? `?status=${status}` : "";
  const res = await posApiJson<PosRFQ[]>(`/api/request-for-quotations${q}`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posFetchRFQ(id: string) {
  return posApiJson<PosRFQ>(`/api/request-for-quotations/${id}`);
}

export async function posCreateRFQ(data: Partial<PosRFQ>) {
  const linesPayload =
    Array.isArray(data.lines) && data.lines.length > 0
      ? data.lines.map((line) => {
          const row = line as PosRFQLine & { ingredient?: string };
          const ingredient = typeof row.ingredient === "string" && row.ingredient.trim() ? row.ingredient : row.ingredientId;
          return {
            ingredient,
            quantity: Number(row.quantity) || 0,
            description: row.description ?? "",
          };
        })
      : undefined;
  return posApiJson<PosRFQ>("/api/request-for-quotations", {
    method: "POST",
    body: JSON.stringify({ ...data, lines: linesPayload }),
  });
}

export async function posSendRFQ(id: string) {
  return posApiJson<PosRFQ>(`/api/request-for-quotations/${id}/send`, {
    method: "POST",
  });
}

export async function posAddRFQResponse(id: string, data: Partial<PosRFQResponse>) {
  return posApiJson<PosRFQ>(`/api/request-for-quotations/${id}/responses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function posConvertRFQToPO(id: string, responseId: string, locationId: string) {
  return posApiJson<PosPurchaseOrder>(`/api/request-for-quotations/${id}/convert-to-po`, {
    method: "POST",
    body: JSON.stringify({ responseId, locationId }),
  });
}
