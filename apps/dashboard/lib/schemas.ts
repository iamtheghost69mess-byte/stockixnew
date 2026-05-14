import { z } from "zod";

import { ROLES } from "@/lib/roles";
import { validateOrganizationDisplayName } from "@/lib/validate-org-name";

export const tenantProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  adminFirstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name must be at most 50 characters"),
  adminLastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name must be at most 50 characters"),
  adminEmail: z.string().email("Must be a valid email address"),
});
export type TenantProfileValues = z.infer<typeof tenantProfileSchema>;

export const inviteOwnerSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  role: z.enum(ROLES, {
    required_error: "Please select a role",
  }),
});
export type InviteOwnerValues = z.infer<typeof inviteOwnerSchema>;

/**
 * Delegates to `validateOrganizationDisplayName` to keep the
 * client-side Unicode + reserved-word rules in one place.
 */
export const createOrgSchema = z.object({
  name: z
    .string()
    .min(1, "Organization name is required")
    .superRefine((value, ctx) => {
      const err = validateOrganizationDisplayName(value);
      if (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
      }
    }),
});
export type CreateOrgValues = z.infer<typeof createOrgSchema>;

export const generateLicenseSchema = z
  .object({
    product: z.enum(["platform", "pos_desktop", "bundle"]),
    planSlug: z.string().min(1, "Please select a plan"),
    term: z.enum(["perpetual", "fixed"]),
    expiresAt: z.string().optional(),
    maxActivations: z
      .number()
      .int()
      .min(1, "Must allow at least 1 activation")
      .max(9999),
    gracePeriodDays: z
      .number()
      .int()
      .min(0, "Grace period cannot be negative")
      .max(365),
    notes: z
      .string()
      .max(500, "Notes must be at most 500 characters")
      .optional(),
  })
  .refine((data) => data.term === "perpetual" || Boolean(data.expiresAt), {
    message: "Expiry date is required for fixed term licenses",
    path: ["expiresAt"],
  });
export type GenerateLicenseValues = z.infer<typeof generateLicenseSchema>;
