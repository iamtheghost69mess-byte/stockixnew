import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const strictProdSecrets = process.argv.includes("--strict-prod-secrets");

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
const example = parseEnv(".env.example");

// POS backend loads from root .env — no separate POS env file needed.
// All root↔POS alignment checks are implicit (same file).

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
  // POS-specific vars now in root .env
  "MONGODB_URI",
  "REDIS_URL",
  "PUBLIC_APP_URL",
  "TENANT_ID",
  "WORKER_HEALTH_PORT",
];

console.log("=== CRITICAL VARS ===");
for (const k of critical) {
  console.log(`${k}: root=${status(root[k])} prod=${status(prod[k])}`);
}

console.log("\n=== ALIGNMENT (root ↔ prod) ===");

function align(name, a, b, { expectedMismatch = false } = {}) {
  if (!a || !b) return { line: `${name}: MISSING_SIDE`, fail: !expectedMismatch };
  if (a === b) return { line: `${name}: MATCH`, fail: false };
  if (expectedMismatch && !strictProdSecrets) {
    return {
      line: `${name}: MISMATCH (info — prod uses different secrets from local)`,
      fail: false,
    };
  }
  return { line: `${name}: MISMATCH`, fail: true };
}

const alignments = [
  align("AUTH_TOKEN_SECRET root↔prod", root.AUTH_TOKEN_SECRET, prod.AUTH_TOKEN_SECRET, {
    expectedMismatch: true,
  }),
  align("POS_PLATFORM_API_KEY root↔prod", root.POS_PLATFORM_API_KEY, prod.POS_PLATFORM_API_KEY, {
    expectedMismatch: true,
  }),
  align("LICENSE_SIGNING_SECRET root↔prod", root.LICENSE_SIGNING_SECRET, prod.LICENSE_SIGNING_SECRET, {
    expectedMismatch: true,
  }),
];

for (const row of alignments) {
  console.log(row.line);
}

const exKeys = new Set(Object.keys(example));
const rootKeys = new Set(Object.keys(root));
const missingFromRoot = [...exKeys].filter((k) => !rootKeys.has(k));
const extraInRoot = [...rootKeys].filter((k) => !exKeys.has(k));
console.log("\n=== KEY COUNTS ===");
console.log(`example: ${exKeys.size} root: ${rootKeys.size} prod: ${Object.keys(prod).length}`);
console.log(`missing from root (in example): ${missingFromRoot.length}`);
if (missingFromRoot.length) console.log(missingFromRoot.join(", "));
console.log(`extra in root (POS dev vars + infra overrides): ${extraInRoot.length}`);
if (extraInRoot.length) console.log(extraInRoot.join(", "));

const prodHardBlockers = [];
if (!prod.POS_PLATFORM_API_KEY) prodHardBlockers.push("POS_PLATFORM_API_KEY");
if (!prod.CF_DNS_API_TOKEN) prodHardBlockers.push("CF_DNS_API_TOKEN");
const prodOptional = [];
if (!prod.CHATWOOT_API_ACCESS_TOKEN) prodOptional.push("CHATWOOT_API_ACCESS_TOKEN (post-boot)");
console.log("\n=== PROD BLOCKERS ===");
console.log(
  prodHardBlockers.length
    ? prodHardBlockers.join(", ")
    : prodOptional.length
      ? `none (optional post-boot: ${prodOptional.join(", ")})`
      : "none",
);

// Local dev: POS reads from root .env — only check root has the required vars.
console.log("\n=== LOCAL DEV READINESS ===");
const localRequired = [
  "AUTH_TOKEN_SECRET",
  "POS_PLATFORM_API_KEY",
  "POS_FINANCE_INTERNAL_HOST",
  "STOCKIX_FINANCE_INTERNAL_HOST",
  "MONGODB_URI",
  "REDIS_URL",
  "PUBLIC_APP_URL",
  "TENANT_ID",
  "WORKER_HEALTH_PORT",
];
const localMissing = localRequired.filter((k) => !root[k]?.trim());
if (localMissing.length === 0) {
  console.log("READY — root .env is the single source for all local services");
} else {
  console.log(`NOT READY — missing from root .env: ${localMissing.join(", ")}`);
  console.log("  Run: pnpm env:pos-vars && pnpm env:align-local");
}

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

const alignmentFailures = alignments.filter((row) => row.fail);
let exitCode = 0;
if (localMissing.length > 0) exitCode = 1;
if (prodHardBlockers.length > 0) exitCode = 1;
if (alignmentFailures.length > 0) exitCode = 1;

console.log("\n=== RESULT ===");
if (exitCode === 0) {
  console.log("PASS — root .env covers all services; prod env is complete");
} else {
  console.log("FAIL — fix blocking issues above");
  if (alignmentFailures.length > 0) {
    console.log(`Alignment failures: ${alignmentFailures.map((r) => r.line).join("; ")}`);
  }
}

process.exit(exitCode);
