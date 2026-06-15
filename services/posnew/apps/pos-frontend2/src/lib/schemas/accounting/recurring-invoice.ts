import { z } from "zod";

const lineDraftSchema = z.object({
  description: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  taxCode: z.string(),
});

export const recurringInvoiceSaveFormSchema = z
  .object({
    customerId: z.string().min(1, "Select a customer."),
    startIssueLocal: z.string().optional(),
    endIssueLocal: z.string().optional(),
    nextIssueLocal: z.string().min(1, "Next issue date is required."),
    timezone: z.string().min(1, "Timezone is required."),
    dueDays: z.string().min(1, "Due days is required."),
    currency: z.string(),
    notes: z.string(),
    frequency: z.enum(["daily", "weekly", "monthly"]),
    isActive: z.boolean(),
    lines: z.array(lineDraftSchema),
  })
  .superRefine((data, ctx) => {
    if (Number.isNaN(new Date(data.nextIssueLocal).getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid next issue date.",
        path: ["nextIssueLocal"],
      });
    }
    if (data.startIssueLocal && Number.isNaN(new Date(data.startIssueLocal).getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid start date.",
        path: ["startIssueLocal"],
      });
    }
    if (data.endIssueLocal && Number.isNaN(new Date(data.endIssueLocal).getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid end date.",
        path: ["endIssueLocal"],
      });
    }
    if (data.startIssueLocal && data.endIssueLocal) {
      const start = new Date(data.startIssueLocal);
      const end = new Date(data.endIssueLocal);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End date must be after start date.",
          path: ["endIssueLocal"],
        });
      }
    }
    const dueDaysValue = Number.parseInt(data.dueDays, 10);
    if (!Number.isFinite(dueDaysValue) || dueDaysValue < 1 || dueDaysValue > 365) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Due days must be between 1 and 365.",
        path: ["dueDays"],
      });
    }
    const parsed = data.lines
      .map((l) => ({
        description: l.description.trim(),
        quantity: Number.parseFloat(l.quantity),
        unitPrice: Number.parseFloat(l.unitPrice),
        taxCode: l.taxCode.trim() || undefined,
      }))
      .filter((l) => l.description);
    if (parsed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one line with a description.",
        path: ["lines"],
      });
      return;
    }
    for (let i = 0; i < parsed.length; i += 1) {
      const l = parsed[i];
      if (!Number.isFinite(l.quantity) || l.quantity < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each line needs a valid quantity (≥ 0).",
          path: ["lines"],
        });
        return;
      }
      if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each line needs a valid unit price (≥ 0).",
          path: ["lines"],
        });
        return;
      }
    }
  });

export type RecurringInvoiceSaveFormValues = z.infer<typeof recurringInvoiceSaveFormSchema>;

export type RecurringInvoiceLineDraft = z.infer<typeof lineDraftSchema>;

export function buildRecurringInvoiceTemplateLines(lines: RecurringInvoiceLineDraft[]): Array<{
  description: string;
  quantity: number;
  unitPrice: number;
  taxCode: string | null;
}> {
  return lines
    .map((l) => ({
      description: l.description.trim(),
      quantity: Number.parseFloat(l.quantity),
      unitPrice: Number.parseFloat(l.unitPrice),
      taxCode: l.taxCode.trim() || undefined,
    }))
    .filter((l) => l.description)
    .map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode: l.taxCode ?? null,
    }));
}
