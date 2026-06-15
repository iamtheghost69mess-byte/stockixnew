const { test } = require("node:test");
const assert = require("node:assert/strict");

const { __test } = require("../../controllers/platformAuthController");

test("refreshTokenFromRequest prefers cookie in production", () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const token = __test.refreshTokenFromRequest({
    cookies: { platformRefreshToken: "cookie-token" },
    body: { refreshToken: "body-token" },
    headers: { "x-refresh-token": "header-token" },
  });
  assert.equal(token, "cookie-token");
  process.env.NODE_ENV = previousEnv;
});

test("refreshTokenFromRequest blocks body/header fallback in production", () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const token = __test.refreshTokenFromRequest({
    cookies: {},
    body: { refreshToken: "body-token" },
    headers: { "x-refresh-token": "header-token" },
  });
  assert.equal(token, null);
  process.env.NODE_ENV = previousEnv;
});

test("refreshTokenFromRequest allows body fallback in development", () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const token = __test.refreshTokenFromRequest({
    cookies: {},
    body: { refreshToken: "body-token" },
    headers: {},
  });
  assert.equal(token, "body-token");
  process.env.NODE_ENV = previousEnv;
});
