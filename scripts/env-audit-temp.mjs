#!/usr/bin/env node
/**
 * Temporary read-only ENV audit script — outputs JSON for ENV_PRODUCTION_AUDIT.md
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseKeys(content) {
  return [...content.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);
}

function readIfExists(rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function scanEnvVars(dirs, extensions = [".ts", ".tsx", ".js"]) {
  const vars = new Set();
  const extGlob = extensions.map((e) => `--include=*${e}`).join(" ");
  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    try {
      const isWin = process.platform === "win32";
      let out = "";
      if (isWin) {
        // PowerShell-friendly recursive scan
        const files = [];
        function walk(d) {
          for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist") continue;
            const fp = path.join(d, ent.name);
            if (ent.isDirectory()) walk(fp);
            else if (extensions.some((e) => ent.name.endsWith(e))) files.push(fp);
          }
        }
        walk(full);
        for (const fp of files) {
          const content = fs.readFileSync(fp, "utf8");
          for (const m of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) vars.add(m[1]);
          for (const m of content.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) vars.add(m[1]);
        }
      } else {
        out = execSync(
          `grep -rn ${extGlob} process\\.env ${dir} 2>/dev/null | grep -v node_modules`,
          { cwd: root, maxBuffer: 20 * 1024 * 1024, encoding: "utf8" },
        );
        for (const m of out.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) vars.add(m[1]);
      }
    } catch {
      /* skip */
    }
  }
  return [...vars].sort();
}

function emptyKeys(content) {
  return content
    .split("\n")
    .filter((l) => /^[A-Z][A-Z0-9_]+=$/.test(l.trim()))
    .map((l) => l.split("=")[0]);
}

function keyValues(content) {
  const map = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

function localhostInProd(content) {
  return content
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .filter((l) => /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(l))
    .map((l) => l.split("=")[0])
    .filter(Boolean);
}

// Load dotenv for validation (root .env only, no override of existing)
const dotenvPath = path.join(root, ".env");
if (fs.existsSync(dotenvPath)) {
  const { config } = await import("dotenv");
  config({ path: dotenvPath });
}

const ex = readIfExists(".env.example");
const en = readIfExists(".env");
const prod = readIfExists("infra/prod/.env");
const prodEx = readIfExists("infra/prod/.env.example");

const exKeys = parseKeys(ex);
const enKeys = parseKeys(en);
const prodKeys = parseKeys(prod);

const scanDirs = [
  "apps/api/src",
  "apps/dashboard",
  "infra/worker-service/src",
  "packages/config/src",
  "services/pms/src",
  "services/stockix-finance/packages/server/src",
  "services/posnew/apps/pos-backend",
];

const allUsed = scanEnvVars(scanDirs);
const byService = {};
for (const d of scanDirs) {
  byService[d] = scanEnvVars([d]);
}

// Config coverage — vars used in api but not in packages/config index
const configContent = readIfExists("packages/config/src/index.ts");
const apiDirect = byService["apps/api/src"] ?? [];
const notInConfig = apiDirect.filter((v) => !configContent.includes(v));

// Unused in .env.example
const unused = exKeys.filter((k) => {
  // search broadly in scan dirs content
  for (const dir of scanDirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    const stack = [full];
    while (stack.length) {
      const d = stack.pop();
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        const fp = path.join(d, ent.name);
        if (ent.isDirectory()) stack.push(fp);
        else if (/\.(ts|tsx|js)$/.test(ent.name)) {
          const c = fs.readFileSync(fp, "utf8");
          if (c.includes(k)) return false;
        }
      }
    }
  }
  return true;
});

// Undocumented — in code but not in .env.example
const undocumented = allUsed.filter((k) => !exKeys.includes(k));

const envMap = keyValues(en);

