const crypto = require("crypto");

function signBodyHmacSha256(secret, rawBodyUtf8) {
  return crypto
    .createHmac("sha256", secret)
    .update(rawBodyUtf8, "utf8")
    .digest("hex");
}

module.exports = { signBodyHmacSha256 };
