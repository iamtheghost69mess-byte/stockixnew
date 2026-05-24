const createHttpError = require("http-errors");
const { canAccessOperation } = require("../services/rbacService");
const { rbacRoleKey } = require("../utils/rbacRoleKey");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

/**
 * Express middleware: require an @rbac/rbac operation (supports globs on role definitions).
 * Roles with "*" in their effective `can` list pass any check (see canAccessOperation).
 * Use after isVerifiedUser.
 */
function requirePermission(operation) {
  return async function requirePermissionMw(req, res, next) {
    try {
      const role = rbacRoleKey(req.user);
      if (!role) {
        return next(createHttpError(403, "Forbidden"));
      }
      const allowed = await canAccessOperation(
        role,
        operation,
        resolveOrganizationIdFromUser(req.user)
      );
      if (!allowed) {
        return next(
          createHttpError(403, "You do not have permission for this action.")
        );
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Pass if the user may perform any of the listed operations (RBAC). */
function requireAnyPermission(operations) {
  return async function requireAnyPermissionMw(req, res, next) {
    try {
      const role = rbacRoleKey(req.user);
      if (!role) {
        return next(createHttpError(403, "Forbidden"));
      }
      const orgId = resolveOrganizationIdFromUser(req.user);
      for (const operation of operations) {
        if (await canAccessOperation(role, operation, orgId)) {
          return next();
        }
      }
      return next(
        createHttpError(403, "You do not have permission for this action.")
      );
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { requirePermission, requireAnyPermission };
