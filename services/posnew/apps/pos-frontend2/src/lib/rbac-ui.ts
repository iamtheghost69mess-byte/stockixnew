/**
 * Client-side helpers for RBAC config UI (mirrors @rbac/rbac glob semantics loosely).
 * Catalog permission ids only (no "*" in sets).
 */

export type RbacPermissionRow = {
  id: string;
  label: string;
  group?: string;
};

export function patternCoversPermission(pattern: string, permId: string): boolean {
  if (pattern === "*") return true;
  if (pattern === permId) return true;
  if (typeof pattern !== "string" || typeof permId !== "string") return false;
  if (pattern.endsWith(".*")) {
    const stem = pattern.slice(0, -2);
    return permId === stem || permId.startsWith(`${stem}.`);
  }
  return false;
}

export function expandCanToIdSet(canList: string[] | undefined, catalogIds: string[]): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(canList)) return set;
  for (const id of catalogIds) {
    for (const p of canList) {
      if (patternCoversPermission(p, id)) {
        set.add(id);
        break;
      }
    }
  }
  return set;
}

export function idSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Stable sorted explicit permission list for API */
export function idSetToCanArray(set: Set<string>): string[] {
  return Array.from(set).sort((x, y) => x.localeCompare(y));
}

export function mergeBuiltinEffective(
  defaults: Record<string, { can?: string[] }> | undefined,
  builtinOverrides: Record<string, { can?: string[] }> | undefined,
  roleKey: string,
): string[] {
  const o = builtinOverrides?.[roleKey];
  if (o && Array.isArray(o.can)) return o.can;
  return defaults?.[roleKey]?.can ?? [];
}

export function groupPermissions(permissions: RbacPermissionRow[]): Map<string, RbacPermissionRow[]> {
  const groups = new Map<string, RbacPermissionRow[]>();
  for (const p of permissions) {
    if (p.id === "*") continue;
    const g = p.group || "other";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)?.push(p);
  }
  return groups;
}

export const BUILTIN_GROUP_LABELS: Record<string, string> = {
  system: "System",
  floor: "Floor & POS",
  kitchen: "Kitchen",
  backoffice: "Back office",
  admin: "Administration",
  other: "Other",
};

/** Short UI label for the type of access (not a second permission system). */
export function permissionAccessType(id: string): string {
  if (id === "*") return "Full";
  if (id.endsWith(".*")) return "Scope";
  if (id.endsWith(".read_all")) return "View all";
  if (id.endsWith(".read")) return "View";
  if (id.endsWith(".write")) return "Manage";
  if (id.endsWith(".create")) return "Create";
  if (id.endsWith(".update")) return "Edit";
  if (id.endsWith(".cancel")) return "Remove";
  if (id.endsWith(".transfer")) return "Move";
  if (id.endsWith(".use")) return "Use";
  if (id.includes("rbac.manage")) return "Configure";
  return "Access";
}
