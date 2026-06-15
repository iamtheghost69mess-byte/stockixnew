import { z } from "zod";

const paymentRowSchema = z.object({
  methodKey: z.string(),
  account: z.string(),
});

export const accountingSettingsSaveSchema = z
  .object({
    paymentRows: z.array(paymentRowSchema),
    companyCurrency: z.string(),
    inventoryExpiryAlertDays: z.string(),
    inventoryAlertWebhookUrl: z.string(),
  })
  .superRefine((data, ctx) => {
    const pm = data.paymentRows.filter((r) => r.methodKey.trim() && r.account);
    if (pm.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one payment method mapping with an account (e.g. cash → checking).",
        path: ["paymentRows"],
      });
    }
  });

export type AccountingSettingsSaveFormSlice = z.infer<typeof accountingSettingsSaveSchema>;
