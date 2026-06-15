export const ROLES = [
  "super_admin",
  "support_agent",
  "billing_manager",
  "read_only",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  read_only: 0,
  billing_manager: 1,
  support_agent: 2,
  super_admin: 3,
};
