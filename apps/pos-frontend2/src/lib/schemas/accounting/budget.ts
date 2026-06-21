import { z } from "zod";

export const accountingBudgetFormSchema = z.object({
  accountId: z.string().min(1, "Select an account."),
  fiscalYear: z.coerce.number().int().min(2000, "Enter a valid fiscal year.").max(2100, "Enter a valid fiscal year."),
  periodMonth: z.coerce.number().int().min(1, "Select a month.").max(12, "Select a month."),
  amountStr: z
    .string()
    .trim()
    .min(1, "Enter a budget amount.")
    .refine((s) => Number.isFinite(Number.parseFloat(s)), { message: "Enter a budget amount." }),
});

export type AccountingBudgetFormValues = z.infer<typeof accountingBudgetFormSchema>;

export function budgetAmountFromForm(values: AccountingBudgetFormValues): number {
  return Number.parseFloat(values.amountStr);
}
