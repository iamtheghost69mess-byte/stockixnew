const createHttpError = require("http-errors");

function requirePlatformUserJwt(req, res, next) {
  if (!req.platformUser) {
    return next(
      createHttpError(403, "This action requires a platform user JWT (not API key).")
    );
  }
  next();
}

module.exports = { requirePlatformUserJwt };
