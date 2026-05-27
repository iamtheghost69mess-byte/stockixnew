"use strict";

/**
 * Node test runner hook: isolate unit tests from local Redis/Mongo in .env.
 * Loaded via `node --import ./tests/register-process-teardown.cjs`.
 */
if (process.env.NODE_ENV === "test" || process.env.CI === "true") {
  if (process.env.RUN_RBAC_ORG_ISOLATION !== "1") {
    process.env.REDIS_URL = "";
  }
  if (process.env.RUN_POS_INTEGRATION_MONGO !== "1") {
    delete process.env.MONGODB_URI;
  }
}

const mongoose = require("mongoose");

async function teardown() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  try {
    const reveal = require("../services/bootstrapCredentialReveal");
    reveal.__test?.resetClientForTests?.();
  } catch {
    /* ignore */
  }
}

process.on("beforeExit", () => {
  void teardown();
});

module.exports = {};
