import { posApiJson } from "@/lib/pos-api-fetch";

export const CATALOG_QUERY_KEYS = {
  all: ["catalog"] as const,
  categories: () => ["catalog", "categories"] as const,
  menuItems: (params?: { category?: string; available?: boolean }) => ["catalog", "menu-items", params] as const,
  variants: (menuItemId: string) => ["catalog", "variants", menuItemId] as const,
};

export type PosCategoryParentRef = {
  _id?: string;
  name?: string;
  color?: string;
};

export type PosCategoryRevenueRef = {
  _id?: string;
  code?: string;
  name?: string;
  type?: string;
};

export type PosCategory = {
  _id: string;
  name?: string;
  menuNote?: string;
  sortOrder?: number;
  color?: string;
  /** API write: Mongo id or null to clear */
  parentCategory?: string | PosCategoryParentRef | null;
  revenueAccount?: string | PosCategoryRevenueRef | null;
  printerAssignment?: string | null;
};

export type PosMenuItem = {
  _id: string;
  name?: string;
  description?: string;
  menuNote?: string;
  /** @deprecated Use priceUsd + priceLbp */
  price?: number;
  /** @deprecated */
  currency?: "USD" | "LBP";
  priceUsd?: number | null;
  priceLbp?: number | null;
  sku?: string;
  imageUrl?: string;
  category?:
    | string
    | {
        _id?: string;
        name?: string;
        color?: string;
        sortOrder?: number;
        parentCategory?: string | PosCategoryParentRef | null;
        revenueAccount?: string | PosCategoryRevenueRef | null;
      };
  /** Root › … › leaf from org category tree (API-computed). */
  categoryFullPath?: string;
  isAvailable?: boolean;
  showOnPOS?: boolean;
  modifierGroups?: { groupId?: string }[];
};

export type PosModifierGroup = {
  _id: string;
  name: string;
  type: "variant" | "addon";
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: { name: string; priceAdjustment: number }[];
  isActive: boolean;
};

export type PosComboSlot = {
  name: string;
  required: boolean;
  items: { menuItemId: string }[];
};

export type PosCombo = {
  _id: string;
  name: string;
  description?: string;
  price: number;
  type: "fixed" | "choice";
  slots: PosComboSlot[];
  image?: string;
  isActive: boolean;
};

export type PosMenuItemVariant = {
  _id: string;
  menuItem?: string;
  variantName?: string;
  sku?: string;
  priceOverride?: number | null;
  isActive?: boolean;
};

export async function posFetchCategories(): Promise<PosCategory[]> {
  const res = await posApiJson<PosCategory[]>("/api/categories");
  const data = res.data;
  return Array.isArray(data) ? data : [];
}

export async function posFetchMenuItems(params?: {
  category?: string;
  /** When true, only items marked available (backend query `available=true`). */
  available?: boolean;
  /** When true, only items flagged to display in POS grid. */
  showOnPOS?: boolean;
}): Promise<PosMenuItem[]> {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.available) q.set("available", "true");
  if (params?.showOnPOS) q.set("showOnPOS", "true");
  const path = q.toString() ? `/api/menu-items?${q}` : "/api/menu-items";
  const res = await posApiJson<PosMenuItem[]>(path);
  const data = res.data;
  return Array.isArray(data) ? data : [];
}

