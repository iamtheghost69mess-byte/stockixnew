/**
 * No DB: verifies JWT access + refresh sign/verify (Phase 1 token helpers).
 * Run: JWT_SECRET=testsecret node scripts/phase1-tokens-selftest.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "selftest-jwt-secret-min-32-chars!!";
delete process.env.JWT_REFRESH_SECRET;

const config = require("../config/config");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/authTokens");

if (!config.accessTokenSecret || !config.refreshTokenSecret) {
  console.error("Config missing secrets");
  process.exit(1);
}

const sub = "507f1f77bcf86cd799439011";
const jti = "test-jti";
const access = signAccessToken(sub);
const refresh = signRefreshToken(sub, jti);
const jwt = require("jsonwebtoken");
const a = jwt.verify(access, config.accessTokenSecret);
if (String(a._id) !== sub) throw new Error("access payload");

const r = verifyRefreshToken(refresh);
if (String(r._id) !== sub || r.jti !== jti) throw new Error("refresh payload");

console.log("phase1-tokens-selftest: OK");
