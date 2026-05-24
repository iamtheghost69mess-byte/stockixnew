const crypto = require("crypto");
const FeatureFlag = require("../models/featureFlagModel");

function stickyBucket(orgId, key) {
  const h = crypto.createHash("sha256").update(`${key}:${orgId}`).digest();
  return h.readUInt32BE(0) % 100;
}

async function evaluateFlag(key, organizationId) {
  const flag = await FeatureFlag.findOne({ key: String(key).toLowerCase() });
  if (!flag) return false;
  if (flag.killSwitch) return false;
  if (organizationId) {
    const ov = flag.orgOverrides.find(
      (o) => String(o.organization) === String(organizationId)
    );
    if (ov) return Boolean(ov.enabled);
    const b = stickyBucket(String(organizationId), flag.key);
    if (b < (flag.rolloutPercent || 0)) return true;
  }
  return Boolean(flag.defaultEnabled);
}

module.exports = { evaluateFlag, stickyBucket };
