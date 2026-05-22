import { z } from "zod";

export const fxRateCreateFormSchema = z
  .object({
    effDate: z.string(),
    newFrom: z.string().trim().regex(/^[A-Z]{3}$/, "Select a valid 3-letter currency."),
    newTo: z.string().trim().regex(/^[A-Z]{3}$/, "Select a valid 3-letter currency."),
    newRate: z.string().trim().min(1, "Enter a rate."),
    newNote: z.string(),
  })
  .superRefine((data, ctx) => {
    const r = Number.parseFloat(data.newRate);
    if (!Number.isFinite(r) || r <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a positive exchange rate (how many “to” units for one “from” unit).",
        path: ["newRate"],
      });
    }
    if (!data.newFrom.trim() || !data.newTo.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "From and to currency are required.",
        path: !data.newFrom.trim() ? ["newFrom"] : ["newTo"],
      });
    }
    if (data.newFrom.trim() && data.newTo.trim() && data.newFrom.trim() === data.newTo.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "From and to currencies must be different.",
        path: ["newTo"],
      });
    }
  });

export type FxRateCreateFormValues = z.infer<typeof fxRateCreateFormSchema>;
