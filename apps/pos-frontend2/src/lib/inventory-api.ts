/**
 * Tenant inventory API — mirrors `pos-backend/routes/inventoryRoute.js` + `GET /api/locations`.
 * Auth: cookies and/or `Authorization: Bearer` via `posApiFetch`.
 */

import type { QueryClient } from "@tanstack/react-query";

import { type PosApiJson, posApiFetch, posApiJson } from "@/lib/pos-api-fetch";

export type IngredientLean = {
  _id: string;
  name?: string;
  unit?: string;
  sku?: string;
  status?: string;
  currentStock?: number;
  reorderThreshold?: number;
  safetyStockLevel?: number;
  leadTimeDays?: number;
};

/** Full ingredient row from `GET/POST/PUT /api/ingredients`. */
export type IngredientRecord = {
  _id: string;
  name?: string;
  unit?: string;
  sku?: string;
  status?: string;
  description?: string;
  category?: { _id: string; name?: string; sortOrder?: number } | string | null;
  imageUrl?: string;
  purchaseUnit?: string;
  purchaseToStockFactor?: number;
  currentStock?: number;
  reorderThreshold?: number;
  reorderQuantity?: number;
  supplier?: string;
  unitCost?: number;
  averageUnitCost?: number;
  lastPurchaseUnitCost?: number;
  safetyStockLevel?: number;
  leadTimeDays?: number;
  /** Forecasting + procurement planning (see `ingredientModel.js`). */
  minimumOrderQuantity?: number;
  maximumStockLevel?: number;
  shelfLifeDays?: number;
  packagingType?: string;
  tags?: string[];
  isAutoReorder?: boolean;
  isDropshipOnly?: boolean;
  isSerialTracked?: boolean;
  serialNumberFormat?: string;
  barcode?: string;
};

/** @deprecated Use `IngredientRecord`; kept for older references. */
export type IngredientListRow = IngredientRecord;

/** TanStack Query key for ingredient list (PO + ingredients pages). */
export const INGREDIENTS_QUERY_KEY = ["ingredients"] as const;

/** Prefix for inventory admin hub tabs (report, low-stock, balances, movements). Invalidate via `invalidateInventoryHubQueries`. */
export const INVENTORY_HUB_PREFIX = ["inventory"] as const;

export const INVENTORY_REPORT_QUERY_KEY = [...INVENTORY_HUB_PREFIX, "report"] as const;

export function inventoryLowStockQueryKey(page: number, limit: number) {
  return [...INVENTORY_HUB_PREFIX, "low-stock", { page, limit }] as const;
}

export function inventoryBalancesQueryKey(locationKey: string) {
  return [...INVENTORY_HUB_PREFIX, "balances", locationKey] as const;
}

export function inventoryMovementsQueryKey(parts: {
  page: number;
  limit: number;
  from: string;
  to: string;
  locationId: string;
}) {
  return [...INVENTORY_HUB_PREFIX, "movements", parts] as const;
}

export function invalidateInventoryHubQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: [...INVENTORY_HUB_PREFIX] });
}

export type InventoryLowStockResponse = PosApiJson<IngredientLean[]> & {
  page?: number;
  limit?: number;
  total?: number;
};

export type InventoryReportData = {
  ingredients: IngredientLean[];
  belowThreshold: IngredientLean[];
  portionsByDish: Array<{
    menuItemId: string;
    menuItemName?: string;
    estimatedPortions: number | null;
  }>;
};

export type StockBalanceRow = {
  _id: string;
  quantity?: number;
  reservedQty?: number;
  incomingQty?: number;
  maxStockLevel?: number;
  availableQty?: number;
  ingredient?: IngredientLean | null;
  location?: { _id: string; name?: string; code?: string } | null;
};

export type StockMovementRow = {
  _id: string;
  createdAt?: string;
  delta?: number;
  balanceAfter?: number;
  reason?: string;
  note?: string;
  ingredient?: { name?: string; unit?: string; sku?: string } | null;
  location?: { _id?: string; name?: string; code?: string } | null;
  user?: { name?: string } | null;
};

export type InventoryMovementsResponse = PosApiJson<StockMovementRow[]> & {
  page?: number;
  limit?: number;
  total?: number;
};

