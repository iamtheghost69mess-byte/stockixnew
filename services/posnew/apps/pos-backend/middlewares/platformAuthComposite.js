const { platformJwtAuth } = require("./platformJwtAuth");
const { platformApiKeyAuth } = require("./platformApiKeyAuth");

/**
 * Accept platform JWT **or** `X-Api-Key`.
 */
function platformAuthComposite(req, res, next) {
  const hasBearer =
    req.headers.authorization &&
    String(req.headers.authorization).startsWith("Bearer ");
  const hasKey = Boolean(req.headers["x-api-key"]);
  if (hasBearer) return platformJwtAuth(req, res, next);
  if (hasKey) return platformApiKeyAuth(req, res, next);
  return platformJwtAuth(req, res, next);
}

module.exports = { platformAuthComposite };
