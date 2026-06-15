/**
 * Load .env only outside production (compose injects env in prod stacks).
 */
function loadEnvIfDev(options) {
  if (process.env.NODE_ENV === "production") return;
  const dotenv = require("dotenv");
  dotenv.config(options);
}

module.exports = { loadEnvIfDev };
