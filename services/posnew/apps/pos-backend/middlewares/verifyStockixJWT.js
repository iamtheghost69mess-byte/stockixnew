const createHttpError = require("http-errors");
const { verifyStockixToken, hasModule } = require("@repo/auth");

const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET;

async function verifyStockixJWT(req, res, next) {
  const header = req.headers.authorization ?? "";
  const cookieToken = req.cookies?.["stockix-session"];
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : cookieToken;

  if (!token) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!AUTH_TOKEN_SECRET) {
    return next(createHttpError(500, "AUTH_TOKEN_SECRET is not configured"));
  }

  try {
    const payload = await verifyStockixToken(token, AUTH_TOKEN_SECRET);

    if (!hasModule(payload, "pos")) {
      return res.status(403).json({
        error: "module_not_licensed",
        message: "POS module not included in this license",
      });
    }

    req.stockix = payload;
    req.tenantId = payload.tenantId;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

module.exports = { verifyStockixJWT };
