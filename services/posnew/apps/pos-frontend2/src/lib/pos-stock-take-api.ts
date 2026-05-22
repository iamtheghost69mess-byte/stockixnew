/**
 * Stock take (physical count) sessions.
 * Backend: `stockTakeRoute` — use **`/api/stock-takes`** (canonical). Legacy alias: `/api/inventory/stock-take`.
 */
import { posApiJson } from "@/lib/pos-api-fetch";

export type StockTakeLine = {
  _id: string;
  lineId?: string; // For patching
  ingredient:
    | {
        _id: string;
        name: string;
        unit: string;
        sku?: string;
      }
    | string;
  /** Linked `Bin` when the source `StockBalance` row had `bin` set (warehouse bin). */
  bin?: string | { _id: string; name?: string; code?: string } | null;
  systemQty: number;
  countedQty: number | null;
  varianceQty?: number;
  varianceValue?: number;
};

export type StockTakeSession = {
  _id: string;
  organization: string;
  location:
    | {
        _id: string;
        name: string;
        code?: string;
      }
    | string;
  status: "draft" | "in_progress" | "awaiting_approval" | "posted" | "cancelled";
  note: string;
  blindCount: boolean;
  lines: StockTakeLine[];
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export async function posListStockTakeSessions(params: { locationId?: string; status?: string } = {}) {
  const search = new URLSearchParams();
  if (params.locationId) search.set("locationId", params.locationId);
  if (params.status) search.set("status", params.status);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return posApiJson<StockTakeSession[]>(`/api/stock-takes${suffix}`);
}

export async function posGetStockTakeSession(id: string) {
  return posApiJson<StockTakeSession>(`/api/stock-takes/${id}`);
}

export async function posCreateStockTakeSession(data: {
  locationId: string;
  note?: string;
  blindCount?: boolean;
  /** `full` = all active ingredients; `cycle` / `spot` = one line per `StockBalance` row at the location (subset). */
  countMethod?: "full" | "cycle" | "spot";
}) {
  return posApiJson<StockTakeSession>("/api/stock-takes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function posPatchStockTakeCounts(id: string, lines: { lineId: string; countedQty: number }[]) {
  return posApiJson<StockTakeSession>(`/api/stock-takes/${id}/lines`, {
    method: "PATCH",
    body: JSON.stringify({ lines }),
  });
}

export async function posPostStockTakeSession(id: string) {
  return posApiJson<StockTakeSession>(`/api/stock-takes/${id}/post`, {
    method: "POST",
  });
}

/** Submit counted session for manager approval (optional workflow). */
export async function posSubmitStockTakeForApproval(id: string) {
  return posApiJson<StockTakeSession>(`/api/stock-takes/${id}/submit-approval`, {
    method: "POST",
  });
}

/** Approve a session in `awaiting_approval` (returns to `in_progress`, then post). */
export async function posApproveStockTakeSession(id: string) {
  return posApiJson<StockTakeSession>(`/api/stock-takes/${id}/approve`, {
    method: "POST",
  });
}
