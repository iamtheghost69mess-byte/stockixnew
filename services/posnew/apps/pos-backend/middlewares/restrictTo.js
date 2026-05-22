const createHttpError = require("http-errors");

const restrictTo = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(createHttpError(401, "Not authenticated."));
  }
  if (!roles.includes(req.user.role)) {
    return next(createHttpError(403, "You do not have permission to perform this action."));
  }
  next();
};

module.exports = { restrictTo };
