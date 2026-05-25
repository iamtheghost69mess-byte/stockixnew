/**
 * Next.js dev with automatic port fallback when the preferred port is busy.
 */
import { spawn } from "node:child_process";
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

const nextArgs = [
  "exec",
  "next",
  "dev",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
  ...(useWebpack ? ["--webpack"] : ["--turbopack"]),
];

const child = spawn("pnpm", nextArgs, {
  cwd: dashboardDir,
  env: { ...process.env, PORT: String(port) },
  stdio: "inherit",
  // shell:true on Windows can drop forwarded args to pnpm; keep false for reliable --webpack.
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
