#!/usr/bin/env node
/**
 * Decrypts enc:v1:* values in a tenant .env file in place.
 * Usage: node scripts/decrypt-tenant-env.mjs <path-to-tenant-env>
 *
 * The file must contain DEPLOYMENT_SECRET_KEY= so the script can locate
 * the encryption key automatically. All enc:v1:* values are replaced with
 * their plaintext equivalents and the file is written back.
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";

const envPath = process.argv[2];
if (!envPath) {
  console.error("Usage: node scripts/decrypt-tenant-env.mjs <path-to-tenant-env>");
  process.exit(1);
}

const resolvedPath = path.resolve(envPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`File not found: ${resolvedPath}`);
  process.exit(1);
}

function decrypt(ciphertext, secretKeyHex) {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") return ciphertext;
    const key = Buffer.from(secretKeyHex, "hex");
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const data = Buffer.from(parts[4], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return ciphertext;
  }
}

const content = fs.readFileSync(resolvedPath, "utf-8");
let secretKey = "";
for (const line of content.split("\n")) {
  if (line.startsWith("DEPLOYMENT_SECRET_KEY=")) {
    secretKey = line.slice("DEPLOYMENT_SECRET_KEY=".length).trim();
    break;
  }
}

if (!secretKey) {
  console.error("DEPLOYMENT_SECRET_KEY not found in the .env file.");
  process.exit(1);
}

const newContent = content.split("\n").map(line => {
  const idx = line.indexOf("=");
  if (idx === -1) return line;
  const key = line.slice(0, idx);
  const val = line.slice(idx + 1).trim();
  if (val.startsWith("enc:v1:")) {
    return `${key}=${decrypt(val, secretKey)}`;
  }
  return line;
}).join("\n");

fs.writeFileSync(resolvedPath, newContent);
console.log(`Decrypted ${resolvedPath} successfully.`);
