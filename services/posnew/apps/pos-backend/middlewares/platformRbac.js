const createHttpError = require("http-errors");
const { hasPermission } = require("../constants/platformPermissions");

function requirePlatformPermission(...permissions) {
  const needed = permissions.length ? permissions : [];
  return (req, res, next) => {
    try {
      if (req.platformAuth?.kind === "api_key") {
        const apiScopes = req.platformAuth.scopes || [];
        for (const p of needed) {
          if (!apiScopes.includes(p) && !apiScopes.includes("*")) {
            return next(
              createHttpError(403, `API key missing required scope: ${p}`)
            );
          }
        }
        return next();
      }

      const roles = req.platformUser?.roles || [];
      for (const p of needed) {
        if (!hasPermission(roles, p, [])) {
          return next(createHttpError(403, `Missing permission: ${p}`));
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { requirePlatformPermission };
