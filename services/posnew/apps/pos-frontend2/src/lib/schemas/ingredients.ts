import { z } from "zod";

export const INGREDIENT_UNITS = ["g", "kg", "ml", "l", "piece"] as const;

export const ingredientUnitSchema = z.enum(INGREDIENT_UNITS);

export const ingredientFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(["active", "archived"]),
  unit: ingredientUnitSchema,
  /** Empty string = same as stock unit (no separate purchase unit). */
  purchaseUnit: z.enum(["", "g", "kg", "ml", "l", "piece"]),
  purchaseToStockFactor: z.coerce.number().min(0.000001),
  currentStock: z.coerce.number().min(0),
  reorderThreshold: z.coerce.number().min(0),
  reorderQuantity: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0),
  supplier: z.string().optional(),
  imageUrl: z.string().optional(),
  leadTimeDays: z.coerce.number().min(0),
  safetyStockLevel: z.coerce.number().min(0),
  minimumOrderQuantity: z.coerce.number().min(0),
  maximumStockLevel: z.coerce.number().min(0),
  shelfLifeDays: z.coerce.number().int().min(0),
  packagingType: z.string().optional(),
  /** Use `defaultValues` in the form; avoid `.default()` here so RHF input/output match. */
  tags: z.array(z.string()),
  isAutoReorder: z.boolean(),
  isDropshipOnly: z.boolean(),
  isSerialTracked: z.boolean(),
  serialNumberFormat: z.string().optional(),
  barcode: z.string().optional(),
});

export type IngredientFormData = z.infer<typeof ingredientFormSchema>;

export const ingredientCategoryFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int(),
  parentCategoryId: z.string().optional(),
  taxCode: z.string().optional(),
});

export type IngredientCategoryFormData = z.infer<typeof ingredientCategoryFormSchema>;
