const createHttpError = require("http-errors");

/**
 * Requires a concrete location scope for back-office routes.
 * Allows `X-Location-Id: all` only when route opts in (`req.allowAllLocations = true`).
 */
function locationMiddleware(req, _res, next) {
  const header = String(req.get("X-Location-Id") || "").trim().toLowerCase();
  if (header === "all") {
    if (!req.allowAllLocations) {
      return next(createHttpError(403, "All locations scope is not allowed here."));
    }
    req.locationScopeAll = true;
    req.locationId = "all";
    return next();
  }
  if (!req.locationScopeId) {
    return next(createHttpError(400, "Location context required"));
  }
  req.locationId = String(req.locationScopeId);
  return next();
}

module.exports = { locationMiddleware };

