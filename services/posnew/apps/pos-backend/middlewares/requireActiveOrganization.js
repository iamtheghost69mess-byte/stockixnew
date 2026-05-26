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
      "licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt timezone lifecycle licenseKey licenseKeyFormat acceptStkxUntil stockixTenantId scopedLocationId",
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
    locationId:
      context.locationId ??
      (org.scopedLocationId ? String(org.scopedLocationId) : null),
  });

  if (org?.licenseKey) {
    const config = require("../config/config");
    const { assertLicenseKeyForLocation } = require("../services/stxiLicenseValidate");
    const locationId =
      context.locationId ??
      (org.scopedLocationId ? String(org.scopedLocationId) : null);
    const keyCheck = assertLicenseKeyForLocation({
      licenseKey: org.licenseKey,
      stockixTenantId: org.stockixTenantId || config.stockixTenantId,
      locationId,
      signingSecret: config.licenseSigningSecret || process.env.LICENSE_SIGNING_SECRET || "",
      acceptStkxUntil: org.acceptStkxUntil,
    });
    if (!keyCheck.ok) {
      const messages = {
        license_key_location_required: "A terminal location is required to validate this license key.",
        license_key_invalid: "License key is not valid for this location.",
        license_key_deprecated: "Legacy license key is no longer accepted.",
      };
      const err = createHttpError(
        403,
        messages[keyCheck.code] || "License key is not valid for this location.",
      );
      err.code = keyCheck.code;
      throw err;
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
      locationId:
        req.locationId ??
        req.locationScopeId?.toString?.() ??
        null,
    });
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireActiveOrganization, enforceActiveOrganizationById };
