/**
 * Next.js dev with automatic port fallback when the preferred port is busy.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findFreePort } from "./find-free-port.mjs";
import { loadEnvFilesAtRoot } from "./load-root-env.mjs";
import { waitForHttp } from "./wait-for-http.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFilesAtRoot(repoRoot);
const dashboardDir = path.join(repoRoot, "apps", "dashboard");

// Do not fall back to PORT — root .env sets PORT=4000 for the API.
const preferred = parseInt(process.env.DASHBOARD_PORT || "3000", 10);
const strict = process.env.STOCKIX_DEV_STRICT_PORT === "1";
const port = strict ? preferred : await findFreePort(preferred);

const apiHealthUrl =
  process.env.STOCKIX_API_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_STOCKIX_API_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

try {
  await waitForHttp(`${apiHealthUrl}/health`, {
    timeoutMs: parseInt(process.env.STOCKIX_DEV_API_WAIT_MS || "120000", 10),
    label: `API (${apiHealthUrl})`,
  });
} catch (error) {
  console.error(
    `[dashboard] ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error(
    "[dashboard] Start the API first, or free port 4000 if a stale process holds it (`pnpm dev:kill`).",
  );
  process.exit(1);
}

if (port !== preferred) {
  console.warn(
    `[dashboard] Port ${preferred} is in use — using http://localhost:${port} instead`,
  );
} else {
  console.log(`[dashboard] http://127.0.0.1:${port}  (http://localhost:${port})`);
}

// Turbopack on Windows + pnpm often hits "module factory is not available" for react-hook-form etc.
// Default to webpack; set STOCKIX_NEXT_TURBOPACK=1 to opt into Turbopack.
const useWebpack = process.env.STOCKIX_NEXT_TURBOPACK !== "1";
console.log(`[dashboard] dev bundler: ${useWebpack ? "webpack" : "turbopack"}`);

const nextBin = path.join(dashboardDir, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error(
    "[dashboard] next not found. Run `pnpm install` from the repo root, then retry.",
  );
  process.exit(1);
}

const nextDevArgs = [
  "dev",
  // Bind all interfaces so both http://localhost and http://127.0.0.1 work on Windows.
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
  ...(useWebpack ? ["--webpack"] : ["--turbopack"]),
];

// Root `.env` injects NEXT_PUBLIC_SENTRY_DSN into process.env before Next starts;
// Next.js will not override inherited env vars with apps/dashboard/.env.local.
const enableSentry = process.env.STOCKIX_ENABLE_SENTRY === "1";
const nextEnv = {
  ...process.env,
  DASHBOARD_PORT: String(port),
  ...(enableSentry ? {} : { NEXT_PUBLIC_SENTRY_DSN: "", SENTRY_DSN: "" }),
};

// Invoke Next directly — avoids Windows ENOENT when pnpm is only available as pnpm.ps1.
const child = spawn(process.execPath, [nextBin, ...nextDevArgs], {
  cwd: dashboardDir,
  env: nextEnv,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
