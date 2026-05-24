const createHttpError = require("http-errors");
const Organization = require("../models/organizationModel");

const POS_ROOT_HOST = "pos.zerowix.cloud";
const POS_SUBDOMAIN_SUFFIX = `.pos.zerowix.cloud`;
const LOCALHOST_SUFFIX = ".localhost";

function readSubdomainSlug(hostname) {
  const normalizedHost = String(hostname || "").toLowerCase().trim();
  if (!normalizedHost) return null;
  if (normalizedHost === "localhost" || normalizedHost === "127.0.0.1") {
    return null;
  }
  if (normalizedHost.endsWith(LOCALHOST_SUFFIX)) {
    const prefix = normalizedHost.slice(
      0,
      normalizedHost.length - LOCALHOST_SUFFIX.length
    );
    if (!prefix || prefix.includes(".")) return null;
    return prefix;
  }
  if (normalizedHost === POS_ROOT_HOST) return null;
  if (!normalizedHost.endsWith(POS_SUBDOMAIN_SUFFIX)) return null;
  const prefix = normalizedHost.slice(
    0,
    normalizedHost.length - POS_SUBDOMAIN_SUFFIX.length
  );
  if (!prefix || prefix.includes(".")) return null;
  return prefix;
}

async function extractSubdomainOrg(req, _res, next) {
  try {
    const slug = readSubdomainSlug(req.hostname);
    if (!slug) {
      req.subdomainOrg = null;
      return next();
    }

    const organization = await Organization.findOne({ slug })
      .select("_id slug name timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt")
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

module.exports = { extractSubdomainOrg };
