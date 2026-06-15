import { z } from "zod";

export const invoiceFromOrderFormSchema = z
  .object({
    selectedOrderId: z.string(),
    orderIdManual: z.string(),
    dueDays: z.string(),
  })
  .superRefine((data, ctx) => {
    const oid = data.selectedOrderId.trim() || data.orderIdManual.trim();
    if (!oid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select or enter an order ID.",
        path: ["orderIdManual"],
      });
    }
    const d = Number.parseInt(data.dueDays, 10);
    if (!Number.isFinite(d) || d < 1 || d > 365) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Due days must be between 1 and 365.",
        path: ["dueDays"],
      });
    }
  });

export type InvoiceFromOrderFormValues = z.infer<typeof invoiceFromOrderFormSchema>;
