/**

 * API dev launcher — Node --watch + tsx (reliable on Windows; tsx watch hangs on heavy apps).

 */

import { spawn } from "node:child_process";

import path from "node:path";

import { fileURLToPath } from "node:url";

import { findFreePort, waitForPortFree } from "./find-free-port.mjs";

import { loadEnvFilesAtRoot } from "./load-root-env.mjs";



const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

loadEnvFilesAtRoot(repoRoot);

const apiDir = path.join(repoRoot, "apps", "api");



const locked = process.env.STOCKIX_DEV_LOCKED_PORT === "1";

const preferred = parseInt(process.env.PORT || "4000", 10);

const strict = process.env.STOCKIX_DEV_STRICT_PORT === "1";

const port = locked || strict ? preferred : await findFreePort(preferred);



if (port !== preferred) {

  console.warn(

    `[api] Port ${preferred} is in use — using http://127.0.0.1:${port} instead`,

  );

}



try {

  await waitForPortFree(port);

} catch (error) {

  console.error(`[api] ${error instanceof Error ? error.message : String(error)}`);

  process.exit(1);

}



// Default: stable API (no --watch) so dashboard/worker are not racing a restarting process.
// Opt in to hot reload: STOCKIX_DEV_API_WATCH=1 pnpm dev
const watchApi = process.env.STOCKIX_DEV_API_WATCH === "1";
const stableApi =
  !watchApi ||
  process.env.STOCKIX_DEV_STABLE_API === "1" ||
  process.env.STOCKIX_E2E === "1";

if (stableApi) {
  console.log(`[api] starting on http://127.0.0.1:${port} (stable — no file watch) …`);
} else {
  console.log(`[api] starting on http://127.0.0.1:${port} (node --watch + tsx) …`);
  console.warn(
    "⚠️  API running with --watch. Login and provisioning may fail briefly after file saves. " +
      "Unset STOCKIX_DEV_API_WATCH for the default stable local dev experience.",
  );
}

const nodeArgs = stableApi
  ? ["--import", "tsx", "src/index.ts"]
  : ["--watch", "--watch-path=src", "--import", "tsx", "src/index.ts"];

// Limit watch restarts to apps/api/src so worker/dashboard builds do not restart the API.
const child = spawn(process.execPath, nodeArgs, {

    cwd: apiDir,

    env: { ...process.env, PORT: String(port) },

    stdio: "inherit",

    shell: false,

  },

);



child.on("exit", (code) => process.exit(code ?? 0));



process.on("SIGINT", () => child.kill("SIGINT"));

process.on("SIGTERM", () => child.kill("SIGTERM"));


