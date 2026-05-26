import type { Role } from "./roles.js";

/** Platform permission strings (owner dashboard + control-plane API). */
export const PERMISSIONS = [
  "tenants.read",
  "tenants.write",
  "tenants.provision",
  "licenses.read",
  "licenses.write",
  "licenses.extend",
  "licenses.suspend",
  "owners.manage",
  "plans.read",
  "plans.manage",
  "settings.access",
  "audit.read",
  "email_logs.read",
  "api_keys.manage",
  "roles.manage",
  "*",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (p) => p !== "*",
) as Permission[];

export function hasPermission(
  granted: readonly string[],
  required: string,
): boolean {
  if (granted.includes("*")) return true;
  return granted.includes(required);
}

export function hasAllPermissions(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  if (granted.includes("*")) return true;
  return required.every((p) => granted.includes(p));
}

/** Built-in role permission sets (match pre–custom-roles behavior). */
export const SYSTEM_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  read_only: [
    "tenants.read",
    "licenses.read",
    "plans.read",
  ],
  billing_manager: [
    "tenants.read",
    "licenses.read",
    "licenses.extend",
    "plans.read",
  ],
  support_agent: [
    "tenants.read",
    "tenants.write",
    "tenants.provision",
    "licenses.read",
    "licenses.write",
    "licenses.extend",
    "plans.read",
  ],
  super_admin: ["*"],
};

export function permissionsForRoleSlug(slug: string): readonly string[] {
  if (slug in SYSTEM_ROLE_PERMISSIONS) {
    return SYSTEM_ROLE_PERMISSIONS[slug as Role];
  }
  return [];
}

/** Compute legacy capability booleans for dashboard transition. */
export function capabilitiesFromPermissions(perms: readonly string[]) {
  const p = (x: string) => hasPermission(perms, x);
  return {
    canAccessSettings:
      p("*") || p("settings.access") || p("audit.read") || p("api_keys.manage"),
    canManageOwners: p("*") || p("owners.manage"),
    canManageTenants:
      p("*") || p("tenants.provision") || p("tenants.write"),
    canExtendLicenses: p("*") || p("licenses.extend"),
    canManagePlans: p("*") || p("plans.manage"),
    canReadPlans: p("*") || p("plans.read") || p("plans.manage"),
  };
}
