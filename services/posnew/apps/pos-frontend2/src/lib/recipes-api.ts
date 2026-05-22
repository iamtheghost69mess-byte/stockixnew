/**
 * Recipe (BOM) API — `apps/pos-backend/routes/recipeRoute.js`
 * RBAC: `backoffice.*` read; admin/manager write.
 */

import { type PosApiJson, posApiJson } from "@/lib/pos-api-fetch";

export type RecipeLinePayload = {
  ingredient?: string;
  subMenuItem?: string;
  quantity: number;
  optional?: boolean;
};

export type RecipeLineRow = {
  ingredient?: string | { _id?: string; name?: string; unit?: string } | null;
  subMenuItem?: string | { _id?: string; name?: string; price?: number } | null;
  quantity: number;
  optional?: boolean;
};

export type RecipeRecord = {
  _id: string;
  menuItem: string | { _id?: string; name?: string; price?: number };
  menuItemVariant?: string | { _id?: string; variantName?: string; sku?: string } | null;
  ingredients: RecipeLineRow[];
};

export const RECIPES_QUERY_KEY = ["recipes"] as const;

export type RecipesListResponse = PosApiJson<RecipeRecord[]> & {
  page?: number;
  limit?: number;
  total?: number;
};

export async function fetchRecipesList(params?: { page?: number; limit?: number; q?: string }) {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.q) q.set("q", params.q);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<RecipeRecord[]>(`/api/recipes${suffix}`) as Promise<RecipesListResponse>;
}

export async function fetchRecipeByMenuItem(menuItemId: string, variantId?: string | null) {
  const q = new URLSearchParams();
  if (variantId) q.set("variantId", variantId);
  const suffix = q.toString() ? `?${q}` : "";
  return posApiJson<RecipeRecord | null>(`/api/recipes/by-menu-item/${menuItemId}${suffix}`);
}

export async function upsertRecipe(body: {
  menuItem: string;
  menuItemVariant?: string | null;
  ingredients: RecipeLinePayload[];
}) {
  return posApiJson<RecipeRecord>("/api/recipes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteRecipeByMenuItem(menuItemId: string, variantId?: string | null) {
  const q = new URLSearchParams();
  if (variantId) q.set("variantId", variantId);
  const suffix = q.toString() ? `?${q}` : "";
  return posApiJson<{ message?: string }>(`/api/recipes/by-menu-item/${menuItemId}${suffix}`, {
    method: "DELETE",
  });
}
