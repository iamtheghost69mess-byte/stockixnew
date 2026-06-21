/**
 * Effective RBAC role key for permission checks.
 * Optional `permissionRole` assigns a custom profile; otherwise `user.role`.
 */
function rbacRoleKey(user) {
  if (!user) return "";
  const custom = user.permissionRole != null && String(user.permissionRole).trim();
  if (custom) return String(custom).toLowerCase();
  return String(user.role || "").toLowerCase();
}

module.exports = { rbacRoleKey };
