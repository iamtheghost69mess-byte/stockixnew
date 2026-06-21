import { z } from "zod";

export const accountingSessionCloseSchema = z
  .object({
    closingCounted: z.string().trim().min(1, "Counted cash is required."),
    closingCountedCard: z.string(),
    expectedCash: z.string(),
    expectedCard: z.string(),
  })
  .superRefine((data, ctx) => {
    const counted = Number(data.closingCounted);
    if (Number.isNaN(counted)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Counted cash must be a number.",
        path: ["closingCounted"],
      });
    }
    if (data.expectedCash.trim() !== "" && Number.isNaN(Number(data.expectedCash))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected cash must be a number when provided.",
        path: ["expectedCash"],
      });
    }
    if (data.expectedCard.trim() !== "" && Number.isNaN(Number(data.expectedCard))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected card must be a number when provided.",
        path: ["expectedCard"],
      });
    }
  });

export type AccountingSessionCloseValues = z.infer<typeof accountingSessionCloseSchema>;
