import { z } from "zod";

const lineDraftSchema = z.object({
  accountId: z.string(),
  debit: z.string(),
  credit: z.string(),
  memo: z.string(),
});

export type ManualJournalLineDraft = z.infer<typeof lineDraftSchema>;

export const manualJournalFormSchema = z
  .object({
    memo: z.string(),
    entryDate: z.string().min(1, "Entry date is required."),
    lines: z.array(lineDraftSchema),
  })
  .superRefine((data, ctx) => {
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
        message: "Add at least two lines with an account and a debit or credit amount.",
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
        break;
      }
    }
    const sumDr = material.reduce((s, l) => s + l.debit, 0);
    const sumCr = material.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(sumDr - sumCr) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Entry is not balanced (debits ${sumDr.toFixed(2)} ≠ credits ${sumCr.toFixed(2)}).`,
        path: ["lines"],
      });
    }
  });

export type ManualJournalFormValues = z.infer<typeof manualJournalFormSchema>;

export function buildManualJournalLines(
  lines: ManualJournalLineDraft[],
): Array<{ account: string; debit: number; credit: number; memo: string }> {
  return lines
    .map((l) => ({
      account: l.accountId,
      debit: Number.parseFloat(l.debit) || 0,
      credit: Number.parseFloat(l.credit) || 0,
      memo: l.memo.trim(),
    }))
    .filter((l) => l.account && (l.debit > 0 || l.credit > 0));
}
