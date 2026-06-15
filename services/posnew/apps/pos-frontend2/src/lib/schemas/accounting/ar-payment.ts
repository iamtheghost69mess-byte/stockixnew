import { z } from "zod";

export const arPaymentFormSchema = z
  .object({
    customerId: z.string().trim().min(1, "Select a customer."),
    amountStr: z.string().trim().min(1, "Enter amount received."),
    useExplicitAlloc: z.boolean(),
    allocInvoiceId: z.string(),
    allocAmountStr: z.string(),
  })
  .superRefine((data, ctx) => {
    const amount = Number.parseFloat(data.amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a positive amount.",
        path: ["amountStr"],
      });
    }
    if (data.useExplicitAlloc && data.allocInvoiceId && data.allocAmountStr.trim()) {
      const a = Number.parseFloat(data.allocAmountStr);
      if (!Number.isFinite(a) || a <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid amount to apply to the invoice.",
          path: ["allocAmountStr"],
        });
      }
    }
  });

export type ArPaymentFormValues = z.infer<typeof arPaymentFormSchema>;
