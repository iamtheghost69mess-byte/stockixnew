#!/usr/bin/env node
/**
 * Replay a Resend webhook against your LOCAL API (production-like Svix signature).
 *
 * Usage:
 *   node scripts/replay-resend-webhook.mjs
 *   node scripts/replay-resend-webhook.mjs --env infra/prod/.env
 *   node scripts/replay-resend-webhook.mjs --api http://127.0.0.1:4000 --email-id <uuid>
 *
 * Paste a payload from Resend dashboard → Webhooks → event → Message payload, or use --email-id.
 */
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function signSvix(rawBody, secret, msgId) {
  const id = msgId ?? `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");
  const sig = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return { id, timestamp, signature: `v1,${sig}` };
}

const args = process.argv.slice(2);
let api = "http://127.0.0.1:4000";
let envFile = ".env.local";
let emailId = "c2532767-fff3-4b30-8f85-32cb2aa6271b";
let eventType = "email.delivered";
let payloadFile = null;
let msgId = "msg_3EJFWug7bc0t9oYlAhIAYD6EOml";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--api" && args[i + 1]) api = args[++i].replace(/\/$/, "");
  else if (args[i] === "--env" && args[i + 1]) envFile = args[++i];
  else if (args[i] === "--email-id" && args[i + 1]) emailId = args[++i];
  else if (args[i] === "--type" && args[i + 1]) eventType = args[++i];
  else if (args[i] === "--msg-id" && args[i + 1]) msgId = args[++i];
  else if (args[i] === "--payload" && args[i + 1]) payloadFile = args[++i];
}

loadEnvFile(envFile);
if (!process.env.RESEND_WEBHOOK_SECRET) loadEnvFile("infra/prod/.env");
if (!process.env.RESEND_WEBHOOK_SECRET) loadEnvFile(".env");

const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
if (!secret) {
  console.error("RESEND_WEBHOOK_SECRET not found. Use --env infra/prod/.env or set in .env.local");
  process.exit(1);
}

let payload;
if (payloadFile) {
  payload = JSON.parse(fs.readFileSync(path.resolve(payloadFile), "utf8"));
} else {
  payload = {
    created_at: new Date().toISOString(),
    type: eventType,
    data: {
      created_at: new Date().toISOString(),
      email_id: emailId,
      from: '"Stockix" <noreply@send.stockix.cloud>',
      subject: "Stockix Email System Test",
      to: ["jad.haidar.ahmad315@gmail.com"],
    },
  };
}

const rawBody = JSON.stringify(payload);
const svix = signSvix(rawBody, secret, msgId);
const url = `${api}/webhooks/resend`;

console.log("Replaying Resend webhook locally");
console.log("  URL:", url);
console.log("  type:", payload.type);
console.log("  email_id:", payload.data?.email_id ?? "(none)");
console.log("  svix-id:", svix.id);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "svix-id": svix.id,
    "svix-timestamp": svix.timestamp,
    "svix-signature": svix.signature,
  },
  body: rawBody,
});

const text = await res.text();
console.log("\nResponse:", res.status, text);

if (res.status === 404) {
  console.error(`
Local API is not running or old build. Start it:
  pnpm --filter api dev
Then rerun this script.`);
  process.exit(1);
}
if (res.status === 401) {
  console.error("Signature rejected — RESEND_WEBHOOK_SECRET must match Resend dashboard signing secret.");
  process.exit(1);
}
if (!res.ok) {
  process.exit(1);
}

console.log(`
Next: check email_logs.delivery_status for provider_message_id = ${payload.data?.email_id ?? "?"}
  (row only updates if that id exists from a prior send logged in your local DB)
`);
