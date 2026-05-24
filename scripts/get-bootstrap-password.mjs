#!/usr/bin/env node
/**
 * Derives the bootstrap admin password for a tenant slug.
 * Uses the same formula as the provisioning worker:
 *   HMAC-SHA256(
 *     key = SHA256(DEPLOYMENT_SECRET_KEY_raw),
 *     message = "bootstrap:" + slug
 *   ) → base64url
 *
 * Usage:
 *   node scripts/get-bootstrap-password.mjs <slug>
 *
 * Example:
 *   node scripts/get-bootstrap-password.mjs testfix03
 */

import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/get-bootstrap-password.mjs <slug>");
  process.exit(1);
}

// Load DEPLOYMENT_SECRET_KEY from root .env
const envPath = resolve(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf8");
const raw = envContent
  .split("\n")
  .find((l) => l.startsWith("DEPLOYMENT_SECRET_KEY="))
  ?.split("=")
  .slice(1)
  .join("=")
  .trim();

if (!raw || raw.length < 32) {
  console.error("DEPLOYMENT_SECRET_KEY missing or too short in .env");
  process.exit(1);
}

// Worker formula: SHA256(raw) → HMAC key
const hmacKey = createHash("sha256").update(raw).digest();
const password = createHmac("sha256", hmacKey)
  .update(`bootstrap:${slug}`, "utf8")
  .digest("base64url");

console.log(password);
