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
    .select(
      "licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt timezone lifecycle licenseKey licenseKeyFormat acceptStkxUntil stockixTenantId",
    )
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
    locationId: context.locationId,
  });

  if (org?.licenseKey) {
    const config = require("../config/config");
    const { assertLicenseKeyForLocation } = require("../services/stxiLicenseValidate");
    const keyCheck = assertLicenseKeyForLocation({
      licenseKey: org.licenseKey,
      stockixTenantId: org.stockixTenantId || config.stockixTenantId,
      locationId: context.locationId,
      signingSecret: config.licenseSigningSecret || process.env.LICENSE_SIGNING_SECRET || "",
      acceptStkxUntil: org.acceptStkxUntil,
    });
    if (!keyCheck.ok) {
      const createHttpError = require("http-errors");
      throw createHttpError(403, "License key is not valid for this location.", keyCheck.code);
    }
  }
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
