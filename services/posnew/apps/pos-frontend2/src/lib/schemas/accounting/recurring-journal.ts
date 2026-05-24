import { z } from "zod";

const lineDraftSchema = z.object({
  accountId: z.string(),
  debit: z.string(),
  credit: z.string(),
  memo: z.string(),
});

export type RecurringJournalLineDraft = z.infer<typeof lineDraftSchema>;

export const recurringJournalSaveFormSchema = z
  .object({
    memo: z.string(),
    nextRunLocal: z.string().min(1, "Next run date is required."),
    frequency: z.enum(["daily", "weekly", "monthly"]),
    isActive: z.boolean(),
    lines: z.array(lineDraftSchema),
  })
  .superRefine((data, ctx) => {
    if (Number.isNaN(new Date(data.nextRunLocal).getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid next run date.",
        path: ["nextRunLocal"],
      });
    }
    if (!data.memo.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Memo is required.",
        path: ["memo"],
      });
    }
    const parsed = data.lines.map((l) => ({
      account: l.accountId,
      debit: Number.parseFloat(l.debit) || 0,
      credit: Number.parseFloat(l.credit) || 0,
      memo: l.memo.trim(),
    }));
    const material = parsed.filter((l) => l.account && (l.debit > 0 || l.credit > 0));
    if (material.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least two lines with an account and a debit or credit.",
        path: ["lines"],
      });
      return;
    }
    for (const l of material) {
      if (l.debit > 0 && l.credit > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each line must have either a debit or a credit, not both.",
          path: ["lines"],
        });
        return;
      }
    }
    const sumDr = material.reduce((s, l) => s + l.debit, 0);
    const sumCr = material.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(sumDr - sumCr) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Template is not balanced (debits ${sumDr.toFixed(2)} ≠ credits ${sumCr.toFixed(2)}).`,
        path: ["lines"],
      });
    }
  });

export type RecurringJournalSaveFormValues = z.infer<typeof recurringJournalSaveFormSchema>;

export function buildRecurringJournalTemplateLines(
  lines: RecurringJournalLineDraft[],
): Array<{ account: string; debit: number; credit: number; memo?: string }> {
  const parsed = lines
    .map((l) => ({
      account: l.accountId,
      debit: Number.parseFloat(l.debit) || 0,
      credit: Number.parseFloat(l.credit) || 0,
      memo: l.memo.trim(),
    }))
    .filter((l) => l.account && (l.debit > 0 || l.credit > 0));
  return parsed.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, memo: l.memo || undefined }));
}
