import { posApiJson } from "./pos-api-fetch";

export const SERIALS_QUERY_KEY = ["serials"];

export interface SerialNumberRecord {
  _id: string;
  serial: string;
  ingredient: {
    _id: string;
    name: string;
    unit: string;
    sku: string;
  };
  status: "available" | "consumed" | "transferred" | "expired";
  location: {
    _id: string;
    name: string;
    code: string;
  } | null;
  bin: {
    _id: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SerialMovementRecord {
  _id: string;
  type: string;
  quantity: number;
  delta?: number;
  reason?: string;
  notes?: string;
  createdAt: string;
  location?: { _id: string; name: string } | null;
  counterLocation?: { _id: string; name: string } | null;
  user?: { name: string } | null;
}

export interface SerialHistoryResult {
  serial: SerialNumberRecord;
  movements: SerialMovementRecord[];
}

export async function fetchSerials(params?: {
  serial?: string;
  ingredientId?: string;
  status?: string;
  locationId?: string;
}) {
  const sp = new URLSearchParams();
  if (params?.serial) sp.set("serial", params.serial);
  if (params?.ingredientId) sp.set("ingredientId", params.ingredientId);
  if (params?.status) sp.set("status", params.status);
  if (params?.locationId) sp.set("locationId", params.locationId);

  return posApiJson<SerialNumberRecord[]>(`/api/serials?${sp.toString()}`);
}

export async function fetchSerialHistory(serial: string) {
  return posApiJson<SerialHistoryResult>(`/api/serials/${serial}/history`);
}

export interface RegisterSerialPayload {
  serial: string;
  ingredientId: string;
  locationId?: string;
  binId?: string;
  stockLot?: string;
}

export async function registerSerial(payload: RegisterSerialPayload) {
  return posApiJson<SerialNumberRecord>("/api/serials", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function consumeSerial(serial: string, body?: { reason?: string; locationId?: string }) {
  return posApiJson<SerialNumberRecord>(`/api/serials/${encodeURIComponent(serial)}/consume`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function transferSerial(serial: string, body: { toLocationId: string; toBinId?: string }) {
  return posApiJson<SerialNumberRecord>(`/api/serials/${encodeURIComponent(serial)}/transfer`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
