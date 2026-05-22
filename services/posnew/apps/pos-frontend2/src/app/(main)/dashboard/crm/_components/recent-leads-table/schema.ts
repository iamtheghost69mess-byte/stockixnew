import z from "zod";

export const topProductRowSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  quantity: z.number(),
  revenue: z.number(),
  percentOfRevenue: z.number(),
});

export type TopProductTableRow = z.infer<typeof topProductRowSchema>;
