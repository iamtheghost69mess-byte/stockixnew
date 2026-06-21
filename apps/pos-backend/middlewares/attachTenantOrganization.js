const createHttpError = require("http-errors");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

/**
 * Sets `req.tenantOrganizationId` from the authenticated user.
 * Validates JWT `organizationId` claim when both are present.
 * Use after `isVerifiedUser` on tenant (POS) routes.
 */
function attachTenantOrganization(req, res, next) {
  try {
    req.tenantOrganizationId = resolveOrganizationIdFromUser(req.user);
    if (
      req.organizationIdFromToken &&
      req.tenantOrganizationId &&
      String(req.organizationIdFromToken) !== String(req.tenantOrganizationId)
    ) {
      return next(
        createHttpError(403, "Token organization does not match user.")
      );
    }
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { attachTenantOrganization };
