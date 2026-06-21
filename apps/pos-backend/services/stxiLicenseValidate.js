/**
 * Validates STXI license keys against organization tenant + request location.
 * Legacy STKX keys pass when acceptStkxUntil is in the future (env on org).
 */

const STXI_PREFIX = "STXI";
const STKX_RE = /^STKX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

function tenantShortFromId(tenantId) {
  return String(tenantId).replace(/-/g, "").toUpperCase().slice(0, 6);
}

function locationShortFromId(locationId) {
  const raw = String(locationId).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (raw.length <= 6) return raw.padStart(4, "0");
  return raw.slice(-6);
}

function parseStxi(key) {
  const parts = String(key).trim().toUpperCase().split("-");
  if (parts.length !== 4 || parts[0] !== STXI_PREFIX) return null;
  return { tenantShort: parts[1], locationShort: parts[2], checksum: parts[3] };
}

function checksumFor(payload, secret) {
  const crypto = require("node:crypto");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 6).toUpperCase();
}

function validateStxi(key, { stockixTenantId, locationId, secret }) {
  const parsed = parseStxi(key);
  if (!parsed) return false;
  const t = tenantShortFromId(stockixTenantId);
  const l = locationShortFromId(locationId);
  if (parsed.tenantShort !== t || parsed.locationShort !== l) return false;
  const expected = checksumFor(`${parsed.tenantShort}:${parsed.locationShort}`, secret);
  return parsed.checksum === expected;
}

/**
 * @param {object} opts
 * @param {string} [opts.licenseKey]
 * @param {string} [opts.licenseKeyFormat]
 * @param {string} [opts.stockixTenantId]
 * @param {string} [opts.locationId]
 * @param {string} opts.signingSecret
 * @param {Date|null} [opts.acceptStkxUntil]
 */
function assertLicenseKeyForLocation(opts) {
  const key = opts.licenseKey?.trim();
  if (!key) return { ok: true };

  if (key.toUpperCase().startsWith(`${STXI_PREFIX}-`)) {
    if (!opts.stockixTenantId || !opts.locationId) {
      return { ok: false, code: "license_key_location_required" };
    }
    const valid = validateStxi(key, {
      stockixTenantId: opts.stockixTenantId,
      locationId: opts.locationId,
      secret: opts.signingSecret,
    });
    return valid
      ? { ok: true }
      : { ok: false, code: "license_key_invalid" };
  }

  if (STKX_RE.test(key)) {
    if (opts.acceptStkxUntil && new Date() > opts.acceptStkxUntil) {
      return { ok: false, code: "license_key_deprecated" };
    }
    return { ok: true };
  }

  return { ok: false, code: "license_key_invalid" };
}

module.exports = {
  assertLicenseKeyForLocation,
  validateStxi,
  parseStxi,
};