export async function posFetchMenuItemVariants(menuItemId: string): Promise<PosMenuItemVariant[]> {
  const res = await posApiJson<PosMenuItemVariant[]>(`/api/menu-items/${encodeURIComponent(menuItemId)}/variants`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posFetchModifierGroups(): Promise<PosModifierGroup[]> {
  const res = await posApiJson<PosModifierGroup[]>("/api/modifier-groups");
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateModifierGroup(payload: Partial<PosModifierGroup>): Promise<PosModifierGroup> {
  const res = await posApiJson<PosModifierGroup>("/api/modifier-groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.data) throw new Error(res.message || "Failed to create modifier group.");
  return res.data;
}

export async function posUpdateModifierGroup(
  id: string,
  payload: Partial<PosModifierGroup>,
): Promise<PosModifierGroup> {
  const res = await posApiJson<PosModifierGroup>(`/api/modifier-groups/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.data) throw new Error(res.message || "Failed to update modifier group.");
  return res.data;
}

export async function posDeleteModifierGroup(id: string): Promise<void> {
  await posApiJson<void>(`/api/modifier-groups/${id}`, {
    method: "DELETE",
  });
}

export async function posAttachModifierGroupsToMenuItem(
  menuItemId: string,
  groupIds: string[],
): Promise<PosMenuItem> {
  const res = await posApiJson<PosMenuItem>(`/api/menu-items/${menuItemId}/modifier-groups`, {
    method: "PATCH",
    body: JSON.stringify({
      modifierGroups: groupIds.map((groupId) => ({ groupId })),
    }),
  });
  if (!res.data) throw new Error(res.message || "Failed to attach modifier groups.");
  return res.data;
}

export async function posFetchCombos(): Promise<PosCombo[]> {
  const res = await posApiJson<PosCombo[]>("/api/combos");
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateCombo(payload: Partial<PosCombo>): Promise<PosCombo> {
  const res = await posApiJson<PosCombo>("/api/combos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.data) throw new Error(res.message || "Failed to create combo.");
  return res.data;
}

export async function posUpdateCombo(id: string, payload: Partial<PosCombo>): Promise<PosCombo> {
  const res = await posApiJson<PosCombo>(`/api/combos/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.data) throw new Error(res.message || "Failed to update combo.");
  return res.data;
}

export async function posDeleteCombo(id: string): Promise<void> {
  await posApiJson<void>(`/api/combos/${id}`, {
    method: "DELETE",
  });
}

export async function posCreateMenuItemVariant(
  menuItemId: string,
  data: Partial<PosMenuItemVariant>,
): Promise<PosMenuItemVariant> {
  const res = await posApiJson<PosMenuItemVariant>(`/api/menu-items/${encodeURIComponent(menuItemId)}/variants`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to create variant");
  return res.data;
}

export async function posUpdateMenuItemVariant(
  id: string,
  data: Partial<PosMenuItemVariant>,
): Promise<PosMenuItemVariant> {
  const res = await posApiJson<PosMenuItemVariant>(`/api/menu-items/variants/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to update variant");
  return res.data;
}

export async function posDeleteMenuItemVariant(id: string): Promise<void> {
  await posApiJson<void>(`/api/menu-items/variants/${id}`, {
    method: "DELETE",
  });
}

export async function posCreateCategory(data: Partial<PosCategory>): Promise<PosCategory> {
  const res = await posApiJson<PosCategory>("/api/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to create category");
  return res.data;
}

export async function posUpdateCategory(id: string, data: Partial<PosCategory>): Promise<PosCategory> {
  const res = await posApiJson<PosCategory>(`/api/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to update category");
  return res.data;
}

export async function posPatchCategory(id: string, data: Partial<PosCategory>): Promise<PosCategory> {
  const res = await posApiJson<PosCategory>(`/api/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to patch category");
  return res.data;
}

export async function posDeleteCategory(id: string): Promise<void> {
  await posApiJson<void>(`/api/categories/${id}`, {
    method: "DELETE",
  });
}
export async function posCreateMenuItem(data: Partial<PosMenuItem>): Promise<PosMenuItem> {
  const res = await posApiJson<PosMenuItem>("/api/menu-items", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to create menu item");
  return res.data;
}

export async function posUpdateMenuItem(id: string, data: Partial<PosMenuItem>): Promise<PosMenuItem> {
  const res = await posApiJson<PosMenuItem>(`/api/menu-items/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to update menu item");
  return res.data;
}

export async function posDeleteMenuItem(id: string): Promise<void> {
  await posApiJson<void>(`/api/menu-items/${id}`, {
    method: "DELETE",
  });
}
