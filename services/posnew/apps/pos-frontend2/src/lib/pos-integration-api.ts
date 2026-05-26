import { posApiJson } from "@/lib/pos-api-fetch";

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
  const res = await posApiJson<{ data: IntegrationSyncStatus }>("/api/integration/sync/status");
  return res.data;
}

export async function posFetchMappingCoverage(): Promise<MappingCoverage> {
  const res = await posApiJson<{ data: MappingCoverage }>("/api/integration/mapping-coverage");
  return res.data;
}

export async function posFetchIntegrationEvents(): Promise<IntegrationEventMeta[]> {
  const res = await posApiJson<{ data: IntegrationEventMeta[] }>("/api/integration/events");
  return res.data;
}

export async function posFetchIntegrationOutbox(params?: {
  limit?: number;
  status?: string;
}): Promise<OutboxRow[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await posApiJson<{ data: OutboxRow[] }>(`/api/integration/outbox${suffix}`);
  return res.data;
}

export async function posRetryOutboxRow(outboxId: string): Promise<void> {
  await posApiJson(`/api/integration/outbox/${outboxId}/retry`, { method: "POST" });
}

export async function posReplayFinanceSync(orderId: string): Promise<void> {
  await posApiJson(`/api/integration/sync/replay/${orderId}`, { method: "POST" });
}

export async function posFetchItemMappings(): Promise<ItemMappingRow[]> {
  const res = await posApiJson<{ data: ItemMappingRow[] }>("/api/integration/item-mappings");
  return res.data;
}

export async function posUpsertItemMapping(body: {
  posMenuItemId: string;
  bigcapitalItemId: number;
  bigcapitalItemName?: string;
}): Promise<ItemMappingRow> {
  const res = await posApiJson<{ data: ItemMappingRow }>("/api/integration/item-mappings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function posDeleteItemMapping(posMenuItemId: string): Promise<void> {
  await posApiJson(`/api/integration/item-mappings/${posMenuItemId}`, { method: "DELETE" });
}

export async function posFetchIngredientMappings(): Promise<IngredientMappingRow[]> {
  const res = await posApiJson<{ data: IngredientMappingRow[] }>(
    "/api/integration/ingredient-mappings"
  );
  return res.data;
}

export async function posUpsertIngredientMapping(body: {
  posIngredientId: string;
  bigcapitalItemId: number;
  bigcapitalItemName?: string;
}): Promise<IngredientMappingRow> {
  const res = await posApiJson<{ data: IngredientMappingRow }>(
    "/api/integration/ingredient-mappings",
    { method: "POST", body: JSON.stringify(body) }
  );
  return res.data;
}

export async function posDeleteIngredientMapping(posIngredientId: string): Promise<void> {
  await posApiJson(`/api/integration/ingredient-mappings/${posIngredientId}`, {
    method: "DELETE",
  });
}

export async function posFetchVendorMappings(): Promise<VendorMappingRow[]> {
  const res = await posApiJson<{ data: VendorMappingRow[] }>("/api/integration/vendor-mappings");
  return res.data;
}

export async function posUpsertVendorMapping(body: {
  posSupplierId: string;
  bigcapitalVendorId: number;
  bigcapitalVendorName?: string;
}): Promise<VendorMappingRow> {
  const res = await posApiJson<{ data: VendorMappingRow }>("/api/integration/vendor-mappings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function posDeleteVendorMapping(posSupplierId: string): Promise<void> {
  await posApiJson(`/api/integration/vendor-mappings/${posSupplierId}`, { method: "DELETE" });
}

export async function posTestFinanceConnection(): Promise<{ success: boolean; message?: string }> {
  return posApiJson("/api/integration/test-connection", { method: "POST" });
}
