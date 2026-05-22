import { posApiJson } from "@/lib/pos-api-fetch";

export const GOODS_RECEIPT_NOTES_QUERY_KEY = ["goods-receipt-notes"] as const;

export type PosGrnStatus = "draft" | "confirmed" | "qc_pending" | "qc_failed" | "cancelled";
export type PosGrnLineQcStatus = "passed" | "failed" | "pending";

export type PosGrnLine = {
  _id: string;
  ingredient: string | { _id: string; name?: string; unit?: string; sku?: string };
  purchaseOrderLineId: string;
  orderedQty: number;
  receivedQty: number;
  rejectedQty: number;
  unitCost: number;
  lotNumber?: string;
  expiryDate?: string | null;
  productionDate?: string | null;
  supplierBatchRef?: string;
  rejectionReason?: string;
  qcStatus?: PosGrnLineQcStatus;
};

export type PosGoodsReceiptNote = {
  _id: string;
  organization?: string;
  purchaseOrder: string | { _id: string; reference?: string };
  supplier: string | { _id: string; name?: string };
  location: string | { _id: string; name?: string };
  status: PosGrnStatus;
  receivedAt?: string;
  receivedBy?: string;
  notes?: string;
  supplierDeliveryNoteRef?: string;
  lines: PosGrnLine[];
  createdAt?: string;
  updatedAt?: string;
  /** GL-posting chip metadata (mirrors `goodsReceiptNoteModel.js`). */
  journalEntry?: string | { _id: string; reference?: string } | null;
  postedAt?: string | null;
  postedBy?: string | { _id: string; name?: string } | null;
};

export type PosGrnLinePatch = {
  _id: string;
  receivedQty?: number;
  rejectedQty?: number;
  unitCost?: number;
  lotNumber?: string;
  expiryDate?: string | null;
  productionDate?: string | null;
  supplierBatchRef?: string;
  rejectionReason?: string;
  qcStatus?: PosGrnLineQcStatus;
};

export type PosGrnUpdateBody = {
  notes?: string;
  supplierDeliveryNoteRef?: string;
  lines?: PosGrnLinePatch[];
};

export async function posFetchGoodsReceiptNotes(filters?: {
  status?: PosGrnStatus;
  purchaseOrderId?: string;
  supplierId?: string;
}) {
  const sp = new URLSearchParams();
  if (filters?.status) sp.set("status", filters.status);
  if (filters?.purchaseOrderId) sp.set("purchaseOrderId", filters.purchaseOrderId);
  if (filters?.supplierId) sp.set("supplierId", filters.supplierId);
  const q = sp.toString();
  const path = q ? `/api/goods-receipt-notes?${q}` : "/api/goods-receipt-notes";
  const res = await posApiJson<PosGoodsReceiptNote[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posFetchGoodsReceiptNote(id: string) {
  const res = await posApiJson<PosGoodsReceiptNote>(`/api/goods-receipt-notes/${id}`);
  if (!res.data) throw new Error("GRN not found");
  return res.data;
}

export async function posCreateGoodsReceiptNote(purchaseOrderId: string) {
  return posApiJson<PosGoodsReceiptNote>("/api/goods-receipt-notes", {
    method: "POST",
    body: JSON.stringify({ purchaseOrderId }),
  });
}

export async function posUpdateGoodsReceiptNote(id: string, body: PosGrnUpdateBody) {
  return posApiJson<PosGoodsReceiptNote>(`/api/goods-receipt-notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function posConfirmGoodsReceiptNote(id: string) {
  return posApiJson<PosGoodsReceiptNote>(`/api/goods-receipt-notes/${id}/confirm`, {
    method: "POST",
  });
}

export type PosGrnQcTransition = {
  status: "qc_pending" | "qc_failed" | "confirmed";
  reason?: string;
  lineStatuses?: Array<{ lineId: string; qcStatus: PosGrnLineQcStatus; reason?: string }>;
};

export async function posTransitionGoodsReceiptNoteQc(id: string, body: PosGrnQcTransition) {
  return posApiJson<PosGoodsReceiptNote>(`/api/goods-receipt-notes/${id}/qc`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
