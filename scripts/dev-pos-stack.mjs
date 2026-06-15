/**
 * Local POS stack: build @repo/auth (CJS for pos-backend) + API (8010) + UI (3001).
 *
 *   node scripts/dev-pos-stack.mjs
 *   STOCKIX_DEV_SKIP_POS=1 pnpm dev
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFilesAtRoot } from "./load-root-env.mjs";
import { findFreePort } from "./find-free-port.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFilesAtRoot(repoRoot);

const posRoot = path.join(repoRoot, process.env.POS_APP_ROOT || "services/posnew");
const backendDir = path.join(posRoot, "apps", "pos-backend");
const frontendDir = path.join(posRoot, "apps", "pos-frontend2");

function skip(message) {
  console.warn(`[dev-pos] ${message}`);
  process.exit(0);
}

if (process.env.STOCKIX_DEV_SKIP_POS === "1") {
  skip("STOCKIX_DEV_SKIP_POS=1 — not starting POS stack.");
}

if (!existsSync(path.join(repoRoot, "node_modules"))) {
  skip("Root deps missing. Run: pnpm install");
}

if (!existsSync(path.join(backendDir, "package.json"))) {
  skip(`pos-backend not found at ${backendDir}`);
}

if (!existsSync(path.join(frontendDir, "package.json"))) {
  skip(`pos-frontend not found at ${frontendDir}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...opts,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
    child.on("error", reject);
  });
}

const strict = process.env.STOCKIX_DEV_STRICT_PORT === "1";
const preferredApiPort = parseInt(process.env.POS_PLATFORM_PORT || "8010", 10);
const preferredUiPort = parseInt(process.env.POS_FRONTEND_HOST_PORT || "3001", 10);
const apiPortNum = strict ? preferredApiPort : await findFreePort(preferredApiPort);
const uiPortNum = strict ? preferredUiPort : await findFreePort(preferredUiPort);
const apiPort = String(apiPortNum);
const uiPort = String(uiPortNum);
if (apiPortNum !== preferredApiPort) {
  console.warn(`[dev-pos] Port ${preferredApiPort} busy — POS API on ${apiPort}`);
}
if (uiPortNum !== preferredUiPort) {
  console.warn(`[dev-pos] Port ${preferredUiPort} busy — POS UI on ${uiPort}`);
}
const platformKey = process.env.POS_PLATFORM_API_KEY?.trim() || "";
const authSecret = process.env.AUTH_TOKEN_SECRET?.trim() || "";

let redisUrl = process.env.REDIS_URL?.trim() || "";
if (!redisUrl || redisUrl.includes("@redis:") || redisUrl.includes("://redis:")) {
  redisUrl = process.env.STOCKIX_DEV_REDIS_URL?.trim() || "redis://127.0.0.1:6379/5";
}

const sharedEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "development",
  REDIS_URL: redisUrl,
  ...(platformKey ? { POS_PLATFORM_API_KEY: platformKey } : {}),
  ...(authSecret ? { AUTH_TOKEN_SECRET: authSecret } : {}),
};

const backendEnv = { ...sharedEnv, PORT: apiPort };
const frontendEnv = {
  ...sharedEnv,
  PORT: uiPort,
  NEXT_PUBLIC_POS_API_ORIGIN:
    process.env.NEXT_PUBLIC_POS_API_ORIGIN?.trim() || `http://localhost:${apiPort}`,
};

console.log("[dev-pos] Building @repo/auth (CJS for pos-backend)…");
await run("pnpm", ["--filter", "@repo/auth", "build"], { cwd: repoRoot });

console.log(`[dev-pos] API  → http://localhost:${apiPort}`);
console.log(`[dev-pos] UI   → http://localhost:${uiPort}`);
if (!platformKey) {
  console.warn("[dev-pos] POS_PLATFORM_API_KEY is empty — dashboard /api/pos/* may return 401.");
}

const children = [];

function startPos(label, cwd, cmd, args, env) {
  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code, signal) => {
    if (signal) return;
    console.warn(`[dev-pos:${label}] exited with code ${code ?? "?"}`);
  });
  children.push(child);
  return child;
}

startPos("api", repoRoot, "pnpm", ["--filter", "pos-backend", "dev"], backendEnv);
startPos(
  "ui",
  path.join(repoRoot, "services", "posnew", "apps", "pos-frontend2"),
  "pnpm",
  ["exec", "next", "dev", "--port", String(uiPort)],
  frontendEnv,
);

function shutdown(signal) {
  for (const child of children) {
    try {
      child.kill(signal);
    } catch {
      /* ignore */
    }
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit(0);
});

await new Promise(() => {});
