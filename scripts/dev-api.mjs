/**
 * API dev with automatic port fallback when port 4000 (or PORT) is busy.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findFreePort } from "./find-free-port.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(repoRoot, "apps", "api");

const preferred = parseInt(process.env.PORT || "4000", 10);
const strict = process.env.STOCKIX_DEV_STRICT_PORT === "1";
const port = strict ? preferred : await findFreePort(preferred);

if (port !== preferred) {
  console.warn(
    `[api] Port ${preferred} is in use — using http://localhost:${port} instead`,
  );
} else {
  console.log(`[api] http://localhost:${port}`);
}

const child = spawn("pnpm", ["exec", "tsx", "watch", "src/index.ts"], {
  cwd: apiDir,
  env: { ...process.env, PORT: String(port) },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
