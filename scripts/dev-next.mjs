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

const child = spawn(
  "pnpm",
  ["exec", "next", "dev", "--port", String(port)],
  {
    cwd: dashboardDir,
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
