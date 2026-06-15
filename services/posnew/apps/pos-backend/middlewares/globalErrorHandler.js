const config = require("../config/config");
const { captureError } = require("../services/observability");

function wantsProblemJson(req) {
  const url = req.originalUrl || req.url || "";
  const acc = req.get("Accept") || "";
  return (
    url.startsWith("/api/platform/v1") ||
    acc.includes("application/problem+json")
  );
}

const globalErrorHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (statusCode >= 500) {
    captureError(err, {
      requestId: res.locals?.requestId,
      organizationId: req?.tenantOrganizationId || req?.user?.organization,
    });
  }

  if (typeof res.problem === "function" && wantsProblemJson(req)) {
    const ext = {
      requestId: res?.locals?.requestId,
    };
    if (err.code) {
      ext.code = err.code;
    }
    if (config.nodeEnv === "development" && err.stack) {
      ext.stack = err.stack;
    }
    return res.problem(
      statusCode,
      err.type || "about:blank",
      message,
      message,
      ext
    );
  }

  const body = {
    success: false,
    message,
    requestId: res?.locals?.requestId,
    error: config.nodeEnv === "development" ? err.stack : undefined,
  };
  if (err.code) body.code = err.code;
  if (err.redirect) body.redirect = err.redirect;
  return res.status(statusCode).json(body);
};

module.exports = globalErrorHandler;
