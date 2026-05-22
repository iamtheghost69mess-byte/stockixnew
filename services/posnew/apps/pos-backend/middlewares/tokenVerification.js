const createHttpError = require("http-errors");
const User = require("../models/userModel");
const { PLATFORM_AUD } = require("../utils/platformAuthTokens");
const { POS_AUD, verifyAccessToken } = require("../utils/authTokens");

const isVerifiedUser = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
    if (!token) {
      token = req.cookies?.accessToken;
    }

    if (!token) {
      return next(createHttpError(401, "Please provide a token."));
    }

    const decodeToken = verifyAccessToken(token);

    if (decodeToken.aud === PLATFORM_AUD) {
      return next(
        createHttpError(401, "Wrong token type for POS routes (platform token rejected).")
      );
    }
    if (decodeToken.aud && decodeToken.aud !== POS_AUD) {
      return next(createHttpError(401, "Invalid token audience for POS."));
    }

    const user = await User.findById(decodeToken._id);
    if (!user) {
      return next(createHttpError(401, "User does not exist."));
    }

    const acct = String(user.status ?? "active").toLowerCase();
    if (acct === "suspended") {
      return next(createHttpError(403, "This account has been deactivated."));
    }

    req.user = user;
    if (decodeToken.organizationId) {
      req.organizationIdFromToken = decodeToken.organizationId;
    }
    next();
  } catch (error) {
    next(createHttpError(401, "Invalid or expired token."));
  }
};

/** Alias matching phases.md naming (`protect` = any authenticated user). */
const protect = isVerifiedUser;

module.exports = { isVerifiedUser, protect };
