const createHttpError = require("http-errors");
const { canAccessOperation } = require("../services/rbacService");
const { rbacRoleKey } = require("../utils/rbacRoleKey");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

/**
 * Same as {@link requireRoleOrPermission}: legacy job-title roles **or** effective
 * RBAC (`permissionRole` when set) may satisfy `permission`.
 *
 * @param {{ roles: readonly string[]; permission: string }} params
 * @returns {import("express").RequestHandler}
 */
function requireTenantRoleOrPermission({ roles, permission }) {
  return requireRoleOrPermission(roles, permission);
}

/**
 * Pass if `req.user.role` is one of `allowedRoles`, or if the effective RBAC key
 * (`permissionRole` or `role`) may perform `operation` (supports globs).
 *
 * @param {readonly string[]} allowedRoles
 * @param {string} operation
 */
function requireRoleOrPermission(allowedRoles, operation) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [];
  return async function requireRoleOrPermissionMw(req, res, next) {
    try {
      if (!req.user) {
        return next(createHttpError(401, "Not authenticated."));
      }
      if (roles.includes(req.user.role)) {
        return next();
      }
      const key = rbacRoleKey(req.user);
      if (!key) {
        return next(createHttpError(403, "Forbidden"));
      }
      const allowed = await canAccessOperation(
        key,
        operation,
        resolveOrganizationIdFromUser(req.user)
      );
      if (!allowed) {
        return next(
          createHttpError(403, "You do not have permission to perform this action.")
        );
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Admin or manager job title, or staff whose effective RBAC includes `backoffice.*`. */
const requireBackofficeStaff = requireRoleOrPermission(
  ["admin", "manager"],
  "backoffice.*"
);

/**
 * Pass if `req.user.role` is in `allowedRoles`, or effective RBAC allows any of `operations`.
 * @param {readonly string[]} allowedRoles
 * @param {readonly string[]} operations
 */
function requireAnyRoleOrPermission(allowedRoles, operations) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [];
  const ops = Array.isArray(operations) ? operations : [];
  return async function requireAnyRoleOrPermissionMw(req, res, next) {
    try {
      if (!req.user) {
        return next(createHttpError(401, "Not authenticated."));
      }
      if (roles.includes(req.user.role)) {
        return next();
      }
      const key = rbacRoleKey(req.user);
      if (!key) {
        return next(createHttpError(403, "Forbidden"));
      }
      const orgId = resolveOrganizationIdFromUser(req.user);
      for (const operation of ops) {
        if (await canAccessOperation(key, operation, orgId)) {
          return next();
        }
      }
      return next(
        createHttpError(403, "You do not have permission to perform this action.")
      );
    } catch (e) {
      next(e);
    }
  };
}

module.exports = {
  requireTenantRoleOrPermission,
  requireRoleOrPermission,
  requireBackofficeStaff,
  requireAnyRoleOrPermission,
};