export type LocationRow = {
  _id: string;
  name?: string;
  code?: string;
  address?: string;
  waiterCanPrintReceipt?: boolean;
  vatRate?: number;
  vatInclusive?: boolean;
  kitchenWorkflowEnabled?: boolean;
  discountReasonRequired?: boolean;
};

/** Payload for create/update branch (matches `locationController` body). */
export type LocationWritePayload = {
  name: string;
  code?: string;
  address?: string;
  waiterCanPrintReceipt?: boolean;
  vatRate?: number;
  vatInclusive?: boolean;
  kitchenWorkflowEnabled?: boolean;
  discountReasonRequired?: boolean;
};

export type LocationReceiptConfig = {
  headerLine1: string;
  headerLine2: string;
  footerLine: string;
  showBranchName: boolean;
  showBranchAddress: boolean;
  showBranchPhone: boolean;
  showTaxVatNumber: boolean;
};

/** Top-level `Location` receipt fields (logo URL, rich header/footer block, VAT lines). */
export type LocationReceiptSurface = {
  receiptLogo: string;
  receiptHeader: string;
  receiptFooter: string;
  receiptShowVAT: boolean;
  receiptShowServiceCharge: boolean;
};

export type ReceiptConfigPayload = {
  locationId: string;
  locationName: string;
  locationCode: string;
  locationAddress: string;
  locationPhone: string;
  locationTaxVatNumber: string;
  receiptConfig: LocationReceiptConfig;
} & LocationReceiptSurface;

export type MenuAvailabilityRow = {
  menuItemId: string;
  name?: string;
  canFulfill: boolean;
  estimatedPortions?: number | null;
  reason?: string;
};

/** Matches `GET /api/inventory/pos-policy` (`inventoryController.posInventoryPolicy`). */
export type PosInventoryPolicy = {
  strictOversell: boolean;
  /** Always `payment` at runtime (deduct on paid orders). */
  stockDeductTrigger: "payment";
};

/** TanStack Query key — keep in sync with `PosRealtimeBridge` inventory invalidation. */
export const INVENTORY_POS_POLICY_QUERY_KEY = ["inventory-pos-policy"] as const;

/** Prefix invalidated on `inventory:updated` / `inventory:low-stock` in `PosRealtimeBridge`. */
export const MENU_INVENTORY_AVAILABILITY_QUERY_KEY = ["menu-inventory-availability"] as const;

export function menuInventoryAvailabilityQueryKey(locationKey: string) {
  return [...MENU_INVENTORY_AVAILABILITY_QUERY_KEY, locationKey || "__all__"] as const;
}

export type InventoryScanResponse =
  | {
      type: "ingredient";
      data?: {
        _id?: string;
        name?: string;
        sku?: string;
        balances?: Array<{ quantity?: number; location?: { name?: string } | null }>;
      };
    }
  | {
      type: "menu_item_variant";
      data?: {
        _id?: string;
        sku?: string;
        name?: string;
        menuItem?: { _id?: string; name?: string; price?: number } | string | null;
      };
    };

export async function fetchInventoryReport() {
  return posApiJson<InventoryReportData>("/api/inventory/report");
}

export async function fetchInventoryPosPolicy() {
  return posApiJson<PosInventoryPolicy>("/api/inventory/pos-policy");
}

