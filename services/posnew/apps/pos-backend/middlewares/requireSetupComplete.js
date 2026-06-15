const createHttpError = require("http-errors");
const Organization = require("../models/organizationModel");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

async function requireSetupComplete(req, _res, next) {
  try {
    const url = String(req.originalUrl || req.url || "");
    if (
      url.startsWith("/api/v1/setup") ||
      url.startsWith("/api/auth") ||
      url.startsWith("/api/v1/auth") ||
      url.startsWith("/health") ||
      url.startsWith("/ready")
    ) {
      return next();
    }
    const orgId = req.tenantOrganizationId || resolveOrganizationIdFromUser(req.user);
    if (!orgId) return next();
    const org = await Organization.findById(orgId).select("isBootstrapped setupWizard").lean();
    if (!org) return next();
    if (!org.isBootstrapped) return next();
    if (org.setupWizard?.isComplete) return next();

    const err = createHttpError(403, "Setup wizard must be completed before using this feature.");
    err.code = "SETUP_REQUIRED";
    err.redirect = "/setup";
    return next(err);
  } catch (e) {
    return next(e);
  }
}

module.exports = { requireSetupComplete };
