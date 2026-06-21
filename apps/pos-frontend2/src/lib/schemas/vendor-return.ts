import { z } from "zod";

export const vendorReturnSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  locationId: z.string().min(1, "Location is required"),
  returnDate: z.string().min(1, "Return date is required"),
  notes: z.string().max(1000).optional(),
  vendorBillId: z.string().optional(),
});

export type VendorReturnFormData = z.infer<typeof vendorReturnSchema>;

export const vendorReturnLineSchema = z.object({
  ingredientId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid ingredient"),
  quantity: z.number().min(0.001, "Quantity must be > 0"),
  unitCost: z.number().min(0, "Unit cost must be >= 0"),
  reason: z.string().max(500).optional(),
});

export type VendorReturnLineFormData = z.infer<typeof vendorReturnLineSchema>;
