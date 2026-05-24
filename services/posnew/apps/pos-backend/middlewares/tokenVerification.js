const createHttpError = require("http-errors");
const User = require("../models/userModel");
const { PLATFORM_AUD } = require("../utils/platformAuthTokens");
const { POS_AUD, verifyAccessToken } = require("../utils/authTokens");
const { verifyStockixJWT } = require("./verifyStockixJWT");

const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET;

/**
 * Authenticates tenant POS routes. Accepts Stockix product JWT (Jose) or legacy POS access tokens.
 */
const isVerifiedUser = async (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const cookieToken = req.cookies?.["stockix-session"];
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : cookieToken;

  if (!token) {
    return next(createHttpError(401, "Please provide a token."));
  }

  if (AUTH_TOKEN_SECRET && process.env.STOCKIX_JWT_ENABLED !== "0") {
    try {
      const { verifyStockixToken, hasModule } = require("@repo/auth");
      const payload = await verifyStockixToken(token, AUTH_TOKEN_SECRET);
      if (!hasModule(payload, "pos")) {
        return res.status(403).json({
          error: "module_not_licensed",
          message: "POS module not included in this license",
        });
      }
      req.stockix = payload;
      req.tenantId = payload.tenantId;
      req.organizationIdFromToken = payload.organizationId;
      return next();
    } catch {
      // Fall through to legacy POS JWT when not a Stockix token
    }
  }

  try {
    const decodeToken = verifyAccessToken(token);

    if (decodeToken.aud === PLATFORM_AUD) {
      return next(
        createHttpError(401, "Wrong token type for POS routes (platform token rejected)."),
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

module.exports = { isVerifiedUser, protect, verifyStockixJWT };
