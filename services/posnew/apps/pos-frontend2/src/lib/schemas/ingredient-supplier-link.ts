import { z } from "zod";

const NONE = "__none__";

export const ingredientSupplierLinkUpsertSchema = z
  .object({
    supplierId: z.string().min(1, "Select a supplier."),
    unitPrice: z.string().trim().min(1, "Unit price is required."),
    minimumOrderQty: z.string(),
    leadTimeDays: z.string(),
    supplierSku: z.string(),
    notes: z.string(),
    isPreferred: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.supplierId === NONE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a supplier.",
        path: ["supplierId"],
      });
    }
    const up = Number.parseFloat(data.unitPrice);
    if (!Number.isFinite(up) || up < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid unit price (≥ 0).",
        path: ["unitPrice"],
      });
    }
    const moq = Number.parseFloat(data.minimumOrderQty);
    if (!Number.isFinite(moq) || moq < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid minimum order quantity (≥ 0).",
        path: ["minimumOrderQty"],
      });
    }
    const lead = Number.parseInt(data.leadTimeDays, 10);
    if (!Number.isFinite(lead) || lead < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter valid lead time days (≥ 0).",
        path: ["leadTimeDays"],
      });
    }
  });

export type IngredientSupplierLinkUpsertValues = z.infer<typeof ingredientSupplierLinkUpsertSchema>;
