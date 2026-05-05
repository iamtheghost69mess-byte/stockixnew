export const ROLES = [
  "super_admin",
  "support_agent",
  "billing_manager",
  "read_only",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE = {
  SUPER_ADMIN: ROLES[0],
  SUPPORT_AGENT: ROLES[1],
  BILLING_MANAGER: ROLES[2],
  READ_ONLY: ROLES[3],
} as const;

export const ROLE_RANK: Record<Role, number> = {
  read_only: 0,
  billing_manager: 1,
  support_agent: 2,
  super_admin: 3,
};

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
