const createHttpError = require("http-errors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const PlatformUser = require("../models/platformUserModel");
const PlatformApiKey = require("../models/platformApiKeyModel");
const {
  issuePlatformTokenPair,
  verifyPlatformRefreshToken,
  toPlatformUserId,
} = require("../utils/platformAuthTokens");
const { writeAudit, auditFromRequest } = require("../services/platformAuditService");

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function clearPlatformAuthCookies(res) {
  const secure = isProduction();
  const cookieBase = {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  };
  res.clearCookie("platformAccessToken", cookieBase);
  res.clearCookie("platformRefreshToken", cookieBase);
}

function setPlatformAuthCookies(res, tokens) {
  const secure = isProduction();
  res.cookie("platformAccessToken", tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000, // 15 mins
    path: "/",
  });
  res.cookie("platformRefreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
}

function refreshTokenFromRequest(req) {
  const cookieToken = req.cookies?.platformRefreshToken;
  if (cookieToken) return cookieToken;
  if (isProduction()) return null;
  return req.body?.refreshToken || req.headers["x-refresh-token"] || null;
}

function tokenDebugResponse(tokens) {
  if (!isProduction()) {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
  return {};
}

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return next(createHttpError(400, "Email and password are required."));
    }
    const emailNorm = String(email).trim().toLowerCase();
    const user = await PlatformUser.findOne({ email: emailNorm }).select(
      "+passwordHash"
    );
    if (!user || user.status !== "active") {
      return next(createHttpError(401, "Invalid credentials."));
    }
    const ok = await user.comparePassword(password);
    if (!ok) {
      return next(createHttpError(401, "Invalid credentials."));
    }
    user.lastLoginAt = new Date();
    await user.save();
    const tokens = await issuePlatformTokenPair(user);
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.login",
      actorPlatformUser: user._id,
      actorType: "platform_user",
    });
    setPlatformAuthCookies(res, tokens);

    res.json({
      success: true,
      data: { user: user.toJSON() },
      ...tokenDebugResponse(tokens),
    });
  } catch (e) {
    next(e);
  }
};

const refresh = async (req, res, next) => {
  try {
    const token = refreshTokenFromRequest(req);
    if (!token) {
      return next(createHttpError(401, "Refresh token required."));
    }
    const payload = verifyPlatformRefreshToken(token);
    const id = toPlatformUserId(payload);
    const user = await PlatformUser.findById(id).select("+currentRefreshJti");
    if (!user) {
      return next(createHttpError(401, "Invalid refresh token."));
    }
    const tokenV = payload.v === undefined || payload.v === null ? 0 : Number(payload.v);
    const userV = Number(user.refreshTokenVersion) || 0;
    if (tokenV !== userV) {
      return next(createHttpError(401, "Invalid refresh token."));
    }
    if (user.currentRefreshJti !== payload.jti) {
      user.refreshTokenVersion = userV + 1;
      user.currentRefreshJti = null;
      await user.save();
      await writeAudit({
        ...auditFromRequest(req, res),
        action: "platform.refresh.reuse_suspected",
        actorPlatformUser: user._id,
        actorType: "platform_user",
        metadata: { presentedJtiPrefix: String(payload.jti || "").slice(0, 8) },
      });
      const err = createHttpError(401, "Refresh token reuse detected.");
      err.expose = true;
      err.code = "PLATFORM_REFRESH_REUSE";
      return next(err);
    }
    const tokens = await issuePlatformTokenPair(user);
    setPlatformAuthCookies(res, tokens);
    res.json({ success: true, ...tokenDebugResponse(tokens) });
  } catch (e) {
    next(createHttpError(401, "Invalid refresh token."));
  }
};

const logout = async (req, res, next) => {
  try {
    const token = refreshTokenFromRequest(req);
    if (token) {
      try {
        const payload = verifyPlatformRefreshToken(token);
        const user = await PlatformUser.findById(toPlatformUserId(payload)).select(
          "+refreshTokenVersion +currentRefreshJti"
        );
        if (user) {
          user.refreshTokenVersion = (Number(user.refreshTokenVersion) || 0) + 1;
          user.currentRefreshJti = null;
          await user.save();
          await writeAudit({
            ...auditFromRequest(req, res),
            action: "platform.logout",
            actorPlatformUser: user._id,
            actorType: "platform_user",
          });
        }
      } catch {
        // treat unknown/expired token as best-effort logout
      }
    }

    clearPlatformAuthCookies(res);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

const createApiKey = async (req, res, next) => {
  try {
    const { label, scopes } = req.body || {};
    const raw = `pk_live_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = await bcrypt.hash(raw, 10);
    const keyPrefix = raw.slice(0, 16);
    const doc = await PlatformApiKey.create({
      label: label || "",
      scopes: Array.isArray(scopes) && scopes.length ? scopes : ["org:read"],
      keyHash,
      keyPrefix,
      createdByPlatformUser: req.platformUser?._id || null,
    });
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.api_key.create",
      actorPlatformUser: req.platformUser?._id,
      metadata: { keyPrefix },
    });
    res.status(201).json({
      success: true,
      data: { id: doc._id, keyPrefix, apiKey: raw },
    });
  } catch (e) {
    next(e);
  }
};

const listApiKeys = async (req, res, next) => {
  try {
    const rows = await PlatformApiKey.find({ revokedAt: null })
      .select("label keyPrefix scopes createdAt lastUsedAt")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const me = async (req, res, next) => {
  try {
    if (!req.platformUser) {
      return next(createHttpError(401, "Unauthorized."));
    }
    res.json({ success: true, data: { user: req.platformUser.toJSON() } });
  } catch (e) {
    next(e);
  }
};

const revokeApiKey = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await PlatformApiKey.findById(id);
    if (!doc || doc.revokedAt) {
      return next(createHttpError(404, "API key not found."));
    }
    doc.revokedAt = new Date();
    await doc.save();
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.api_key.revoke",
      actorPlatformUser: req.platformUser?._id,
      metadata: { keyPrefix: doc.keyPrefix },
    });
    res.json({ success: true, data: { id: doc._id } });
  } catch (e) {
    next(e);
  }
};

module.exports = { login, refresh, logout, createApiKey, listApiKeys, me, revokeApiKey };
module.exports.__test = {
  isProduction,
  refreshTokenFromRequest,
  tokenDebugResponse,
};
