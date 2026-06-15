const mongoose = require("mongoose");

/**
 * Oldest Organization by _id, or DEFAULT_ORG_ID when set and valid.
 * Used by CLI seeds when no HTTP tenant context exists.
 */
async function resolveAnchorOrganizationId() {
  const Organization = require("../models/organizationModel");
  const envId = process.env.DEFAULT_ORG_ID;
  if (envId && mongoose.Types.ObjectId.isValid(String(envId))) {
    const o = await Organization.findById(envId).select("_id").lean();
    if (o) return o._id;
  }
  const first = await Organization.findOne().sort({ _id: 1 }).select("_id").lean();
  if (!first) {
    throw new Error(
      "No Organization found. Create an organization (or set DEFAULT_ORG_ID) before running this script."
    );
  }
  return first._id;
}

module.exports = { resolveAnchorOrganizationId };
