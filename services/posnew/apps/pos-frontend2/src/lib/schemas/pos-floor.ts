import { z } from "zod";

/** `branchId` should be the effective branch scope id (empty when user must pick a branch). */
export const posFloorCreateTableSchema = z
  .object({
    branchId: z.string().trim().min(1, "Choose a branch first."),
    tableNumberRaw: z.string().trim().min(1, "Enter a table number."),
  })
  .superRefine((data, ctx) => {
    const n = Number.parseInt(data.tableNumberRaw, 10);
    if (!Number.isFinite(n) || n < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid table number (1+).",
        path: ["tableNumberRaw"],
      });
    }
  });

export type PosFloorCreateTableFormValues = z.infer<typeof posFloorCreateTableSchema>;
