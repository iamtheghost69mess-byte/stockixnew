const createHttpError = require("http-errors");
const PlatformUser = require("../models/platformUserModel");
const { PLATFORM_AUD, verifyPlatformAccessToken, toPlatformUserId } = require(
  "../utils/platformAuthTokens"
);

async function platformJwtAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.cookies && req.cookies.platformAccessToken) {
      token = req.cookies.platformAccessToken;
    }
    if (!token) {
      return next(createHttpError(401, "Platform bearer token required."));
    }

    const payload = verifyPlatformAccessToken(token);
    if (payload.aud !== PLATFORM_AUD) {
      return next(createHttpError(401, "Invalid platform token audience."));
    }

    const id = toPlatformUserId(payload);
    const user = await PlatformUser.findById(id);
    if (!user || user.status !== "active") {
      return next(createHttpError(401, "Platform user not available."));
    }

    req.platformUser = user;
    req.platformAuth = { kind: "jwt", platformUserId: user._id };
    next();
  } catch (e) {
    next(createHttpError(401, "Invalid or expired platform token."));
  }
}

module.exports = { platformJwtAuth };
