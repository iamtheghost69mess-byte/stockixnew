const rateLimit = require("express-rate-limit");
const { withRateLimitStore } = require("./rateLimitStore");

/**
 * Limits brute-force attempts on PIN / password login endpoints.
 */
const loginRateLimiter = rateLimit(
  withRateLimitStore(
    {
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: "Too many login attempts. Try again later.",
      },
    },
    "pos:login"
  )
);

module.exports = { loginRateLimiter };
