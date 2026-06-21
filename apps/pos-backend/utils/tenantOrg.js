const mongoose = require("mongoose");
const createHttpError = require("http-errors");

/**
 * @param {import("mongoose").Document | { organization?: unknown } | null} user
 * @returns {import("mongoose").Types.ObjectId | null}
 */
function resolveOrganizationIdFromUser(user) {
  if (!user || user.organization == null) return null;
  const o = user.organization;
  if (o instanceof mongoose.Types.ObjectId) return o;
  if (o && typeof o === "object" && o._id != null) {
    return o._id instanceof mongoose.Types.ObjectId
      ? o._id
      : new mongoose.Types.ObjectId(String(o._id));
  }
  if (mongoose.Types.ObjectId.isValid(String(o))) {
    return new mongoose.Types.ObjectId(String(o));
  }
  return null;
}

/**
 * @param {import("express").Request} req
 * @returns {import("mongoose").Types.ObjectId}
 */
function assertTenantOrganization(req) {
  const id = req.tenantOrganizationId;
  if (!id) {
    throw createHttpError(403, "User is not assigned to an organization.");
  }
  return id;
}

module.exports = { resolveOrganizationIdFromUser, assertTenantOrganization };
