#!/usr/bin/env node
/**
 * Print cryptographically secure values for secret fields in root .env.
 * Usage: node scripts/generate-env-secrets.js
 */
const crypto = require("crypto");

function hex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function localPassword() {
  return `LocalDev@${hex(4)}`;
}

console.log("AUTH_TOKEN_SECRET=" + hex(64));
console.log("LICENSE_SIGNING_SECRET=" + hex(32));
console.log("DEPLOYMENT_SECRET_KEY=" + hex(32));
console.log("BOOTSTRAP_ADMIN_PASSWORD=" + localPassword());
console.log("PLATFORM_ADMIN_PASSWORD=" + localPassword());
console.log("POSTGRES_PASSWORD=" + localPassword());
console.log("WORKER_SECRET=" + hex(32));
console.log("SESSION_SECRET=" + hex(64));
console.log("PLATFORM_API_SECRET=" + hex(64));
