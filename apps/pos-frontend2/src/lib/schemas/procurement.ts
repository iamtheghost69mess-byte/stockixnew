import { z } from "zod";

export const posSupplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contactName: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  categoryId: z.string().optional(),
});

export type PosSupplierFormData = z.infer<typeof posSupplierSchema>;

export const posPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  items: z
    .array(
      z.object({
        ingredientId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Ingredient must be a valid 24-char id"),
        quantity: z.number().min(0.01, "Quantity must be > 0"),
        unitPrice: z.number().min(0, "Price must be >= 0"),
      }),
    )
    .min(1, "At least one item is required"),
  status: z.enum(["draft", "confirmed", "partial", "received", "cancelled"]),
  expectedAt: z.string().optional(),
  /** Dropship PO: goods go direct to a customer, not our stock. Set default in form `defaultValues`. */
  isDropship: z.boolean(),
  /** Customer order reference if `isDropship` is true. */
  customerOrder: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid 24-char id")
    .optional()
    .or(z.literal("")),
  /** Free-form cost center for departmental reporting. */
  costCenter: z.string().optional(),
  department: z.string().optional(),
  /** Source RFQ number for procurement audit. */
  rfqReference: z.string().optional(),
});

export type PosPurchaseOrderFormData = z.infer<typeof posPurchaseOrderSchema>;
