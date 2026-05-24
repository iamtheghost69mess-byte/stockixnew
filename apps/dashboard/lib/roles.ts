import type { Role } from "@repo/shared/roles";

export { ROLES, ROLE_RANK, type Role } from "@repo/shared/roles";

export const ROLE = {
  SUPER_ADMIN: "super_admin",
  SUPPORT_AGENT: "support_agent",
  BILLING_MANAGER: "billing_manager",
  READ_ONLY: "read_only",
} as const;

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  support_agent: "Support Agent",
  billing_manager: "Billing Manager",
  read_only: "Read Only",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin:
    "Full access to all features including billing, deletion, and admin management",
  support_agent:
    "Can view and manage tenants, trigger provisioning and sync. Cannot access billing or delete data.",
  billing_manager:
    "Billing section access only. Cannot manage tenants or admin users.",
  read_only:
    "View-only access across the dashboard. Cannot perform any write actions.",
};
