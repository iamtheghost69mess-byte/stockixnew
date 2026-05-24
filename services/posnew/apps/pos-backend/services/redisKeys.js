/**
 * Central prefix for Redis keys that should be isolated per tenant organization.
 * @param {string|import("mongoose").Types.ObjectId|null|undefined} orgId
 * @param {string} suffix
 */
function orgScopedKey(orgId, suffix) {
  if (orgId == null || orgId === "") {
    return suffix;
  }
  return `org:${String(orgId)}:${suffix}`;
}

module.exports = { orgScopedKey };
