/**
 * Vendor Return (RTV) API module.
 * Direct backend route: `/api/vendor-returns`
 */
import { posApiJson } from "@/lib/pos-api-fetch";

export type VendorReturnQualityGrade = "damaged" | "expired" | "wrong_item" | "short_shipped" | "other";

export const VENDOR_RETURN_QUALITY_GRADES: ReadonlyArray<{ value: VendorReturnQualityGrade; label: string }> = [
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "short_shipped", label: "Short-shipped" },
  { value: "other", label: "Other" },
];

export type VendorReturnLine = {
  _id: string;
  ingredient:
    | {
        _id: string;
        name: string;
        unit: string;
        sku?: string;
      }
    | string;
  quantity: number;
  unitCost: number;
  reason: string;
  qualityGrade?: VendorReturnQualityGrade;
};

export type VendorReturn = {
  _id: string;
  returnNumber: string;
  supplier:
    | {
        _id: string;
        name: string;
      }
    | string;
  vendorBill?: string | null;
  location:
    | {
        _id: string;
        name: string;
      }
    | string;
  status: "draft" | "confirmed" | "shipped" | "completed" | "cancelled";
  returnDate: string;
  notes: string;
  lines: VendorReturnLine[];
  vendorCreditNoteRef?: string;
  journalEntry?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function posListVendorReturns(params: { supplierId?: string; status?: string } = {}) {
  const search = new URLSearchParams();
  if (params.supplierId) search.set("supplierId", params.supplierId);
  if (params.status) search.set("status", params.status);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return posApiJson<VendorReturn[]>(`/api/vendor-returns${suffix}`);
}

export async function posGetVendorReturn(id: string) {
  return posApiJson<VendorReturn>(`/api/vendor-returns/${id}`);
}

export async function posCreateVendorReturn(data: {
  supplierId: string;
  locationId: string;
  vendorBillId?: string;
  returnDate?: string;
  notes?: string;
}) {
  return posApiJson<VendorReturn>("/api/vendor-returns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function posUpdateVendorReturnLines(
  id: string,
  lines: {
    ingredient: string;
    quantity: number;
    unitCost: number;
    reason?: string;
    qualityGrade?: VendorReturnQualityGrade;
  }[],
) {
  return posApiJson<VendorReturn>(`/api/vendor-returns/${id}/lines`, {
    method: "PUT",
    body: JSON.stringify({ lines }),
  });
}

export async function posPostVendorReturn(id: string) {
  return posApiJson<VendorReturn>(`/api/vendor-returns/${id}/post`, {
    method: "POST",
  });
}
