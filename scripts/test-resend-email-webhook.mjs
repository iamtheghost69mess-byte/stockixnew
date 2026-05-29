#!/usr/bin/env node
/**
 * Validates Resend email send + webhook pipeline.
 *
 * Usage:
 *   node scripts/test-resend-email-webhook.mjs
 *   node scripts/test-resend-email-webhook.mjs --api https://api.stockix.cloud
 *   node scripts/test-resend-email-webhook.mjs --env infra/prod/.env
 *
 * Requires MAIL_PASSWORD (re_*), MAIL_FROM_ADDRESS, RESEND_WEBHOOK_SECRET in env file.
 */
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {
    api: process.env.STOCKIX_API_URL ?? "http://127.0.0.1:4000",
    envFile: ".env",
    webhookOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--api" && argv[i + 1]) {
      out.api = argv[++i].replace(/\/$/, "");
    } else if (argv[i] === "--env" && argv[i + 1]) {
      out.envFile = argv[++i];
    } else if (argv[i] === "--webhook-only") {
      out.webhookOnly = true;
    }
  }
  return out;
}

function loadEnvFile(relPath) {
  const full = path.join(rootDir, relPath);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function signSvix(rawBody, secret) {
  const id = `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");
  const sig = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return { id, timestamp, signature: `v1,${sig}` };
}

function fail(msg, detail) {
  console.error(`\nFAIL: ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function pass(msg) {
  console.log(`OK: ${msg}`);
}

const { api, envFile, webhookOnly } = parseArgs(process.argv);
loadEnvFile(envFile);

const mailPassword = process.env.MAIL_PASSWORD?.trim() ?? "";
const fromAddress = process.env.MAIL_FROM_ADDRESS?.trim() ?? "";
const fromName = process.env.MAIL_FROM_NAME?.trim() || "Stockix";
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
const recipient =
  process.env.PLATFORM_ADMIN_EMAIL?.trim() || process.env.PROVISION_ADMIN_EMAIL?.trim() || "";

console.log("Stockix Resend pipeline test");
console.log("  env file:", envFile);
console.log("  API base:", api);
console.log("  recipient:", recipient || "(not set)");

let emailId = `test-${randomUUID()}`;

if (!webhookOnly) {
  if (!mailPassword.startsWith("re_")) {
    fail("MAIL_PASSWORD must be a Resend API key (re_…)");
  }
  if (!fromAddress) fail("MAIL_FROM_ADDRESS is not set");
  if (!recipient) fail("Set PLATFORM_ADMIN_EMAIL or PROVISION_ADMIN_EMAIL for test recipient");

  const sendBody = {
    from: `${fromName} <${fromAddress}>`,
    to: [recipient],
    subject: "Stockix Resend pipeline test",
    html: `<p>Pipeline test at ${new Date().toISOString()}</p>`,
  };

  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mailPassword}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sendBody),
  });
  const sendText = await sendRes.text();
  let sendJson;
  try {
    sendJson = JSON.parse(sendText);
  } catch {
    fail("Resend send returned non-JSON", sendText.slice(0, 300));
  }
  if (!sendRes.ok || !sendJson.id) {
    fail(`Resend send HTTP ${sendRes.status}`, sendJson.message ?? sendText.slice(0, 300));
  }
  emailId = sendJson.id;
  pass(`Resend API sent email id=${emailId}`);
} else {
  console.log("Skipping Resend send (--webhook-only)");
  if (!webhookSecret) fail("RESEND_WEBHOOK_SECRET required for signed webhook test");
}

// Webhook route on control-plane API
const webhookPayload = JSON.stringify({
  type: "email.delivered",
  data: { email_id: emailId },
});
const webhookUrl = `${api}/webhooks/resend`;
const webhookHeaders = { "Content-Type": "application/json" };
if (webhookSecret) {
  const svix = signSvix(webhookPayload, webhookSecret);
  webhookHeaders["svix-id"] = svix.id;
  webhookHeaders["svix-timestamp"] = svix.timestamp;
  webhookHeaders["svix-signature"] = svix.signature;
}

const hookRes = await fetch(webhookUrl, {
  method: "POST",
  headers: webhookHeaders,
  body: webhookPayload,
});
const hookText = await hookRes.text();
let hookJson;
try {
  hookJson = hookText ? JSON.parse(hookText) : {};
} catch {
  hookJson = { _raw: hookText };
}

if (hookRes.status === 404 && hookText === "404 Not Found") {
  fail(
    `POST ${webhookUrl} returned plain 404 — production API likely not deployed with /webhooks/resend. Redeploy api + api-bullmq.`,
    hookText,
  );
}
if (hookRes.status === 401) {
  const err = hookJson.error ?? hookText;
  if (err === "invalid_signature") {
    fail("Webhook signature rejected — RESEND_WEBHOOK_SECRET does not match Resend dashboard signing secret");
  }
  if (err === "Webhook not configured") {
    fail("RESEND_WEBHOOK_SECRET missing in production API container");
  }
  fail(`Webhook HTTP 401`, hookText.slice(0, 300));
}
if (!hookRes.ok) {
  fail(`Webhook HTTP ${hookRes.status}`, hookText.slice(0, 300));
}
pass(`Webhook accepted (${hookRes.status}) ${JSON.stringify(hookJson)}`);

// 3) Health mail block (when /health includes mail — current API)
const healthRes = await fetch(`${api}/health`);
if (healthRes.ok) {
  const health = await healthRes.json();
  if (health.mail) {
    if (health.mail.configured) pass("GET /health reports mail configured");
    else fail("GET /health reports mail NOT configured");
  } else {
    console.log("WARN: GET /health has no mail block — deploy newer API image for mail health");
  }
}

console.log("\nAll checks passed. Register Resend webhook URL in dashboard:");
console.log(`  ${api}/webhooks/resend`);
