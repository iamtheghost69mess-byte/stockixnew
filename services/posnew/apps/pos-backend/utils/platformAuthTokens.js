const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = require("../config/config");

const POS_AUD = "pos";
const PLATFORM_AUD = "platform";

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

function signPlatformAccessToken(platformUserId) {
  if (!config.platformAccessTokenSecret) {
    throw new Error("PLATFORM_JWT_SECRET is not configured.");
  }
  return jwt.sign(
    {
      sub: String(platformUserId),
      aud: PLATFORM_AUD,
    },
    config.platformAccessTokenSecret,
    { expiresIn: config.platformAccessTokenExpiresIn }
  );
}

function signPlatformRefreshToken(platformUserId, jti, refreshTokenVersion = 0) {
  if (!config.platformRefreshTokenSecret) {
    throw new Error("PLATFORM_JWT_REFRESH_SECRET is not configured.");
  }
  return jwt.sign(
    {
      sub: String(platformUserId),
      jti,
      aud: PLATFORM_AUD,
      v: Number(refreshTokenVersion) || 0,
    },
    config.platformRefreshTokenSecret,
    { expiresIn: config.platformRefreshTokenExpiresIn }
  );
}

async function issuePlatformTokenPair(platformUserDoc) {
  const jti = crypto.randomBytes(32).toString("hex");
  const v = Number(platformUserDoc.refreshTokenVersion) || 0;
  platformUserDoc.currentRefreshJti = jti;
  await platformUserDoc.save();
  return {
    accessToken: signPlatformAccessToken(platformUserDoc._id),
    refreshToken: signPlatformRefreshToken(platformUserDoc._id, jti, v),
  };
}

function toPlatformUserId(payload) {
  return payload.sub || payload._id;
}

function verifyPlatformRefreshToken(token) {
  return verifyWithSecrets(token, [
    config.platformRefreshTokenSecret,
    config.platformRefreshTokenSecretPrevious,
  ]);
}

function verifyPlatformAccessToken(token) {
  return verifyWithSecrets(token, [
    config.platformAccessTokenSecret,
    config.platformAccessTokenSecretPrevious,
  ]);
}

module.exports = {
  POS_AUD,
  PLATFORM_AUD,
  signPlatformAccessToken,
  signPlatformRefreshToken,
  issuePlatformTokenPair,
  verifyPlatformRefreshToken,
  verifyPlatformAccessToken,
  toPlatformUserId,
};
