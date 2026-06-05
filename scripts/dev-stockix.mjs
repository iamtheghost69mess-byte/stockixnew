/**
 * Stockix local development orchestrator (full provision-ready stack).
 *
 * One command: pnpm dev
 *
 * Brings up:
 *   - Control-plane Postgres + Redis (infra/dev)
 *   - Shared tenant infra MySQL + Mongo + Redis (infra/shared / stockix-shared network)
 *   - Migrations + platform admin seed (idempotent)
 *   - API → dashboard, worker, POS, PMS
 *
 * Does NOT rebuild Docker tenant images or packages unless artifacts are missing
 * (set STOCKIX_DEV_FORCE_BUILD=1 to force @repo/auth + worker bundle rebuild).
 *
 * Usage: pnpm dev
 *        STOCKIX_DEV_SKIP_POS=1 pnpm dev   — skip POS if low on RAM
 */
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { loadEnvFilesAtRoot } from "./load-root-env.mjs";
import { findFreePort, waitForPortFree } from "./find-free-port.mjs";
import { waitForHttp } from "./wait-for-http.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const concurrentlyBin = path.join(
  repoRoot,
  "node_modules",
  "concurrently",
  "dist",
  "bin",
  "concurrently.js",
);
const SHARED_COMPOSE = path.join(repoRoot, "infra", "shared", "docker-compose.yml");
const SHARED_COMPOSE_DEV_PORTS = path.join(repoRoot, "infra", "shared", "docker-compose.dev-ports.yml");
const WORKER_BUNDLE = path.join(repoRoot, "infra", "worker-service", ".runtime", "worker.js");
const AUTH_DIST = path.join(repoRoot, "packages", "auth", "dist", "index.cjs");

const TENANT_IMAGE_TAGS = [
  "stockix-server:local",
  "stockix-database-migration:local",
];

loadEnvFilesAtRoot(repoRoot);
loadSharedInfraEnv(repoRoot);

/** Merge infra/prod/.env for SHARED_* keys required by tenant provisioning. */
function loadSharedInfraEnv(root) {
  const prodEnv = path.join(root, "infra", "prod", ".env");
  if (existsSync(prodEnv)) {
    loadEnv({ path: prodEnv, override: false });
  }
  if (!process.env.SHARED_MYSQL_ROOT_PASSWORD?.trim()) {
    console.error("[dev] SHARED_MYSQL_ROOT_PASSWORD is required for tenant provisioning.");
    console.error("      Add it to .env or infra/prod/.env (see infra/prod/.env.example).");
    process.exit(1);
  }
  // Tenant containers resolve these on the stockix-shared Docker network.
  process.env.SHARED_MYSQL_HOST ??= "stockix-mysql";
  process.env.SHARED_MONGO_HOST ??= "stockix-mongo";
  process.env.TENANT_REDIS_HOST ??= "stockix-redis";
  // Host-run worker uses published ports (docker-compose.dev-ports.yml).
  process.env.WORKER_SHARED_MYSQL_HOST ??= "127.0.0.1";
  process.env.WORKER_SHARED_MONGO_HOST ??= "127.0.0.1";
}

/** @param {string} cmd @param {string[]} args @param {import('node:child_process').SpawnOptions} [opts] */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
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

