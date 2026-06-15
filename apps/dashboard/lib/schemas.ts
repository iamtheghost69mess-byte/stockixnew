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

export const inviteOwnerSchema = z
  .object({
    email: z.string().email("Must be a valid email address"),
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters"),
    roleId: z.string().uuid().optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((data) => Boolean(data.roleId || data.role), {
    message: "Please select a role",
    path: ["roleId"],
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

/** Same rules as create org (Unicode, reserved names, length). */
export const renameOrgSchema = z.object({
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
export type RenameOrgValues = z.infer<typeof renameOrgSchema>;

/** Assign unassigned license to a tenant (`notes` reserved for future API use). */
export const assignLicenseSchema = z.object({
  tenantId: z
    .string()
    .min(1, "Please select a tenant")
    .uuid("Please select a valid tenant"),
  notes: z.string().max(500, "Notes must be at most 500 characters").optional(),
});
export type AssignLicenseValues = z.infer<typeof assignLicenseSchema>;

const licenseModuleSchema = z.enum(["accounting", "pos", "pms", "chat"]);

export const generateLicenseSchema = z
  .object({
    product: z.enum(["platform", "pos_desktop", "bundle"]),
    planSlug: z.string().min(1, "Please select a plan"),
    modules: z
      .array(licenseModuleSchema)
      .min(1, "Select at least one module"),
    term: z.enum(["perpetual", "fixed"]),
    expiresAt: z.string().optional(),
    maxActivations: z
      .number()
      .int()
      .min(1, "Must allow at least 1 activation")
      .max(50, "Must allow at most 50 activations"),
    gracePeriodDays: z
      .number()
      .int()
      .min(0, "Grace period cannot be negative")
      .max(365),
    notes: z
      .string()
      .max(500, "Notes must be at most 500 characters")
      .optional(),
    count: z.number().int().min(1, "Count must be at least 1").max(100, "Count must be at most 100"),
    validFrom: z.string().datetime().optional(),
  })
  .refine((data) => data.term === "perpetual" || Boolean(data.expiresAt?.trim()), {
    message: "Expiry date is required for fixed term licenses",
    path: ["expiresAt"],
  });
export type GenerateLicenseValues = z.infer<typeof generateLicenseSchema>;

const planBillingInterval = z.enum(["monthly", "annually", "one_time", "custom"]);

export const planSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be at most 50 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase letters, numbers, and hyphens only",
    ),
  description: z.string().max(500, "Description must be at most 500 characters").optional(),
  maxOrganizations: z.coerce.number().int().min(-1, "Use -1 for unlimited").max(9999),
  maxActivations: z.coerce.number().int().min(1, "Must allow at least 1 activation").max(9999),
  maxUsers: z.coerce.number().int().min(1, "Must allow at least 1 user").max(9999),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  priceMonthly: z.coerce.number().int().min(0).optional(),
  priceAnnually: z.coerce.number().int().min(0).optional(),
  currency: z.string().length(3, "Use a 3-letter ISO 4217 code"),
  billingInterval: planBillingInterval.optional(),
  isPublic: z.boolean(),
  featuresText: z.string().max(5000).optional(),
});
export type PlanValues = z.infer<typeof planSchema>;

/** Edit plan: same fields as {@link planSchema} except slug (immutable FK). */
export const planEditSchema = planSchema.omit({ slug: true });
export type PlanEditValues = z.infer<typeof planEditSchema>;

export const pmsStaffCreateSchema = z.object({
  name: z.string().min(1, "Full name is required").max(120),
  role: z.enum(["receptionist", "manager", "housekeeping", "maintenance"]),
  email: z.union([z.literal(""), z.string().email("Invalid email")]),
});
export type PmsStaffCreateValues = z.infer<typeof pmsStaffCreateSchema>;

export const pmsStaffInviteSchema = z.object({
  propertyId: z.string().min(1, "Property UUID is required"),
  expiresInDays: z.coerce.number().int().min(1, "At least 1 day").max(90, "At most 90 days"),
});
export type PmsStaffInviteValues = z.infer<typeof pmsStaffInviteSchema>;

export const pmsRoomCreateSchema = z.object({
  name: z.string().min(1, "Room name is required"),
  type: z.string().min(1, "Type is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  rateCents: z.coerce.number().int().min(0, "Rate cannot be negative"),
});
export type PmsRoomCreateValues = z.infer<typeof pmsRoomCreateSchema>;
