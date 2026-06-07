/**
 * Infra worker launcher — waits for control-plane /ready before polling job claims.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFilesAtRoot } from "./load-root-env.mjs";
import { waitForControlPlaneReady } from "./wait-for-http.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFilesAtRoot(repoRoot);

const apiBase =
  process.env.STOCKIX_API_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_STOCKIX_API_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

const workerEntry = path.join(repoRoot, "infra", "worker-service", ".runtime", "worker.js");
const timeoutMs = parseInt(process.env.STOCKIX_DEV_API_WAIT_MS || "180000", 10);

try {
  await waitForControlPlaneReady(apiBase, { timeoutMs, label: `Worker → API (${apiBase})` });
} catch (error) {
  console.error(`[worker] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const child = spawn(process.execPath, [workerEntry], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
