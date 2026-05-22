const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = require("../config/config");

const POS_AUD = "pos";

/**
 * When `User.organization` is populated (Mongoose `.populate()`), the field is an
 * object `{ _id, ... }`. JWT `organizationId` must be the real id string, not
 * `String(object)` → `"[object Object]"` (which breaks `attachTenantOrganization`).
 * @param {unknown} orgField
 * @returns {import("mongoose").Types.ObjectId | string | undefined}
 */
function extractOrganizationIdForJwtPayload(orgField) {
  if (orgField == null || orgField === "") return undefined;
  if (typeof orgField === "object" && orgField._id != null) {
    return orgField._id;
  }
  return orgField;
}

function verifyWithSecrets(token, secrets) {
  let lastErr;
  for (const secret of secrets) {
    if (!secret) continue;
    try {
      return jwt.verify(token, secret);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("verify failed");
}

function signAccessToken(userId, organizationId) {
  const payload = {
    _id: userId,
    aud: POS_AUD,
  };
  if (organizationId) {
    payload.organizationId = String(organizationId);
  }
  return jwt.sign(payload, config.accessTokenSecret, {
    expiresIn: config.accessTokenExpiresIn,
  });
}

function signRefreshToken(userId, jti) {
  return jwt.sign({ _id: userId, jti, aud: POS_AUD }, config.refreshTokenSecret, {
    expiresIn: config.refreshTokenExpiresIn,
  });
}

/**
 * Persists a new refresh jti on the user and returns JWT pair + cookie durations.
 */
async function issueTokenPair(userDoc) {
  const jti = crypto.randomBytes(32).toString("hex");
  userDoc.currentRefreshJti = jti;
  await userDoc.save();

  const orgId = extractOrganizationIdForJwtPayload(userDoc.organization);
  return {
    accessToken: signAccessToken(userDoc._id, orgId),
    refreshToken: signRefreshToken(userDoc._id, jti),
  };
}

function verifyRefreshToken(token) {
  return verifyWithSecrets(token, [
    config.refreshTokenSecret,
    config.refreshTokenSecretPrevious,
  ]);
}

function verifyAccessToken(token) {
  return verifyWithSecrets(token, [
    config.accessTokenSecret,
    config.accessTokenSecretPrevious,
  ]);
}

function signImpersonationAccessToken(userId, organizationId, platformUserId) {
  return jwt.sign(
    {
      _id: userId,
      aud: POS_AUD,
      organizationId: String(organizationId),
      impersonatedByPlatformUserId: String(platformUserId),
    },
    config.accessTokenSecret,
    { expiresIn: "15m" }
  );
}

module.exports = {
  POS_AUD,
  extractOrganizationIdForJwtPayload,
  signAccessToken,
  signRefreshToken,
  issueTokenPair,
  verifyRefreshToken,
  verifyAccessToken,
  signImpersonationAccessToken,
};
