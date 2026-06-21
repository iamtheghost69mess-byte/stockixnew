const createHttpError = require("http-errors");
const Organization = require("../models/organizationModel");
const { readSubdomainSlug } = require("./posHostPatterns");

async function extractSubdomainOrg(req, _res, next) {
  try {
    const slug = readSubdomainSlug(req.hostname);
    if (!slug) {
      req.subdomainOrg = null;
      return next();
    }

    const organization = await Organization.findOne({ slug })
      .select(
        "_id slug name timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt"
      )
      .lean();
    if (!organization) {
      const error = createHttpError(404, "Organization not found.");
      error.code = "ORG_NOT_FOUND";
      return next(error);
    }
    req.subdomainOrg = organization;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  extractSubdomainOrg,
  readSubdomainSlug,
  matchesWildcardPosOrigin: require("./posHostPatterns").matchesWildcardPosOrigin,
};
