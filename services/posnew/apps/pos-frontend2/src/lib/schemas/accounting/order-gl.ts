import { z } from "zod";

const mongoId = z
  .string()
  .trim()
  .min(1, "Order ID is required.")
  .regex(/^[a-f\d]{24}$/i, "Order ID must be 24 hex characters.");

export const orderGlPostSchema = z.object({
  orderId: mongoId,
});

export const orderGlRefundSchema = z
  .object({
    orderId: mongoId,
    refundAmount: z.string().trim().min(1, "Refund amount is required."),
    refundAccount: z.string(),
  })
  .superRefine((data, ctx) => {
    const amount = Number.parseFloat(data.refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Refund amount must be positive.",
        path: ["refundAmount"],
      });
    }
  });

export type OrderGlRefundFormValues = z.infer<typeof orderGlRefundSchema>;
