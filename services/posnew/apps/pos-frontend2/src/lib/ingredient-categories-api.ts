import { posApiJson } from "@/lib/pos-api-fetch";

export type IngredientCategoryRow = {
  _id: string;
  name: string;
  description?: string;
  sortOrder?: number;
  parentCategory?: string | IngredientCategoryRow;
  taxCode?: string;
};

export async function fetchIngredientCategories() {
  return posApiJson<IngredientCategoryRow[]>("/api/ingredient-categories");
}

export async function createIngredientCategory(data: {
  name: string;
  description?: string;
  sortOrder?: number;
  parentCategory?: string | null;
  taxCode?: string | null;
}) {
  return posApiJson<IngredientCategoryRow>("/api/ingredient-categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateIngredientCategory(
  id: string,
  data: {
    name?: string;
    description?: string;
    sortOrder?: number;
    parentCategory?: string | null;
    taxCode?: string | null;
  },
) {
  return posApiJson<IngredientCategoryRow>(`/api/ingredient-categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteIngredientCategory(id: string) {
  return posApiJson<unknown>(`/api/ingredient-categories/${id}`, {
    method: "DELETE",
  });
}
