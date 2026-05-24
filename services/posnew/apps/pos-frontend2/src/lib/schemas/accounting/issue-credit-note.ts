import { z } from "zod";

export const issueCreditNoteFormSchema = z
  .object({
    invoiceId: z.string().trim().min(1, "Select an invoice."),
    amountStr: z.string(),
    reason: z.string(),
    notes: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.amountStr.trim()) return;
    const amount = Number.parseFloat(data.amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount must be positive if provided.",
        path: ["amountStr"],
      });
    }
  });

export type IssueCreditNoteFormValues = z.infer<typeof issueCreditNoteFormSchema>;
