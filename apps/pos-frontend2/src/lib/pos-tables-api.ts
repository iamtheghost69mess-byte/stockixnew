import { sanitizePosApiErrorMessage } from "@/lib/format-pos-api-error";
import { posApiFetch, posApiJson } from "@/lib/pos-api-fetch";

type PosTableIdSource = {
  _id?: unknown;
  id?: unknown;
};

/**
 * Resolves a string id for table rows from GET/POST/PUT payloads.
 * Supports `_id`, string `id`, ObjectId `.toString()`, numbers, and Extended JSON `{ $oid }`.
 */
export function normalizePosTableRowId(row: PosTableIdSource): string {
  const candidates: unknown[] = [row._id, row.id];
  for (const raw of candidates) {
    if (raw == null) continue;
    if (typeof raw === "string") {
      const t = raw.trim();
      if (t) return t;
      continue;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return String(Math.trunc(raw));
    }
    if (typeof raw === "object" && raw !== null && "$oid" in raw) {
      const oid = (raw as { $oid?: unknown }).$oid;
      if (typeof oid === "string" && oid.trim()) return oid.trim();
    }
    const asStr = String(raw as object);
    if (asStr && asStr !== "[object Object]") return asStr;
  }
  return "";
}

export type PosTableRow = {
  _id?: string;
  id?: string;
  publicQrToken?: string;
  tableNo?: number;
  seats?: number;
  section?: string;
  status?: string;
  name?: string;
  pricePerPerson?: number;
  reservatorName?: string | null;
  reservatorPhone?: string | null;
  reservatorIsVip?: boolean;
  personsSeated?: number;
  floorAnchorX?: number | null;
  floorAnchorY?: number | null;
  currentOrder?: unknown;
  /** When false, omitted from POS floor list (undefined = legacy visible). */
  visibleInPos?: boolean;
};

/** Request body for POST /api/table (location header required). */
export type PosTableCreateBody = {
  tableNo?: number;
  seats?: number;
  section?: string;
  name?: string;
  pricePerPerson?: number;
  reservatorName?: string | null;
  reservatorPhone?: string | null;
  reservatorIsVip?: boolean;
  personsSeated?: number;
  /** `available` | `reserved` | `occupied` | `billed` | `closed`, plus legacy aliases. */
  status?: string;
  /** Normalized 0–1 plan coordinates (table center). Omit or null both to use auto layout. */
  floorAnchorX?: number | null;
  floorAnchorY?: number | null;
  /** Explicit opt-in: table appears on POS floor (default false when omitted on dashboard create). */
  visibleInPos?: boolean;
};

export type PosTableUpdateBody = Partial<PosTableCreateBody> & {
  orderId?: string | null;
};

export async function posFetchTables(locationId?: string): Promise<PosTableRow[]> {
  const url = locationId ? `/api/table?locationId=${locationId}` : "/api/table";
  const res = await posApiJson<PosTableRow[]>(url);
  const data = res.data;
  return Array.isArray(data) ? data : [];
}

export async function posCreateTable(body: PosTableCreateBody): Promise<PosTableRow> {
  const res = await posApiJson<PosTableRow>("/api/table", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(sanitizePosApiErrorMessage(res.message || "Could not create table."));
  return res.data;
}

export async function posUpdateTable(id: string, body: PosTableUpdateBody): Promise<PosTableRow> {
  const tid = normalizePosTableRowId({ _id: id, id });
  if (!tid) {
    throw new Error(sanitizePosApiErrorMessage("Missing table id."));
  }
  const res = await posApiJson<PosTableRow>(`/api/table/${tid}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(sanitizePosApiErrorMessage(res.message || "Could not update table."));
  return res.data;
}

export async function posDeleteTable(id: string): Promise<void> {
  const tid = normalizePosTableRowId({ _id: id, id });
  if (!tid) {
    throw new Error(sanitizePosApiErrorMessage("Missing table id."));
  }
  const res = await posApiJson<unknown>(`/api/table/${tid}`, {
    method: "DELETE",
  });
  if (res.success === false) throw new Error(sanitizePosApiErrorMessage(res.message || "Could not delete table."));
}

export async function posFetchTableById(id: string): Promise<PosTableRow> {
  const tid = normalizePosTableRowId({ _id: id, id });
  if (!tid) {
    throw new Error(sanitizePosApiErrorMessage("Missing table id."));
  }
  const res = await posApiJson<PosTableRow>(`/api/table/${tid}`);
  if (!res.data) throw new Error(sanitizePosApiErrorMessage(res.message || "Table not found."));
  return res.data;
}

export async function posFetchTableQrBlob(id: string): Promise<Blob> {
  const tid = normalizePosTableRowId({ _id: id, id });
  if (!tid) {
    throw new Error(sanitizePosApiErrorMessage("Missing table id."));
  }
  const res = await posApiFetch(`/api/table/${tid}/qr`);
  if (!res.ok) {
    let msg = `Could not load QR (${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string };
      if (typeof body?.message === "string" && body.message) msg = body.message;
    } catch {
      // keep generic message
    }
    throw new Error(sanitizePosApiErrorMessage(msg));
  }
  return res.blob();
}
