import { z } from "zod";

const NONE = "__none__";

export const posCategorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  sortOrder: z.coerce.number().int().min(1, "Sort order must be at least 1."),
  color: z.string().optional(),
  /** `__none__` or Mongo id of parent menu category */
  parentCategoryId: z.string(),
  /** `__none__` or Mongo id of GL revenue account */
  revenueAccountId: z.string(),
});

export type PosCategoryFormData = z.infer<typeof posCategorySchema>;

export const POS_CATEGORY_NONE_VALUE = NONE;

export const posMenuItemSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    description: z.string().max(500, "Note must be 500 characters or less.").optional(),
    priceUsd: z.coerce.number().min(0, "USD price cannot be negative."),
    priceLbp: z.coerce.number().min(0, "LBP price cannot be negative."),
    category: z.string().min(1, "Please select a category."),
    imageUrl: z.string().optional(),
    isAvailable: z.boolean(),
    showOnPOS: z.boolean(),
  })
  .refine((d) => d.priceUsd > 0 || d.priceLbp > 0, {
    message: "Enter at least one non-zero price (USD and/or LBP).",
    path: ["priceUsd"],
  });

export type PosMenuItemFormData = z.infer<typeof posMenuItemSchema>;
