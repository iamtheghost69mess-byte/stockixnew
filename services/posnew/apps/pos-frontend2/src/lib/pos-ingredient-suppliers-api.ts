import { posApiJson } from "@/lib/pos-api-fetch";

export type IngredientSupplierLinkSupplier = {
  _id?: string;
  name?: string;
  code?: string;
  phone?: string;
  email?: string;
  defaultLeadTimeDays?: number;
  status?: string;
};

export type IngredientSupplierLinkRow = {
  _id: string;
  supplier: string | IngredientSupplierLinkSupplier;
  unitPrice?: number;
  minimumOrderQty?: number;
  leadTimeDays?: number;
  isPreferred?: boolean;
  supplierSku?: string;
  notes?: string;
};

export function ingredientSupplierLinksQueryKey(ingredientId: string) {
  return ["ingredient-supplier-links", ingredientId] as const;
}

export async function posFetchIngredientSupplierLinks(ingredientId: string) {
  const res = await posApiJson<IngredientSupplierLinkRow[]>(
    `/api/ingredients/${encodeURIComponent(ingredientId)}/supplier-links`,
  );
  return Array.isArray(res.data) ? res.data : [];
}

export type IngredientSupplierLinkUpsertBody = {
  supplierId: string;
  unitPrice?: number;
  minimumOrderQty?: number;
  leadTimeDays?: number;
  isPreferred?: boolean;
  supplierSku?: string;
  notes?: string;
};

export async function posUpsertIngredientSupplierLink(ingredientId: string, body: IngredientSupplierLinkUpsertBody) {
  return posApiJson<IngredientSupplierLinkRow>(`/api/ingredients/${encodeURIComponent(ingredientId)}/supplier-links`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function posDeleteIngredientSupplierLink(ingredientId: string, supplierId: string) {
  return posApiJson<unknown>(
    `/api/ingredients/${encodeURIComponent(ingredientId)}/supplier-links/${encodeURIComponent(supplierId)}`,
    {
      method: "DELETE",
    },
  );
}
