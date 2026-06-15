/** Minimal shape — avoids importing `pos-auth-user` (Turbopack-safe, no cycles). */
type StaffRoleCarrier = {
  /** Staff job title from the User document (admin, manager, waiter, …, hostess). */
  role?: string;
  /** Effective RBAC key (`permissionRole` when set, else `role`) — can differ from job title. */
  rbacRoleKey?: string;
} | null;

/**
 * Hostess floor shell: use **job title** `role`, not `rbacRoleKey` alone.
 * Otherwise a hostess with `permissionRole` set (e.g. waiter for inheritance) gets the full
 * sidebar and hits AccessGate → /unauthorized on other routes.
 */
export function isHostessUser(user: StaffRoleCarrier | undefined): boolean {
  if (!user) return false;
  const job = String(user.role ?? "")
    .toLowerCase()
    .trim();
  if (job === "hostess") return true;
  return (
    String(user.rbacRoleKey ?? "")
      .toLowerCase()
      .trim() === "hostess"
  );
}

/**
 * Job title only (staff `role` field). Use for floor/POS visibility: managers with
 * `rbacRoleKey` "hostess" still manage whether tables appear on Open POS.
 */
export function isHostessJobTitle(user: StaffRoleCarrier | undefined): boolean {
  if (!user) return false;
  return (
    String(user.role ?? "")
      .toLowerCase()
      .trim() === "hostess"
  );
}
