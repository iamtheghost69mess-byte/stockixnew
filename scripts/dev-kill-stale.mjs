/**
 * Stop stale Stockix local dev processes (orphaned after Ctrl+C or IDE terminal close).
 *
 *   pnpm dev:kill
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Default ports used by `pnpm dev` (Postgres 15432 is docker — not killed). */
const DEV_PORTS = [3000, 3001, 3003, 3004, 4000, 8010, 9090];

const NEXT_LOCKS = [
  path.join(repoRoot, "apps", "dashboard", ".next", "dev", "lock"),
  path.join(repoRoot, "services", "pms", "frontend", ".next", "dev", "lock"),
  path.join(
    repoRoot,
    "services",
    "posnew",
    "apps",
    "pos-frontend2",
    ".next",
    "dev",
    "lock",
  ),
];

/** @param {number} port @returns {Set<number>} */
function pidsOnPortWindows(port) {
  const pids = new Set();
  try {
    const out = execSync(`netstat -ano | findstr ":${port} "`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1] ?? "", 10);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
  } catch {
    /* no listeners */
  }
  return pids;
}

/** @param {number} port @returns {Set<number>} */
function pidsOnPortUnix(port) {
  const pids = new Set();
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`, {
      encoding: "utf8",
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = parseInt(line.trim(), 10);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
  } catch {
    /* no listeners */
  }
  return pids;
}

const isWin = process.platform === "win32";
const killed = new Set();

console.log("[dev:kill] Stopping listeners on dev ports…\n");

for (const port of DEV_PORTS) {
  const pids = isWin ? pidsOnPortWindows(port) : pidsOnPortUnix(port);
  for (const pid of pids) {
    if (killed.has(pid)) continue;
    try {
      if (isWin) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      }
      killed.add(pid);
      console.log(`  port ${port} → stopped PID ${pid}`);
    } catch {
      console.warn(`  port ${port} → could not stop PID ${pid}`);
    }
  }
}

for (const lockPath of NEXT_LOCKS) {
  if (!existsSync(lockPath)) continue;
  try {
    rmSync(lockPath, { force: true });
    console.log(`  removed ${path.relative(repoRoot, lockPath)}`);
  } catch (err) {
    console.warn(
      `  could not remove ${path.relative(repoRoot, lockPath)}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

if (killed.size === 0) {
  console.log("\n[dev:kill] No stale listeners found. Run: pnpm dev");
} else {
  console.log(`\n[dev:kill] Stopped ${killed.size} process(es). Run: pnpm dev`);
}
