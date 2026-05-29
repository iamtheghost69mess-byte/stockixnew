import { posApiJson, type PosApiJson } from "@/lib/pos-api-fetch";

function requireApiData<T>(res: PosApiJson<T>, label: string): T {
  if (res.data === undefined) {
    throw new Error(res.message ?? `${label} response missing data`);
  }
  return res.data;
}

export type IntegrationSyncStatus = {
  enabled: boolean;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  syncStatus?: string;
  queue?: { waiting: number; failed: number; active: number };
  queueAvailable?: boolean;
};

export type MappingCoverage = {
  integrationEnabled: boolean;
  financeTenantId: number | null;
  bridgeReady: boolean;
  sales: {
    sellableMenuItemCount: number;
    mappedMenuItemCount: number;
    unmappedMenuItems: { id: string; name: string }[];
    ready: boolean;
  };
  inventory: {
    ingredientCount: number;
    mappedIngredientCount: number;
    unmappedIngredients: { id: string; name: string }[];
    supplierCount: number;
    mappedSupplierCount: number;
    unmappedSuppliers: { id: string; name: string }[];
    defaultVendorId: number | null;
    ready: boolean;
  };
};

export type IntegrationEventMeta = {
  eventType: string;
  domain: string;
  jobName: string;
  resourceLabel: string;
  description: string;
};

export type OutboxRow = {
  _id: string;
  eventType: string;
  status: string;
  originatedBy?: string;
  orderId?: string;
  idempotencyKey?: string;
  lastError?: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
};

export type ItemMappingRow = {
  _id: string;
  posMenuItemId: string | { _id: string; name?: string };
  bigcapitalItemId: number;
  bigcapitalItemName?: string;
};

export type IngredientMappingRow = {
  _id: string;
  posIngredientId: string | { _id: string; name?: string; sku?: string };
  bigcapitalItemId: number;
  bigcapitalItemName?: string;
};

export type VendorMappingRow = {
  _id: string;
  posSupplierId: string | { _id: string; name?: string; code?: string };
  bigcapitalVendorId: number;
  bigcapitalVendorName?: string;
};

export async function posFetchIntegrationSyncStatus(): Promise<IntegrationSyncStatus> {
  const res = await posApiJson<IntegrationSyncStatus>("/api/integration/sync/status");
  return requireApiData(res, "Integration sync status");
}

export async function posFetchMappingCoverage(): Promise<MappingCoverage> {
  const res = await posApiJson<MappingCoverage>("/api/integration/mapping-coverage");
  return requireApiData(res, "Mapping coverage");
}

export async function posFetchIntegrationEvents(): Promise<IntegrationEventMeta[]> {
  const res = await posApiJson<IntegrationEventMeta[]>("/api/integration/events");
  return requireApiData(res, "Integration events");
}

export async function posFetchIntegrationOutbox(params?: {
  limit?: number;
  status?: string;
}): Promise<OutboxRow[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await posApiJson<OutboxRow[]>(`/api/integration/outbox${suffix}`);
  return requireApiData(res, "Integration outbox");
}

export async function posRetryOutboxRow(outboxId: string): Promise<void> {
  await posApiJson(`/api/integration/outbox/${outboxId}/retry`, { method: "POST" });
}

export async function posReplayFinanceSync(orderId: string): Promise<void> {
  await posApiJson(`/api/integration/sync/replay/${orderId}`, { method: "POST" });
}

export async function posFetchItemMappings(): Promise<ItemMappingRow[]> {
  const res = await posApiJson<ItemMappingRow[]>("/api/integration/item-mappings");
  return requireApiData(res, "Item mappings");
}

export async function posUpsertItemMapping(body: {
  posMenuItemId: string;
  bigcapitalItemId: number;
  bigcapitalItemName?: string;
}): Promise<ItemMappingRow> {
  const res = await posApiJson<ItemMappingRow>("/api/integration/item-mappings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return requireApiData(res, "Item mapping");
}

export async function posDeleteItemMapping(posMenuItemId: string): Promise<void> {
  await posApiJson(`/api/integration/item-mappings/${posMenuItemId}`, { method: "DELETE" });
}

export async function posFetchIngredientMappings(): Promise<IngredientMappingRow[]> {
  const res = await posApiJson<IngredientMappingRow[]>("/api/integration/ingredient-mappings");
  return requireApiData(res, "Ingredient mappings");
}

export async function posUpsertIngredientMapping(body: {
  posIngredientId: string;
  bigcapitalItemId: number;
  bigcapitalItemName?: string;
}): Promise<IngredientMappingRow> {
  const res = await posApiJson<IngredientMappingRow>("/api/integration/ingredient-mappings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return requireApiData(res, "Ingredient mapping");
}

export async function posDeleteIngredientMapping(posIngredientId: string): Promise<void> {
  await posApiJson(`/api/integration/ingredient-mappings/${posIngredientId}`, {
    method: "DELETE",
  });
}

export async function posFetchVendorMappings(): Promise<VendorMappingRow[]> {
  const res = await posApiJson<VendorMappingRow[]>("/api/integration/vendor-mappings");
  return requireApiData(res, "Vendor mappings");
}

export async function posUpsertVendorMapping(body: {
  posSupplierId: string;
  bigcapitalVendorId: number;
  bigcapitalVendorName?: string;
}): Promise<VendorMappingRow> {
  const res = await posApiJson<VendorMappingRow>("/api/integration/vendor-mappings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return requireApiData(res, "Vendor mapping");
}

export async function posDeleteVendorMapping(posSupplierId: string): Promise<void> {
  await posApiJson(`/api/integration/vendor-mappings/${posSupplierId}`, { method: "DELETE" });
}

export async function posTestFinanceConnection(): Promise<{ success: boolean; message?: string }> {
  const res = await posApiJson<unknown>("/api/integration/test-connection", { method: "POST" });
  return {
    success: res.success ?? false,
    message: res.message,
  };
}
