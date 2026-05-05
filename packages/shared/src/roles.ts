export const ROLES = [
  "super_admin",
  "support_agent",
  "billing_manager",
  "read_only",
] as const;

export type Role = (typeof ROLES)[number];
