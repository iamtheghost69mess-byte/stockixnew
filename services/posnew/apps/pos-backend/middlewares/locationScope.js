const mongoose = require("mongoose");
const createHttpError = require("http-errors");
const Location = require("../models/locationModel");

async function assertLocationInOrg(locationId, tenantOrgId) {
  if (!locationId || !tenantOrgId) return;
  const loc = await Location.findById(locationId).select("organization");
  if (!loc) {
    throw createHttpError(404, "Location not found.");
  }
  if (
    loc.organization &&
    String(loc.organization) !== String(tenantOrgId)
  ) {
    throw createHttpError(
      403,
      "Location does not belong to your organization."
    );
  }
}

/**
 * Sets req.locationScopeId (ObjectId | null).
 * Staff with a assigned `user.location` are always scoped to that branch.
 * Admin/manager without an assigned location may filter via `X-Location-Id` header;
 * omit the header to see all locations (“super” scope).
 * When `req.tenantOrganizationId` is set, location must belong to that org.
 */
async function locationScope(req, res, next) {
  try {
    const user = req.user;
    const tenantOrgId = req.tenantOrganizationId || null;

    if (!user) {
      req.locationScopeId = null;
      return next();
    }

    const assignedLocationIds = [
      ...(Array.isArray(user.locations)
        ? user.locations
            .map((value) =>
              value instanceof mongoose.Types.ObjectId
                ? String(value)
                : String(value?._id || value || "")
            )
            .filter((value) => mongoose.Types.ObjectId.isValid(value))
        : []),
      ...(user.location
        ? [
            user.location instanceof mongoose.Types.ObjectId
              ? String(user.location)
              : String(user.location?._id || user.location || ""),
          ].filter((value) => mongoose.Types.ObjectId.isValid(value))
        : []),
    ];
    const allowedAssigned = [...new Set(assignedLocationIds)];

    // Fallback scope from request header when user has no assigned location.
    // This allows custom/non-manager roles to operate in a selected branch.
    const h = req.get("X-Location-Id");
    if (String(h || "").trim().toLowerCase() === "all") {
      req.locationScopeId = null;
      return next();
    }
    if (h && mongoose.Types.ObjectId.isValid(h)) {
      if (allowedAssigned.length > 0 && !allowedAssigned.includes(String(h))) {
        return next(createHttpError(403, "Location not assigned to this staff account."));
      }
      req.locationScopeId = mongoose.Types.ObjectId.createFromHexString(h);
      if (tenantOrgId) {
        await assertLocationInOrg(req.locationScopeId, tenantOrgId);
      }
    } else if (allowedAssigned.length > 0) {
      req.locationScopeId = mongoose.Types.ObjectId.createFromHexString(allowedAssigned[0]);
      if (tenantOrgId) {
        await assertLocationInOrg(req.locationScopeId, tenantOrgId);
      }
    } else {
      req.locationScopeId = null;
    }
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { locationScope };
