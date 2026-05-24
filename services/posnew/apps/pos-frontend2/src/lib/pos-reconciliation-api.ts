import { posApiJson } from "./pos-api-fetch";

export const RECONCILIATION_QUERY_KEY = ["reconciliation-matches"];

export interface ReconciliationPoLine {
  ingredientId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  receivedQty?: number;
  name?: string;
  sku?: string;
}

export interface ReconciliationBillLine {
  ingredientId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  name?: string;
  sku?: string;
}

export interface ReconciliationGrnDoc {
  _id: string;
  grnNumber: string;
  receivedAt: string;
  status: string;
}

export type ReconciliationStatus =
  | "pending"
  | "matched"
  | "quantity_mismatch"
  | "price_mismatch"
  | "overridden"
  | "resolved";

export interface ReconciliationActionLog {
  action: "override" | "resolve";
  reason: string;
  performedByEmail?: string;
  performedAt: string;
}

export interface ReconciliationMatchRecord {
  _id: string;
  purchaseOrder: {
    _id: string;
    reference: string;
    status: string;
    total: number;
    lines: ReconciliationPoLine[];
  };
  vendorBill: {
    _id: string;
    vendorBillNumber: string;
    status: string;
    total: number;
    lines: ReconciliationBillLine[];
  };
  matchStatus: ReconciliationStatus;
  discrepancyNotes: string;
  lastMatchedAt: string;
  updatedAt: string;
  associatedGrns?: ReconciliationGrnDoc[];
  actionHistory?: ReconciliationActionLog[];
}

export async function fetchReconciliationMatches(params?: {
  status?: string;
  purchaseOrderId?: string;
  vendorBillId?: string;
}) {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.purchaseOrderId) sp.set("purchaseOrderId", params.purchaseOrderId);
  if (params?.vendorBillId) sp.set("vendorBillId", params.vendorBillId);

  return posApiJson<ReconciliationMatchRecord[]>(`/api/reconciliation?${sp.toString()}`);
}

export async function fetchReconciliationMatch(id: string) {
  return posApiJson<ReconciliationMatchRecord>(`/api/reconciliation/${id}`);
}

export async function overrideReconciliationMatch(id: string, reason: string) {
  return posApiJson<ReconciliationMatchRecord>(`/api/reconciliation/${id}/override`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function resolveReconciliationMatch(id: string, resolution?: string) {
  return posApiJson<ReconciliationMatchRecord>(`/api/reconciliation/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution: resolution ?? "" }),
  });
}
