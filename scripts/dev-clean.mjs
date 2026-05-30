/**
 * Clean dev startup: kill orphans → verify ports → Docker → API → full stack.
 *
 *   pnpm dev:clean
 */
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDevKillStale } from "./dev-kill-stale.mjs";
import { loadEnvFilesAtRoot } from "./load-root-env.mjs";
import { waitForHttp } from "./wait-for-http.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFilesAtRoot(repoRoot);

const CHECK_PORTS = [3000, 3001, 4000];
const isWin = process.platform === "win32";

/** @param {number} port @returns {Promise<boolean>} */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (inUse) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** @returns {Promise<void>} */
async function verifyPortsFree() {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const busy = [];
    for (const port of CHECK_PORTS) {
      if (await isPortInUse(port)) busy.push(port);
    }
    if (busy.length === 0) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  const stillBusy = [];
  for (const port of CHECK_PORTS) {
    if (await isPortInUse(port)) stillBusy.push(port);
  }
  if (stillBusy.length > 0) {
    console.error(`✖ Port(s) still in use after kill: ${stillBusy.join(", ")}`);
    console.error("  Run pnpm dev:kill and retry, or stop the process manually.");
    process.exit(1);
  }
}

/** @param {number} port @param {number} timeoutMs @returns {Promise<void>} */
async function waitForTcp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortInUse(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`TCP :${port} not ready within ${timeoutMs}ms`);
}

/** @param {string} cmd @param {string[]} args @param {import('node:child_process').SpawnOptions} [opts] */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: isWin,
      ...opts,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
    child.on("error", reject);
  });
}

console.log("[dev:clean] Step 1 — kill stale dev processes…\n");
await runDevKillStale();

console.log("\n[dev:clean] Step 2 — verify ports 3000, 3001, 4000 are free…");
await verifyPortsFree();
console.log("  ✓ Ports clear");

console.log("\n[dev:clean] Step 3 — Starting Postgres + Redis (Docker)…");
await run("docker", ["compose", "-f", "infra/dev/docker-compose.yml", "up", "-d"]);
try {
  await waitForTcp(15432, 15_000);
  console.log("  ✓ Postgres ready (:15432)");
} catch (error) {
  console.error(`  ✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
try {
  await waitForTcp(6379, 10_000);
  console.log("  ✓ Redis ready (:6379)");
} catch (error) {
  console.error(`  ✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

console.log("\n[dev:clean] Step 4 — Starting API…");
/** @type {import('node:child_process').ChildProcess} */
const apiChild = spawn(process.execPath, [path.join(repoRoot, "scripts", "dev-api.mjs")], {
  cwd: repoRoot,
  env: { ...process.env, PORT: "4000", STOCKIX_DEV_LOCKED_PORT: "1" },
  stdio: "inherit",
  shell: false,
});

apiChild.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[dev:clean] API exited with code ${code}`);
    process.exit(code ?? 1);
  }
});

try {
  await waitForHttp("http://127.0.0.1:4000/health", {
    timeoutMs: 30_000,
    label: "API (http://127.0.0.1:4000)",
  });
  console.log("  ✓ API ready");
} catch (error) {
  console.error("  ✖ API did not start in 30s");
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  apiChild.kill("SIGTERM");
  process.exit(1);
}

console.log("\n[dev:clean] Step 5 — Starting all apps…\n");

const apiOrigin = "http://127.0.0.1:4000";
/** @type {NodeJS.ProcessEnv} */
const sharedEnv = {
  ...process.env,
  PORT: "4000",
  DASHBOARD_PORT: process.env.DASHBOARD_PORT || "3000",
  PMS_PORT: process.env.PMS_PORT || "3003",
  PMS_BASE_URL: `http://127.0.0.1:${process.env.PMS_PORT || "3003"}`,
  PMS_FRONTEND_PORT: process.env.PMS_FRONTEND_PORT || "3004",
  NEXT_PUBLIC_PMS_API_URL: `http://127.0.0.1:${process.env.PMS_PORT || "3003"}`,
  NEXT_PUBLIC_PMS_TENANT_APP_URL: `http://localhost:${process.env.PMS_FRONTEND_PORT || "3004"}`,
  STOCKIX_API_URL: apiOrigin,
  NEXT_PUBLIC_STOCKIX_API_URL: apiOrigin,
  WORKER_HEALTH_PORT: process.env.WORKER_HEALTH_PORT || "9090",
  STOCKIX_DEV_LOCKED_PORT: "1",
  STOCKIX_DEV_REUSE_API: "1",
};

await run("pnpm", ["db:wait"], { env: sharedEnv });
await run("pnpm", ["db:migrate"], { env: sharedEnv });
await run("pnpm", ["--filter", "@repo/auth", "build"], { env: sharedEnv });
await run("pnpm", ["infra:worker:build"], { env: sharedEnv });

const posCmd =
  process.env.STOCKIX_DEV_SKIP_POS === "1"
    ? "node -e \"console.log('[dev-pos] skipped (STOCKIX_DEV_SKIP_POS=1)')\""
    : "node scripts/dev-pos-stack.mjs";

const concurrentlyBin = path.join(
  repoRoot,
  "node_modules",
  "concurrently",
  "dist",
  "bin",
  "concurrently.js",
);

const stackChild = spawn(
  process.execPath,
  [
    concurrentlyBin,
    "-n",
    "dash,worker,pos,pms,pms-ui",
    "-c",
    "cyan,magenta,green,yellow,blue",
    "node scripts/dev-next.mjs",
    "node infra/worker-service/.runtime/worker.js",
    posCmd,
    "node scripts/dev-pms.mjs",
    "node scripts/dev-pms-frontend.mjs",
  ],
  {
    cwd: repoRoot,
    env: sharedEnv,
    stdio: "inherit",
    shell: false,
  },
);

stackChild.on("exit", (code) => process.exit(code ?? 0));

/** @param {NodeJS.Signals} signal */
function shutdown(signal) {
  stackChild.kill(signal);
  apiChild.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}
