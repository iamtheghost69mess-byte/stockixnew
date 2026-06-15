import { z } from "zod";

export const stockTakeSessionSchema = z.object({
  locationId: z.string().min(1, "Location is required"),
  note: z.string().max(500).optional(),
  blindCount: z.boolean(),
  /** `full` = all active ingredients; `cycle` / `spot` = lines from `StockBalance` rows at the branch only. */
  countMethod: z.enum(["full", "cycle", "spot"]),
});

export type StockTakeSessionFormData = z.infer<typeof stockTakeSessionSchema>;

export const stockTakeCountSchema = z.object({
  countedQty: z.number().min(0, "Count cannot be negative"),
});

export type StockTakeCountFormData = z.infer<typeof stockTakeCountSchema>;