function dockerImageExists(tag) {
  try {
    execSync(`docker image inspect ${tag}`, { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
}

function warnMissingTenantImages() {
  const missing = TENANT_IMAGE_TAGS.filter((tag) => !dockerImageExists(tag));
  if (missing.length === 0) return;
  console.warn("[dev] ⚠ Tenant Docker images not built yet (provision will fail until you run once):");
  for (const tag of missing) console.warn(`[dev]     - ${tag}`);
  console.warn("[dev]   Run once: pnpm docker:prebuild\n");
}

function sharedComposeEnvFiles() {
  const envFiles = [path.join(repoRoot, ".env")];
  const prodEnv = path.join(repoRoot, "infra", "prod", ".env");
  if (existsSync(prodEnv)) envFiles.push(prodEnv);
  return envFiles;
}

/** @param {string[]} envFiles */
function sharedComposeArgs(envFiles) {
  const args = ["compose", "-f", SHARED_COMPOSE];
  if (existsSync(SHARED_COMPOSE_DEV_PORTS)) {
    args.push("-f", SHARED_COMPOSE_DEV_PORTS);
  }
  for (const file of envFiles) args.push("--env-file", file);
  return args;
}

/** Block until rs0 is initiated and PRIMARY (idempotent). */
async function ensureMongoReplicaSet(env, envFiles) {
  console.log("[dev] MongoDB replica set rs0 bootstrap…");
  const args = sharedComposeArgs(envFiles);
  args.push("run", "--rm", "stockix-mongo-rs-init");
  await run("docker", args, { env });
}

async function upSharedInfra(env) {
  if (!existsSync(SHARED_COMPOSE)) {
    throw new Error(`Missing ${SHARED_COMPOSE}`);
  }
  const envFiles = sharedComposeEnvFiles();
  const args = sharedComposeArgs(envFiles);
  args.push("up", "-d", "--wait");

  console.log("[dev] Shared tenant infra (stockix-shared: MySQL, Mongo, Redis, nginx)…");
  await run("docker", args, { env });
  await ensureMongoReplicaSet(env, envFiles);
  console.log("[dev] ✓ stockix-shared is up (Mongo rs0 ready)\n");
}

async function ensureBuildArtifacts(env) {
  const force = process.env.STOCKIX_DEV_FORCE_BUILD === "1";
  if (force || !existsSync(AUTH_DIST)) {
    console.log("[dev] Building @repo/auth…");
    await run("pnpm", ["--filter", "@repo/auth", "build"], { env });
  } else {
    console.log("[dev] @repo/auth dist present — skip build (STOCKIX_DEV_FORCE_BUILD=1 to rebuild)");
  }
  if (force || !existsSync(WORKER_BUNDLE)) {
    console.log("[dev] Building worker bundle…");
    await run("pnpm", ["infra:worker:build"], { env });
  } else {
    console.log("[dev] Worker bundle present — skip build (STOCKIX_DEV_FORCE_BUILD=1 to rebuild)");
  }
}

const strict = process.env.STOCKIX_DEV_STRICT_PORT === "1";
/** @param {number} preferred */
const pick = (preferred) => (strict ? Promise.resolve(preferred) : findFreePort(preferred));

/** @param {number} port */
async function isApiHealthy(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

console.log("[dev] Clearing stale dev port listeners…");
try {
  await run("node", ["scripts/dev-kill-stale.mjs"], { env: process.env, stdio: "pipe" });
} catch {
  /* non-fatal */
}

const preferredApiPort = parseInt(process.env.PORT || "4000", 10);
const allowReuseApi = process.env.STOCKIX_DEV_REUSE_API === "1";
const existingApiPort =
  allowReuseApi && !strict && (await isApiHealthy(preferredApiPort))
    ? preferredApiPort
    : null;

const [apiPort, dashPort, pmsPort, pmsUiPort, workerHealthPort] = await Promise.all([
  existingApiPort != null ? Promise.resolve(existingApiPort) : pick(preferredApiPort),
  pick(parseInt(process.env.DASHBOARD_PORT || "3000", 10)),
  pick(parseInt(process.env.PMS_PORT || "3003", 10)),
  pick(parseInt(process.env.PMS_FRONTEND_PORT || "3004", 10)),
  pick(parseInt(process.env.WORKER_HEALTH_PORT || "9090", 10)),
]);

const reuseExistingApi = existingApiPort != null && apiPort === existingApiPort;

const apiOrigin = `http://127.0.0.1:${apiPort}`;
const pmsOrigin = `http://127.0.0.1:${pmsPort}`;
const adminEmail = process.env.PLATFORM_ADMIN_EMAIL || "admin@localhost";

/** @type {NodeJS.ProcessEnv} */
const sharedEnv = {
  ...process.env,
  PORT: String(apiPort),
  DASHBOARD_PORT: String(dashPort),
  PMS_PORT: String(pmsPort),
  PMS_BASE_URL: pmsOrigin,
  PMS_FRONTEND_PORT: String(pmsUiPort),
  NEXT_PUBLIC_PMS_API_URL: pmsOrigin,
  NEXT_PUBLIC_PMS_TENANT_APP_URL: `http://localhost:${pmsUiPort}`,
  STOCKIX_API_URL: apiOrigin,
  NEXT_PUBLIC_STOCKIX_API_URL: apiOrigin,
  WORKER_HEALTH_PORT: String(workerHealthPort),
  STOCKIX_DEV_LOCKED_PORT: "1",
};

if (reuseExistingApi) {
  console.log(`[dev] Reusing existing API on ${apiOrigin} (skip starting a second instance)\n`);
} else if (apiPort !== preferredApiPort) {
  console.warn(
    `[dev] ⚠ Port ${preferredApiPort} is in use — API will use ${apiOrigin}. Dashboard BFF is aligned.`,
  );
  console.warn("[dev] Tip: run `pnpm dev:kill` to free stale processes on port 4000.\n");
}

console.log("\n[dev] Stockix full local stack (provision-ready)");
console.log(`  Dashboard   http://127.0.0.1:${dashPort}  (http://localhost:${dashPort})`);
console.log(`  API         ${apiOrigin}`);
console.log(`  PMS API     ${pmsOrigin}`);
console.log(`  PMS (platform admin)  http://127.0.0.1:${dashPort}/pms`);
console.log(`  PMS (tenant app)      http://localhost:${pmsUiPort}`);
console.log(`  Shared infra  stockix-shared (MySQL, Mongo, tenant Redis)`);
console.log(`  Login (platform): ${adminEmail} (PLATFORM_ADMIN_PASSWORD from .env)`);
console.log("  E2E audit:     pnpm audit:e2e");
console.log("  Tips: STOCKIX_DEV_SKIP_POS=1 pnpm dev  |  pnpm db:seed:pms-demo\n");

console.log("[dev] Control-plane Postgres + Redis…");
await run("pnpm", ["db:up"], { env: sharedEnv });
await upSharedInfra(sharedEnv);
warnMissingTenantImages();

console.log("[dev] Migrations + platform admin…");
await run("pnpm", ["db:wait"], { env: sharedEnv });
await run("pnpm", ["db:migrate"], { env: sharedEnv });
try {
  await run("pnpm", ["db:seed:local"], { env: sharedEnv });
} catch (err) {
  console.warn(
    `[dev] db:seed:local failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
  );
}

await ensureBuildArtifacts(sharedEnv);

const posCmd =
  process.env.STOCKIX_DEV_SKIP_POS === "1"
    ? "node -e \"console.log('[dev-pos] skipped (STOCKIX_DEV_SKIP_POS=1)')\""
    : "node scripts/dev-pos-stack.mjs";

/** @type {import('node:child_process').ChildProcess | null} */
let apiChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let stackChild = null;

const apiWaitMs = parseInt(process.env.STOCKIX_DEV_API_WAIT_MS || "180000", 10);

if (!reuseExistingApi) {
  console.log(`[dev] Phase 1: boot API on ${apiOrigin} before dashboard/worker/POS/PMS…`);
  try {
    await waitForPortFree(apiPort);
  } catch (error) {
    console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  apiChild = spawn(process.execPath, [path.join(repoRoot, "scripts", "dev-api.mjs")], {
    cwd: repoRoot,
    env: sharedEnv,
    stdio: "inherit",
    shell: false,
  });

  apiChild.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] API exited with code ${code}. Stopping dev stack.`);
      stackChild?.kill("SIGTERM");
      process.exit(code ?? 1);
    }
  });

  try {
    await waitForHttp(`${apiOrigin}/health`, {
      timeoutMs: apiWaitMs,
      label: `API (${apiOrigin})`,
    });
  } catch (error) {
    console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
    console.error("[dev] Run `pnpm dev:kill`, then retry `pnpm dev`.");
    apiChild.kill("SIGTERM");
    process.exit(1);
  }
}

const concurrentlyArgs = [
  "-n",
  "dash,worker,pos,pms,pms-ui",
  "-c",
  "cyan,magenta,green,yellow,blue",
  "node scripts/dev-next.mjs",
  "node infra/worker-service/.runtime/worker.js",
  posCmd,
  "node scripts/dev-pms.mjs",
  "node scripts/dev-pms-frontend.mjs",
];

console.log("[dev] Phase 2: starting dashboard, worker, POS, PMS…\n");

stackChild = spawn(process.execPath, [concurrentlyBin, ...concurrentlyArgs], {
  cwd: repoRoot,
  env: sharedEnv,
  stdio: "inherit",
  shell: false,
});

stackChild.on("exit", (code) => process.exit(code ?? 0));

/** @param {NodeJS.Signals} signal */
function shutdownAll(signal) {
  stackChild?.kill(signal);
  apiChild?.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdownAll(signal));
}
