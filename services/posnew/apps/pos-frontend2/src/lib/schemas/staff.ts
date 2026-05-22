import { z } from "zod";

const roleEnum = z.enum(["admin", "manager", "waiter", "kitchen", "cashier", "hostess"]);

/**
 * PIN: empty string means "unchanged" on edit; on create, submit handler requires a value.
 * When provided, must be 4–6 digits.
 */
export const posStaffFormSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters.")
      .max(30, "Username must be at most 30 characters.")
      .regex(/^[a-zA-Z0-9_-]+$/, "Username can only use letters, numbers, underscores, or hyphens."),
    phone: z.string(),
    email: z.string(),
    pin: z.string().refine((v) => v === "" || /^\d{4,6}$/.test(v), {
      message: "PIN must be 4 to 6 digits when provided.",
    }),
    role: roleEnum,
    permissionRole: z.string().optional(),
    locationIds: z.array(z.string()).optional(),
    primaryLocationId: z.string().optional(),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const e = data.email.trim();
    if (e !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Enter a valid email or leave empty.",
      });
    }
  });

export type PosStaffFormData = z.infer<typeof posStaffFormSchema>;

/** Alias for older imports that used `buildPosStaffSchema` (same schema instance). */
export const buildPosStaffSchema = posStaffFormSchema;
