/**
 * PMS service dev launcher (used by `pnpm dev` and `pnpm dev:pms`).
 * - Loads repo-root `.env`
 * - Respects `PMS_PORT` from parent orchestrator or picks next free port
 * - Runs `tsx watch` in services/pms
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFilesAtRoot } from "./load-root-env.mjs";
import { findFreePort } from "./find-free-port.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pmsDir = path.join(repoRoot, "services", "pms");

loadEnvFilesAtRoot(repoRoot);

const preferred = parseInt(process.env.PMS_PORT || "3003", 10);
const strict = process.env.STOCKIX_DEV_STRICT_PORT === "1";
const port = strict ? preferred : await findFreePort(preferred);

if (port !== preferred) {
  console.warn(`[pms] Port ${preferred} is in use — using http://127.0.0.1:${port}`);
}

const pmsOrigin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PMS_PORT: String(port),
  PMS_BASE_URL: pmsOrigin,
};

if (!env.DATABASE_URL?.trim()) {
  console.error("[pms] DATABASE_URL is missing. Set it in repo root `.env` (see .env.example).");
  process.exit(1);
}

console.log(`[pms] Starting → ${pmsOrigin} (health: ${pmsOrigin}/health)`);

const child = spawn("pnpm", ["exec", "tsx", "watch", "src/index.ts"], {
  cwd: pmsDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
