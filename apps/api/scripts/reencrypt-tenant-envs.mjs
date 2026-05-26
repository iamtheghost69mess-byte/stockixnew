#!/usr/bin/env node
/**
 * Re-encrypt sensitive keys in infra/tenant-env/{slug}/.env files.
 * Run after Finance server with bootstrap-decrypt-env is deployed.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { apiConfig } from "@repo/config";
import {
  encryptDeploymentSecret,
  isEncryptedDeploymentSecret,
} from "@repo/shared/deployment-secrets";

const SENSITIVE_KEYS = new Set([
  "DB_PASSWORD",
  "DB_ROOT_PASSWORD",
  "JWT_SECRET",
  "MAIL_PASSWORD",
  "AGENDASH_AUTH_PASSWORD",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
]);

const tenantEnvRoot = process.env.TENANT_ENV_ROOT ?? join(process.cwd(), "infra", "tenant-env");

function parseEnv(content) {
  const map = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    map[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return map;
}

function serializeEnv(map) {
  return `${Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")}\n`;
}

async function main() {
  const secretKey = apiConfig.deploymentSecretKey;
  const entries = await readdir(tenantEnvRoot, { withFileTypes: true });
  let updated = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const envPath = join(tenantEnvRoot, entry.name, ".env");
    let raw;
    try {
      raw = await readFile(envPath, "utf8");
    } catch {
      continue;
    }
    const map = parseEnv(raw);
    let changed = false;
    if (!map.DEPLOYMENT_SECRET_KEY) {
      map.DEPLOYMENT_SECRET_KEY = secretKey;
      changed = true;
    }
    for (const key of SENSITIVE_KEYS) {
      const value = map[key];
      if (!value?.trim() || isEncryptedDeploymentSecret(value)) continue;
      map[key] = encryptDeploymentSecret(value, secretKey);
      changed = true;
    }
    if (!changed) continue;
    const tmp = join(tenantEnvRoot, entry.name, ".env.tmp");
    const { writeFile, rename, chmod, mkdir } = await import("node:fs/promises");
    await mkdir(join(tenantEnvRoot, entry.name), { recursive: true, mode: 0o700 });
    await writeFile(tmp, serializeEnv(map), { mode: 0o600 });
    await rename(tmp, envPath);
    await chmod(envPath, 0o600);
    updated += 1;
    console.log(`reencrypted ${entry.name}`);
  }
  console.log(`done: ${updated} tenant env file(s) updated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
