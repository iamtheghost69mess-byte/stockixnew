import { z } from "zod";

const base = z.object({
  name: z.string().trim().min(1, "Name is required."),
  type: z.string().min(1, "Type is required."),
  isActive: z.boolean(),
  sortOrder: z.string(),
});

export const accountCreateFormSchema = base.extend({
  code: z.string().trim().min(1, "Code is required."),
});

export const accountEditFormSchema = base;

export type AccountCreateFormValues = z.infer<typeof accountCreateFormSchema>;
export type AccountEditFormValues = z.infer<typeof accountEditFormSchema>;