/** When both `page` and `limit` are set, backend returns `{ data, page, limit, total }`. */
export async function fetchInventoryLowStock(params?: { page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<IngredientLean[]>(`/api/inventory/low-stock${suffix}`);
}

export async function fetchIngredients(params?: { status?: "active" | "archived"; categoryId?: string }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.categoryId) q.set("categoryId", params.categoryId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<IngredientRecord[]>(`/api/ingredients${suffix}`);
}

export async function createIngredient(body: Partial<IngredientRecord>) {
  return posApiJson<IngredientRecord>("/api/ingredients", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateIngredient(id: string, body: Partial<IngredientRecord>) {
  return posApiJson<IngredientRecord>(`/api/ingredients/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteIngredient(id: string) {
  return posApiJson<void>(`/api/ingredients/${id}`, {
    method: "DELETE",
  });
}

export async function fetchInventoryBalances(params?: { locationId?: string }) {
  const q = new URLSearchParams();
  if (params?.locationId) q.set("locationId", params.locationId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<StockBalanceRow[]>(`/api/inventory/balances${suffix}`);
}

export async function fetchInventoryMovements(params?: {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  locationId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.locationId) q.set("locationId", params.locationId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<StockMovementRow[]>(`/api/inventory/movements${suffix}`);
}

/** Fetches every page (limit 100) until done. Respects current filters; caps at `maxRows` (default 50k). */
export async function fetchAllInventoryMovements(params: {
  from?: string;
  to?: string;
  locationId?: string;
  maxRows?: number;
}): Promise<StockMovementRow[]> {
  const limit = 100;
  const maxRows = params.maxRows ?? 50_000;
  const all: StockMovementRow[] = [];
  let page = 1;
  while (all.length < maxRows) {
    const res = await fetchInventoryMovements({
      page,
      limit,
      from: params.from,
      to: params.to,
      locationId: params.locationId,
    });
    const chunk = Array.isArray(res.data) ? res.data : [];
    all.push(...chunk);
    const total = res.total;
    if (chunk.length < limit) break;
    if (total != null && all.length >= total) break;
    page += 1;
  }
  return all;
}

export async function fetchLocations() {
  return posApiJson<LocationRow[]>("/api/locations");
}

/**
 * Normalized branch list for React Query. Always use as `queryFn` for
 * `queryKey: ["locations"]` so the cached `data` is `LocationRow[]`, not the raw
 * `{ success, data }` envelope (mixing envelopes with arrays breaks `.map` on other pages).
 */
export async function fetchLocationsList(): Promise<LocationRow[]> {
  const res = await fetchLocations();
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * React Query `data` for `queryKey: ["locations"]` must be `LocationRow[]`, but persisted
 * cache from older code may still hold the raw `{ success, data: LocationRow[] }` envelope.
 */
export function normalizeLocationsQueryData(cached: unknown): LocationRow[] {
  if (Array.isArray(cached)) return cached as LocationRow[];
  if (cached && typeof cached === "object" && "data" in cached && Array.isArray((cached as { data: unknown }).data)) {
    return (cached as { data: LocationRow[] }).data;
  }
  return [];
}

export async function createLocation(data: LocationWritePayload) {
  return posApiJson<LocationRow>("/api/locations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateLocation(id: string, data: LocationWritePayload) {
  return posApiJson<LocationRow>(`/api/locations/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteLocation(id: string) {
  return posApiJson<void>(`/api/locations/${id}`, {
    method: "DELETE",
  });
}

export async function fetchReceiptConfig() {
  return posApiJson<ReceiptConfigPayload>("/api/locations/receipt-config");
}

export async function updateReceiptConfig(data: {
  receiptConfig?: Partial<LocationReceiptConfig>;
} & Partial<LocationReceiptSurface>) {
  return posApiJson<ReceiptConfigPayload>("/api/locations/receipt-config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export type InventoryAdjustParams = {
  ingredientId: string;
  quantityDelta: number;
  reason: "manual_adjust" | "waste" | "receive" | "correction";
  note?: string;
  locationId?: string;
  /** Per stock unit for positive non-receive increases (optional; defaults from ingredient costs). */
  adjustmentUnitCost?: number;
  qualityStatus?: "passed" | "damaged" | "expired" | "recalled";
};

export type WastageReason = "spoilage" | "accident" | "staff_meal" | "other";

export type WastageEntryRow = {
  _id: string;
  ingredient?: { _id?: string; name?: string; unit?: string; sku?: string } | null;
  location?: { _id?: string; name?: string; code?: string } | null;
  quantity: number;
  unit?: string;
  reason: WastageReason;
  notes?: string;
  createdBy?: { _id?: string; name?: string } | null;
  unitCostAtEntry?: number;
  totalCost?: number;
  createdAt?: string;
};

export type InventoryAdjustResult = {
  ingredientId: string;
  previousQty: number;
  newQty: number;
  delta: number;
  balanceAfter?: number;
};

export async function fetchWastageEntries(params?: {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  ingredientId?: string;
  reason?: WastageReason;
}) {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.ingredientId) q.set("ingredientId", params.ingredientId);
  if (params?.reason) q.set("reason", params.reason);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<WastageEntryRow[]>(`/api/inventory/wastage${suffix}`);
}

export async function createWastageEntry(body: {
  ingredientId: string;
  quantity: number;
  reason: WastageReason;
  notes?: string;
}) {
  return posApiJson<WastageEntryRow>("/api/inventory/wastage", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchWastageReport(params?: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<
    Array<{
      reason: WastageReason;
      totalQuantity: number;
      totalWasteCost: number;
      entryCount: number;
    }>
  >(`/api/inventory/wastage/report${suffix}`);
}

export function buildInventoryAdjustDedupeKey(data: InventoryAdjustParams): string {
  const loc = data.locationId ?? "";
  return `adjust:${data.ingredientId}:${loc}:${data.reason}:${data.quantityDelta}`;
}

export type InventoryAdjustDeliveryResult =
  | { mode: "sent"; result: InventoryAdjustResult }
  | { mode: "queued" };

export async function adjustInventoryWithOfflineSupport(
  data: InventoryAdjustParams,
): Promise<InventoryAdjustDeliveryResult> {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (online) {
    const res = await adjustInventory(data);
    return { mode: "sent", result: res.data as InventoryAdjustResult };
  }
  const { enqueueOfflineMutation } = await import("@/lib/offline-queue");
  await enqueueOfflineMutation(
    "inventory_adjust",
    data as Record<string, unknown>,
    buildInventoryAdjustDedupeKey(data),
  );
  return { mode: "queued" };
}

export async function adjustInventory(data: InventoryAdjustParams) {
  return posApiJson<InventoryAdjustResult>("/api/inventory/adjust", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type TransferInventoryResult = {
  transferGroupId?: string;
  totalStock?: number;
  fromBalance?: number;
  toBalance?: number;
};

export async function transferInventory(data: {
  fromLocationId: string;
  toLocationId: string;
  ingredientId: string;
  quantity: number;
  note?: string;
}) {
  return posApiJson<TransferInventoryResult>("/api/inventory/transfer", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function patchInventoryBalancePlanning(data: {
  locationId: string;
  ingredientId: string;
  reservedQty?: number;
  incomingQty?: number;
  maxStockLevel?: number;
}) {
  return posApiJson<StockBalanceRow>("/api/inventory/balances/planning", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchInventoryMenuAvailability(params?: { locationId?: string }) {
  const q = new URLSearchParams();
  if (params?.locationId) q.set("locationId", params.locationId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<{ locationId?: string | null; items?: MenuAvailabilityRow[] }>(
    `/api/inventory/menu-availability${suffix}`,
  );
}

export async function scanInventoryBarcode(barcode: string) {
  return posApiJson<InventoryScanResponse>(`/api/inventory/scan/${encodeURIComponent(barcode)}`);
}

/** Backend returns `{ success, type, data }` (type is **not** inside `data`). Use this for reliable branching. */
export type BarcodeVariantRaw = {
  _id?: string;
  sku?: string;
  name?: string;
  menuItem?: string | { _id: string; name?: string; price?: number } | null;
};

export type NormalizedBarcodeScan =
  | {
      kind: "ingredient";
      id: string;
      name?: string;
      sku?: string;
      balances?: Array<{ quantity?: number; location?: { name?: string } | null }>;
    }
  | { kind: "menu_item_variant"; raw: BarcodeVariantRaw | null };

export async function normalizeInventoryBarcodeScan(barcode: string): Promise<NormalizedBarcodeScan> {
  const res = await posApiFetch(`/api/inventory/scan/${encodeURIComponent(barcode)}`);
  let body: {
    success?: boolean;
    message?: string;
    type?: string;
    data?: Record<string, unknown> & {
      _id?: string;
      name?: string;
      sku?: string;
      balances?: unknown;
      menuItem?: unknown;
    };
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!res.ok) {
    const msg = (typeof body.message === "string" && body.message) || res.statusText || `Scan failed (${res.status})`;
    throw new Error(msg);
  }
  if (body.type === "ingredient" && body.data && body.data._id) {
    const d = body.data;
    const balances = Array.isArray(d.balances)
      ? (d.balances as Array<{ quantity?: number; location?: { name?: string } | null }>)
      : undefined;
    return {
      kind: "ingredient",
      id: String(d._id),
      name: typeof d.name === "string" ? d.name : undefined,
      sku: typeof d.sku === "string" ? d.sku : undefined,
      balances,
    };
  }
  if (body.type === "menu_item_variant") {
    const raw = body.data as BarcodeVariantRaw | null;
    return { kind: "menu_item_variant", raw };
  }
  throw new Error("Unrecognized barcode response.");
}

export async function postInventoryReturn(data: {
  ingredientId: string;
  quantity: number;
  locationId?: string;
  note?: string;
  unitCost?: number;
}) {
  return posApiJson<void>("/api/inventory/returns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type BootstrapBalancesResult = {
  migrated: number;
  defaultLocationId?: string;
  message?: string;
};

/** Idempotent: creates missing `StockBalance` rows at the org's first location from legacy ingredient totals. */
export async function postInventoryBootstrapBalances() {
  return posApiJson<BootstrapBalancesResult>("/api/inventory/bootstrap-balances", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type RunInventoryAlertsResult =
  | { skipped: true; reason: string }
  | { sent: false; empty: true }
  | { sent: true; lowStock: number; expiringLots: number };

/** Uses Accounting config (webhook + toggles). May skip if disabled or nothing to emit. */
export async function postInventoryRunAlerts() {
  return posApiJson<RunInventoryAlertsResult>("/api/inventory/alerts/run", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// --- Reports & analytics (`inventoryController` valuation / slow-moving / forecast / waste / price-history) ---

export type InventoryCostMethod = "weighted_average" | "fifo" | "lifo" | "standard";

export type ValuationReportRow = {
  ingredient: { _id: string; name?: string; sku?: string; unit?: string };
  location?: string | { _id?: string; name?: string };
  quantity: number;
  unitCost: number;
  value: number;
};

export type ValuationReportData = {
  grandTotal: number;
  rows: ValuationReportRow[];
  costMethod: InventoryCostMethod | string;
};

export const INVENTORY_VALUATION_QUERY_KEY = ["inventory-valuation"] as const;

export async function fetchValuationReport(params?: { locationId?: string; costMethod?: InventoryCostMethod }) {
  const q = new URLSearchParams();
  if (params?.locationId) q.set("locationId", params.locationId);
  if (params?.costMethod) q.set("costMethod", params.costMethod);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<ValuationReportData>(`/api/inventory/report/valuation${suffix}`);
}

export type SlowMovingReportRow = {
  ingredient: { _id: string; name?: string; sku?: string; unit?: string };
  currentStock: number;
  stockValue: number;
  lastMovementDate: string | null;
  daysSinceLastConsumption: number;
};

export const INVENTORY_SLOW_MOVING_QUERY_KEY = ["inventory-slow-moving"] as const;

export async function fetchSlowMovingReport(params?: { days?: number }) {
  const q = new URLSearchParams();
  if (params?.days != null) q.set("days", String(params.days));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<SlowMovingReportRow[]>(`/api/inventory/report/slow-moving${suffix}`);
}

export type ForecastReportRow = {
  ingredient: { _id: string; name?: string; unit?: string };
  currentStock: number;
  avgConsumption7d: number;
  avgConsumption30d: number;
  currentRate: number;
  daysToZero: number | null;
  projectedStockOutDate: string | null;
  reorderAlert: boolean;
};

export const INVENTORY_FORECAST_QUERY_KEY = ["inventory-forecast"] as const;

export async function fetchInventoryForecast() {
  return posApiJson<ForecastReportRow[]>("/api/inventory/forecast");
}

export type WasteAnalyticsRow = {
  ingredientId?: string;
  ingredient: { name?: string; unit?: string; sku?: string } | null;
  wasteReasonCode: string;
  quantityDelta: number;
  movementCount: number;
  costTotal: number;
};

export const INVENTORY_WASTE_QUERY_KEY = ["inventory-waste-analytics"] as const;

export async function fetchWasteAnalytics(params?: { from?: string; to?: string; locationId?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.locationId) q.set("locationId", params.locationId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<WasteAnalyticsRow[]>(`/api/inventory/analytics/waste${suffix}`);
}

export type PriceHistoryRow = {
  _id: string;
  createdAt?: string;
  unitPrice: number;
  source?: string;
  note?: string;
  ingredient?: { _id?: string; name?: string; unit?: string; sku?: string } | null;
};

export const INVENTORY_PRICE_HISTORY_QUERY_KEY = ["inventory-price-history"] as const;

export async function fetchIngredientPriceHistory(params?: { ingredientId?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.ingredientId) q.set("ingredientId", params.ingredientId);
  if (params?.limit != null) q.set("limit", String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<PriceHistoryRow[]>(`/api/inventory/analytics/price-history${suffix}`);
}
