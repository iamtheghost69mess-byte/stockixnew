/**
 * Next.js dev with automatic port fallback when the preferred port is busy.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findFreePort } from "./find-free-port.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardDir = path.join(repoRoot, "apps", "dashboard");

const preferred = parseInt(
  process.env.DASHBOARD_PORT || process.env.PORT || "3000",
  10,
);
const strict = process.env.STOCKIX_DEV_STRICT_PORT === "1";
const port = strict ? preferred : await findFreePort(preferred);

if (port !== preferred) {
  console.warn(
    `[dashboard] Port ${preferred} is in use — using http://localhost:${port} instead`,
  );
} else {
  console.log(`[dashboard] http://localhost:${port}`);
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
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
  ...(useWebpack ? ["--webpack"] : ["--turbopack"]),
];

// Invoke Next directly — avoids Windows ENOENT when pnpm is only available as pnpm.ps1.
const child = spawn(process.execPath, [nextBin, ...nextDevArgs], {
  cwd: dashboardDir,
  env: { ...process.env, PORT: String(port) },
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
