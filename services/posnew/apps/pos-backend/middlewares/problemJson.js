/**
 * RFC 9457 Problem Details for HTTP APIs — attaches `res.problem` for JSON error bodies.
 */
function problemJsonMiddleware(_req, res, next) {
  res.problem = (status, type, title, detail, extensions = {}) => {
    const body = {
      type: type || "about:blank",
      title: title || "Error",
      status: status || 500,
      detail: detail || "",
      ...extensions,
    };
    res.status(body.status).type("application/problem+json").json(body);
  };
  next();
}

module.exports = { problemJsonMiddleware };
