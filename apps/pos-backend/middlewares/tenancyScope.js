const createHttpError = require("http-errors");
const mongoose = require("mongoose");

/**
 * Ensures POS user has an organization and sets req.tenantOrganizationId.
 * Compares JWT claim to DB when both present.
 */
function requireTenantOrganization(options = {}) {
  const { strictTokenMatch = true } = options;
  return async (req, res, next) => {
    try {
      const orgId = req.user?.organization;
      if (!orgId) {
        return next(
          createHttpError(403, "User is not assigned to an organization.")
        );
      }
      const oid = orgId._id ? orgId._id : orgId;
      const idStr = String(oid);

      if (req.organizationIdFromToken && strictTokenMatch) {
        if (String(req.organizationIdFromToken) !== idStr) {
          return next(
            createHttpError(403, "Token organization does not match user.")
          );
        }
      }

      req.tenantOrganizationId = new mongoose.Types.ObjectId(idStr);
      next();
    } catch (e) {
      next(e);
    }
  };
}

function optionalTenantOrganization(req, res, next) {
  const orgId = req.user?.organization;
  if (orgId) {
    const oid = orgId._id ? orgId._id : orgId;
    req.tenantOrganizationId =
      oid instanceof mongoose.Types.ObjectId
        ? oid
        : new mongoose.Types.ObjectId(String(oid));
  }
  next();
}

module.exports = { requireTenantOrganization, optionalTenantOrganization };
