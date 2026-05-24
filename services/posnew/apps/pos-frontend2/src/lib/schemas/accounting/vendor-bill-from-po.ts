import { z } from "zod";

export const vendorBillFromPoFormSchema = z.object({
  purchaseOrderId: z.string().trim().min(1, "Select or enter a purchase order ID."),
  billDate: z.string(),
  dueDate: z.string(),
  currency: z.string().trim().min(1, "Currency is required.").max(8, "Currency code is too long."),
});

export type VendorBillFromPoFormValues = z.infer<typeof vendorBillFromPoFormSchema>;
