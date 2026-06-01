/**
 * Stockix local development orchestrator.
 *
 * Starts: Postgres (docker) → migrations → API (wait for /health) → dashboard, worker, POS, PMS.
 * Ports auto-increment when defaults are busy (unless STOCKIX_DEV_STRICT_PORT=1).
 *
 * Usage: pnpm dev
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
loadEnvFilesAtRoot(repoRoot);

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

console.log("\n[dev] Stockix local stack");
console.log(`  Dashboard   http://127.0.0.1:${dashPort}  (http://localhost:${dashPort})`);
console.log(`  API         ${apiOrigin}`);
console.log(`  PMS API     ${pmsOrigin}`);
console.log(`  PMS (platform admin)  http://127.0.0.1:${dashPort}/pms`);
console.log(`  PMS (tenant app)      http://localhost:${pmsUiPort}`);
console.log("  Login (platform): admin@localhost / admin (from .env)");
console.log("  Tips: pnpm db:seed:pms-demo  |  STOCKIX_DEV_SKIP_POS=1 pnpm dev\n");

console.log("[dev] Postgres + migrations…");
await run("pnpm", ["db:up"], { env: sharedEnv });
await run("pnpm", ["db:wait"], { env: sharedEnv });
await run("pnpm", ["db:migrate"], { env: sharedEnv });
await run("pnpm", ["--filter", "@repo/auth", "build"], { env: sharedEnv });
await run("pnpm", ["infra:worker:build"], { env: sharedEnv });

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

// API is healthy — start remaining services. Do not launch a second API under concurrently
// (Windows + pnpm exec + tsx watch + parallel Next dev servers caused startup hangs).
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
