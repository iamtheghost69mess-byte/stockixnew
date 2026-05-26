const createHttpError = require("http-errors");
const Organization = require("../models/organizationModel");
const { enforceOrganizationAccess } = require("../services/organizationAccessService");

/**
 * After `attachTenantOrganization`, rejects tenant API calls outside
 * the organization's configured license window.
 */
async function enforceActiveOrganizationById(orgId, context = {}) {
  if (!orgId) {
    throw createHttpError(403, "Organization is required.");
  }
  const org = await Organization.findById(orgId)
    .select("licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt timezone lifecycle")
    .lean();
  if (!org) {
    throw createHttpError(403, "Organization not found.");
  }
  await enforceOrganizationAccess(orgId, org, {
    actorType: context.actorType || "system",
    requestId: context.requestId,
    traceparent: context.traceparent,
    routeKey: context.routeKey || "tenant.requireActiveOrganization",
    useCache: true,
  });
}

async function requireActiveOrganization(req, res, next) {
  try {
    await enforceActiveOrganizationById(req.tenantOrganizationId, {
      actorType: "system",
      requestId: res.locals?.requestId,
      traceparent: res.locals?.traceparent,
      routeKey: "tenant.requireActiveOrganization",
    });
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireActiveOrganization, enforceActiveOrganizationById };
