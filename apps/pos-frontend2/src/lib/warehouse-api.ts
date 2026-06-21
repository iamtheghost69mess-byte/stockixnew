import { posApiJson } from "@/lib/pos-api-fetch";

export type WarehouseZone = {
  _id: string;
  location: string;
  name: string;
  description?: string;
  zoneType: "receiving" | "picking" | "bulk" | "shipping" | "staging" | "qc";
  status: "active" | "archived";
};

export type WarehouseBin = {
  _id: string;
  zone: string;
  name: string;
  description?: string;
  capacity?: number | null;
  status: "active" | "archived";
};

export const WAREHOUSE_ZONES_QUERY_KEY = ["warehouse", "zones"];
export const WAREHOUSE_BINS_QUERY_KEY = ["warehouse", "bins"];

export async function fetchWarehouseZones(params: { locationId?: string }) {
  const q = params.locationId ? `?locationId=${params.locationId}` : "";
  return posApiJson<WarehouseZone[]>(`/api/warehouse/zones${q}`);
}

export async function createWarehouseZone(data: Partial<WarehouseZone>) {
  const res = await posApiJson<WarehouseZone>("/api/warehouse/zones", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to create zone");
  return res.data;
}

export async function patchWarehouseZone(id: string, data: Partial<WarehouseZone>) {
  const res = await posApiJson<WarehouseZone>(`/api/warehouse/zones/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to update zone");
  return res.data;
}

export async function fetchWarehouseBins(params: { zoneId?: string }) {
  const q = params.zoneId ? `?zoneId=${params.zoneId}` : "";
  return posApiJson<WarehouseBin[]>(`/api/warehouse/bins${q}`);
}

export async function createWarehouseBin(data: Partial<WarehouseBin>) {
  const res = await posApiJson<WarehouseBin>("/api/warehouse/bins", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to create bin");
  return res.data;
}

export async function patchWarehouseBin(id: string, data: Partial<WarehouseBin>) {
  const res = await posApiJson<WarehouseBin>(`/api/warehouse/bins/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to update bin");
  return res.data;
}

// Aliases for legacy consumers (unwrapping data array)
export const fetchZones = async (locationId?: string) => {
  const res = await fetchWarehouseZones({ locationId });
  return Array.isArray(res.data) ? res.data : [];
};
export const createZone = createWarehouseZone;
export const updateZone = patchWarehouseZone;
export const fetchBins = async (zoneId?: string) => {
  const res = await fetchWarehouseBins({ zoneId });
  return Array.isArray(res.data) ? res.data : [];
};
export const createBin = createWarehouseBin;
export const updateBin = patchWarehouseBin;
