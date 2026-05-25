import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(file) {
  const full = path.join(rootDir, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"'))
      || (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function status(v) {
  if (v === undefined) return "MISSING";
  if (v === "") return "EMPTY";
  return v.length >= 32 ? "SET(32+)" : `SET(${v.length})`;
}

const root = parseEnv(".env");
const prod = parseEnv("infra/prod/.env");
const pos = parseEnv("services/posnew/apps/pos-backend/.env");
const example = parseEnv(".env.example");

const critical = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "AUTH_TOKEN_SECRET",
  "DEPLOYMENT_SECRET_KEY",
  "INTERNAL_API_SECRET",
  "PLATFORM_API_SECRET",
  "LICENSE_SIGNING_SECRET",
  "WORKER_SECRET",
  "MAIL_PASSWORD",
  "MAIL_FROM_ADDRESS",
  "ROOT_DOMAIN",
  "PUBLIC_BASE_URL_SCHEME",
  "POS_PLATFORM_API_KEY",
  "POS_PLATFORM_BASE_URL",
  "PROVISION_MODULE_GATING",
  "TRAEFIK_DYNAMIC_DIR",
  "TENANT_ENV_ROOT",
  "S3_FORCE_PATH_STYLE",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "CF_DNS_API_TOKEN",
  "CHATWOOT_SECRET_KEY_BASE",
  "CHATWOOT_DB_PASSWORD",
  "CHATWOOT_API_ACCESS_TOKEN",
  "POS_FINANCE_INTERNAL_HOST",
  "STOCKIX_FINANCE_INTERNAL_HOST",
];

console.log("=== CRITICAL VARS ===");
for (const k of critical) {
  console.log(`${k}: root=${status(root[k])} prod=${status(prod[k])} pos=${status(pos[k])}`);
}

console.log("\n=== ALIGNMENT ===");
function align(name, a, b) {
  if (!a || !b) return `${name}: MISSING_SIDE`;
  return `${name}: ${a === b ? "MATCH" : "MISMATCH"}`;
}
console.log(align("AUTH_TOKEN_SECRET root↔pos", root.AUTH_TOKEN_SECRET, pos.AUTH_TOKEN_SECRET));
console.log(align("POS_PLATFORM_API_KEY root↔pos", root.POS_PLATFORM_API_KEY, pos.POS_PLATFORM_API_KEY));
console.log(align("AUTH_TOKEN_SECRET root↔prod", root.AUTH_TOKEN_SECRET, prod.AUTH_TOKEN_SECRET));
console.log(align("POS_PLATFORM_API_KEY root↔prod", root.POS_PLATFORM_API_KEY, prod.POS_PLATFORM_API_KEY));

const exKeys = new Set(Object.keys(example));
const rootKeys = new Set(Object.keys(root));
const missingFromRoot = [...exKeys].filter((k) => !rootKeys.has(k));
const extraInRoot = [...rootKeys].filter((k) => !exKeys.has(k));
console.log("\n=== KEY COUNTS ===");
console.log(`example: ${exKeys.size} root: ${rootKeys.size} prod: ${Object.keys(prod).length}`);
console.log(`missing from root (in example): ${missingFromRoot.length}`);
if (missingFromRoot.length) console.log(missingFromRoot.join(", "));
console.log(`extra in root: ${extraInRoot.length}`);
if (extraInRoot.length) console.log(extraInRoot.join(", "));

const prodBlockers = [];
if (!prod.POS_PLATFORM_API_KEY) prodBlockers.push("POS_PLATFORM_API_KEY");
if (!prod.CF_DNS_API_TOKEN) prodBlockers.push("CF_DNS_API_TOKEN");
if (!prod.CHATWOOT_API_ACCESS_TOKEN) prodBlockers.push("CHATWOOT_API_ACCESS_TOKEN (post-boot)");
console.log("\n=== PROD BLOCKERS ===");
console.log(prodBlockers.length ? prodBlockers.join(", ") : "none (except optional post-boot tokens)");

console.log("\n=== LOCAL DEV READINESS ===");
const localOk =
  root.AUTH_TOKEN_SECRET
  && pos.AUTH_TOKEN_SECRET
  && root.AUTH_TOKEN_SECRET === pos.AUTH_TOKEN_SECRET
  && root.POS_PLATFORM_API_KEY
  && pos.POS_PLATFORM_API_KEY
  && root.POS_PLATFORM_API_KEY === pos.POS_PLATFORM_API_KEY
  && root.POS_FINANCE_INTERNAL_HOST
  && root.STOCKIX_FINANCE_INTERNAL_HOST;
console.log(localOk ? "READY (root ↔ POS aligned)" : "NOT READY — run: pnpm env:align-local && pnpm env:sync-pos");

console.log("\n=== PRODUCTION COMPOSE READINESS ===");
const prodOk =
  prod.POS_PLATFORM_API_KEY
  && prod.AUTH_TOKEN_SECRET
  && prod.DATABASE_URL
  && prod.PUBLIC_BASE_URL_SCHEME === "https"
  && prod.ROOT_DOMAIN
  && !prod.ROOT_DOMAIN.includes("localhost");
const prodTls = prod.CF_DNS_API_TOKEN ? "TLS ready" : "TLS blocked (CF_DNS_API_TOKEN empty)";
console.log(prodOk ? `READY except manual: ${prodTls}, Chatwoot token post-boot` : "NOT READY — check infra/prod/.env");
