const createHttpError = require("http-errors");
const { getOrganizationAccessState: computeOrganizationAccessState } = require("@restaurant-pos/domain-access");
const config = require("../config/config");

/**
 * @param {Record<string, any>} organization
 * @param {Date} [now]
 * @returns {{ status: "active" | "expired" | "not_started", reason: string, blocked: boolean }}
 */
function getOrganizationAccessState(organization, now = new Date()) {
  return computeOrganizationAccessState({
    licenseStartDate: organization?.licenseStartDate ?? organization?.licenseStartsAt ?? null,
    licenseEndDate: organization?.licenseEndDate ?? organization?.licenseEndsAt ?? null,
    timezone: organization?.timezone ?? null,
    lifecycle: organization?.lifecycle ?? null,
    now,
  });
}

/**
 * @param {Record<string, any>} organization
 * @param {Date} [now]
 * @returns {{ok: boolean, code: string | null, message: string}}
 */
function evaluateLicenseWindow(organization, now = new Date()) {
  const state = getOrganizationAccessState(organization, now);
  const code =
    state.status === "active"
      ? null
      : state.reason.includes("not configured")
      ? "LICENSE_WINDOW_MISSING"
      : state.status === "not_started"
      ? "LICENSE_NOT_STARTED"
      : "LICENSE_EXPIRED";
  return {
    ok: !state.blocked,
    code,
    message: state.blocked ? state.reason : "",
  };
}

/**
 * @param {{ organization: Record<string, any>, requestId?: string, routeKey?: string }} input
 */
function enforceOrShadowLicenseWindow(input) {
  const result = evaluateLicenseWindow(input.organization);
  if (result.ok) return;
  if (config.licenseEnforcementMode === "shadow") {
    // eslint-disable-next-line no-console
    console.warn(
      `[license-shadow] blocked=${result.code} requestId=${input.requestId || ""} route=${input.routeKey || ""}`
    );
    return;
  }
  const err = createHttpError(403, result.message);
  err.code = result.code;
  throw err;
}

module.exports = {
  getOrganizationAccessState,
  evaluateLicenseWindow,
  enforceOrShadowLicenseWindow,
};
