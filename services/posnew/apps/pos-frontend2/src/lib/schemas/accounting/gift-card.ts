import { z } from "zod";

export const giftCardIssueFormSchema = z
  .object({
    issueAmount: z.string().trim().min(1, "Enter an amount."),
    cashAccountId: z.string().min(1, "Select a cash / clearing account."),
  })
  .superRefine((data, ctx) => {
    const amount = Number.parseFloat(data.issueAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a positive amount.",
        path: ["issueAmount"],
      });
    }
  });

export const giftCardRedeemFormSchema = z
  .object({
    redeemCode: z.string().trim().min(1, "Enter gift card code."),
    redeemAmount: z.string().trim().min(1, "Enter an amount."),
  })
  .superRefine((data, ctx) => {
    const amount = Number.parseFloat(data.redeemAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a positive amount.",
        path: ["redeemAmount"],
      });
    }
  });

export type GiftCardIssueFormValues = z.infer<typeof giftCardIssueFormSchema>;
export type GiftCardRedeemFormValues = z.infer<typeof giftCardRedeemFormSchema>;
