import { z } from "zod";

export const vendorBillPaymentFormSchema = z
  .object({
    payAmount: z.string().trim().min(1, "Enter a payment amount."),
  })
  .superRefine((data, ctx) => {
    const amount = Number.parseFloat(data.payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a positive amount.",
        path: ["payAmount"],
      });
    }
  });

export type VendorBillPaymentFormValues = z.infer<typeof vendorBillPaymentFormSchema>;
