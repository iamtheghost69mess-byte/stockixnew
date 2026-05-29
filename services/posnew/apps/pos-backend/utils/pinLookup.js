const crypto = require("node:crypto");
const config = require("../config/config");

function computePinLookup(plainPin) {
  const key = config.pinLookupHmacKey;
  if (!key) {
    throw new Error(
      "JWT_SECRET or PIN_LOOKUP_SECRET must be set for PIN authentication."
    );
  }
  return crypto
    .createHmac("sha256", key)
    .update(String(plainPin), "utf8")
    .digest("hex");
}

/** Alias for callers that pass organizationId; lookup hash stays PIN-only. */
function createPinLookup(plainPin, _organizationId) {
  return computePinLookup(plainPin);
}

module.exports = { computePinLookup, createPinLookup };
