const createHttpError = require("http-errors");
const Organization = require("../models/organizationModel");

/**
 * Blocks GL write operations when the org has `accountingRelayMode: true`.
 * In relay mode Finance (Bigcapital) owns the GL; POS must not double-post.
 * Place after `attachTenantOrganization` so `req.tenantOrganizationId` is set.
 */
async function requireAccountingDirectMode(req, res, next) {
  try {
    const orgId = req.tenantOrganizationId;
    if (!orgId) return next(createHttpError(403, "Organization is required."));

    const org = await Organization.findById(orgId).select("accountingRelayMode").lean();
    if (!org) return next(createHttpError(403, "Organization not found."));

    if (org.accountingRelayMode) {
      return next(
        createHttpError(
          403,
          "GL writes are disabled: this organization uses Finance relay mode. Use the Finance module to post accounting entries.",
        ),
      );
    }
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireAccountingDirectMode };
