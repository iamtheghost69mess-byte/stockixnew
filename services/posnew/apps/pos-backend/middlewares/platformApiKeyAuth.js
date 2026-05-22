const createHttpError = require("http-errors");
const bcrypt = require("bcrypt");
const PlatformApiKey = require("../models/platformApiKeyModel");

async function platformApiKeyAuth(req, res, next) {
  try {
    const raw = req.headers["x-api-key"];
    if (!raw || String(raw).length < 10) {
      return next(createHttpError(401, "API key required."));
    }

    const prefix = String(raw).slice(0, 16);
    const candidates = await PlatformApiKey.find({
      keyPrefix: prefix,
      revokedAt: null,
    })
      .select("+keyHash")
      .limit(5)
      .lean();

    let matched = null;
    for (const c of candidates) {
      if (await bcrypt.compare(String(raw), c.keyHash)) {
        matched = c;
        break;
      }
    }
    if (!matched) {
      return next(createHttpError(401, "Invalid API key."));
    }

    await PlatformApiKey.updateOne(
      { _id: matched._id },
      { $set: { lastUsedAt: new Date() } }
    );

    req.platformApiKeyDoc = matched;
    req.platformAuth = {
      kind: "api_key",
      apiKeyId: matched._id,
      scopes: matched.scopes || [],
      keyPrefix: matched.keyPrefix,
    };
    req.platformUser = null;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { platformApiKeyAuth };