const productionChecks = [
  ["DATABASE_URL", () => envMap.DATABASE_URL?.startsWith("postgresql://")],
  ["DATABASE_URL (no localhost prod)", () => !envMap.DATABASE_URL?.includes("localhost")],
  ["SESSION_SECRET (32+)", () => (envMap.SESSION_SECRET || "").length >= 32 && envMap.SESSION_SECRET !== "__MUST_OVERRIDE__"],
  ["AUTH_TOKEN_SECRET (32+)", () => (envMap.AUTH_TOKEN_SECRET || "").length >= 32 && envMap.AUTH_TOKEN_SECRET !== "__MUST_OVERRIDE__"],
  ["DEPLOYMENT_SECRET_KEY (32+)", () => (envMap.DEPLOYMENT_SECRET_KEY || "").length >= 32 && envMap.DEPLOYMENT_SECRET_KEY !== "__MUST_OVERRIDE__"],
  ["INTERNAL_API_SECRET (32+)", () => (envMap.INTERNAL_API_SECRET || "").length >= 32],
  ["PLATFORM_API_SECRET (32+)", () => (envMap.PLATFORM_API_SECRET || "").length >= 32],
  ["LICENSE_SIGNING_SECRET (32+)", () => (envMap.LICENSE_SIGNING_SECRET || "").length >= 32 && envMap.LICENSE_SIGNING_SECRET !== "__MUST_OVERRIDE__"],
  ["MAIL_PASSWORD (Resend key)", () => (envMap.MAIL_PASSWORD || "").startsWith("re_") || (envMap.RESEND_API_KEY || "").startsWith("re_")],
  ["MAIL_FROM_ADDRESS", () => (envMap.MAIL_FROM_ADDRESS || "").includes("@")],
  ["ROOT_DOMAIN", () => (envMap.ROOT_DOMAIN || "").length > 3],
  ["PUBLIC_BASE_URL_SCHEME https", () => envMap.PUBLIC_BASE_URL_SCHEME === "https"],
  ["TRAEFIK_DYNAMIC_DIR", () => (envMap.TRAEFIK_DYNAMIC_DIR || "").length > 3],
  ["TENANT_ENV_ROOT", () => (envMap.TENANT_ENV_ROOT || "").length > 3],
  ["PROVISION_MODULE_GATING=1", () => envMap.PROVISION_MODULE_GATING === "1"],
  ["WORKER_JOB_EXECUTION_TIMEOUT_MS (>=900000)", () => parseInt(envMap.WORKER_JOB_EXECUTION_TIMEOUT_MS || "0", 10) >= 900000],
  ["POS_PLATFORM_BASE_URL", () => (envMap.POS_PLATFORM_BASE_URL || "").startsWith("http")],
  ["POS_PLATFORM_API_KEY (10+)", () => (envMap.POS_PLATFORM_API_KEY || "").length >= 10],
  ["PMS_BASE_URL", () => (envMap.PMS_BASE_URL || "").startsWith("http")],
  ["S3_FORCE_PATH_STYLE=true", () => envMap.S3_FORCE_PATH_STYLE === "true"],
  ["DOCKER_COMPOSE_UP_TIMEOUT_MS (>=600000)", () => parseInt(envMap.DOCKER_COMPOSE_UP_TIMEOUT_MS || "0", 10) >= 600000],
];

const checkResults = productionChecks.map(([name, fn]) => {
  try {
  const ok = fn();
  return { name, ok, value: ok ? "OK" : envMap[name.split(" ")[0]] ? "WRONG" : "MISSING" };
  } catch (e) {
    return { name, ok: false, value: e.message };
  }
});

const pass = checkResults.filter((c) => c.ok).length;
const fail = checkResults.filter((c) => !c.ok).length;

// Docker images
const dockerImages = ["stockix-webapp:local", "stockix-server:local", "stockix-database-migration:local", "stockix-nginx:local"];
const dockerStatus = {};
for (const img of dockerImages) {
  try {
    execSync(`docker image inspect ${img}`, { stdio: "pipe" });
    dockerStatus[img] = "present";
  } catch {
    dockerStatus[img] = "missing";
  }
}

const result = {
  counts: { example: exKeys.length, env: enKeys.length, prod: prodKeys.length, codeUsed: allUsed.length },
  missingFromEnv: exKeys.filter((k) => !enKeys.includes(k)),
  extraInEnv: enKeys.filter((k) => !exKeys.includes(k)),
  inRootNotProd: enKeys.filter((k) => !prodKeys.includes(k)),
  inProdNotRoot: prodKeys.filter((k) => !enKeys.includes(k)),
  emptyInEnv: emptyKeys(en),
  emptyInExample: emptyKeys(ex),
  allUsed,
  byService,
  notInConfig,
  unusedInExample: unused,
  undocumented,
  checkResults,
  score: { pass, fail, total: pass + fail },
  dockerStatus,
  prodLocalhostKeys: localhostInProd(prod),
  criticalEmpty: [
    "INTERNAL_API_SECRET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
    "POS_PLATFORM_API_KEY",
    "CHATWOOT_API_ACCESS_TOKEN",
    "CHATWOOT_SECRET_KEY_BASE",
    "CHATWOOT_DB_PASSWORD",
  ].filter((k) => !envMap[k] || envMap[k].trim() === "" || envMap[k] === "__MUST_OVERRIDE__"),
};

console.log(JSON.stringify(result, null, 2));
