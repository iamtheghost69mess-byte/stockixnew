/**
 * Tenant-facing PMS Next.js app (services/pms/frontend).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFilesAtRoot } from "./load-root-env.mjs";
import { findFreePort } from "./find-free-port.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(repoRoot, "services", "pms", "frontend");

loadEnvFilesAtRoot(repoRoot);

const preferred = parseInt(process.env.PMS_FRONTEND_PORT || "3004", 10);
const strict = process.env.STOCKIX_DEV_STRICT_PORT === "1";
const port = strict ? preferred : await findFreePort(preferred);

const pmsApi = (process.env.PMS_BASE_URL || `http://127.0.0.1:${process.env.PMS_PORT || "3003"}`).replace(
  /\/$/,
  "",
);

if (port !== preferred) {
  console.warn(`[pms-ui] Port ${preferred} busy — UI at http://localhost:${port}`);
}

const env = {
  ...process.env,
  PORT: String(port),
  PMS_FRONTEND_PORT: String(port),
  NEXT_PUBLIC_PMS_API_URL: pmsApi,
};

console.log(`[pms-ui] Tenant PMS app → http://localhost:${port}`);
console.log(`[pms-ui] API target     → ${pmsApi}`);

const child = spawn("pnpm", ["exec", "next", "dev", "--port", String(port)], {
  cwd: frontendDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
