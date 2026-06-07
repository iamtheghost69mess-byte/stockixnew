/**
 * Stop stale Stockix local dev processes (orphaned after Ctrl+C or IDE terminal close).
 *
 *   pnpm dev:kill
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isPortFree } from "./find-free-port.mjs";

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

/** @param {string} cmdLine */
function isEditorOrMcpProcess(cmdLine) {
  return /cursor[\\/]resources|modelcontextprotocol|next-devtools-mcp|vscode-typescript|tsserver|npm-cache[\\/]_npx/i.test(
    cmdLine,
  );
}

/** @param {string} cmdLine */
function isOrphanedWorker(cmdLine) {
  if (!cmdLine || isEditorOrMcpProcess(cmdLine)) return false;
  if (/dev-worker\.mjs/i.test(cmdLine)) return true;
  if (/worker-service[\\/]+\.runtime[\\/]+worker\.js/i.test(cmdLine)) return true;
  if (/infra[\\/]+worker-service[\\/]+.*worker\.js/i.test(cmdLine)) return true;
  return false;
}

/** Kill orphaned infra worker processes. */
function killOrphanedWorkers() {
  killOrphanedWatchers(isOrphanedWorker, "infra worker");
}

/** @param {string} cmdLine */
function isOrphanedApiWatcher(cmdLine) {
  if (!cmdLine || isEditorOrMcpProcess(cmdLine)) return false;
  if (/dev-api\.mjs/i.test(cmdLine)) return true;
  if (/apps[\\/]+api.*tsx.*index/i.test(cmdLine)) return true;
  if (/--watch.*apps[\\/]+api/i.test(cmdLine)) return true;
  if (/--watch-path=src.*apps[\\/]+api/i.test(cmdLine)) return true;
  if (/tsx.*src[\\/]index\.ts/i.test(cmdLine) && /apps[\\/]+api/i.test(cmdLine)) return true;
  if (
    /--watch-path=src/i.test(cmdLine) &&
    /tsx/i.test(cmdLine) &&
    /src[\\/]index\.ts/i.test(cmdLine) &&
    !/services[\\/]pms/i.test(cmdLine)
  ) {
    return true;
  }
  return false;
}

/** @param {string} cmdLine */
function isOrphanedPmsWatcher(cmdLine) {
  if (!cmdLine || isEditorOrMcpProcess(cmdLine)) return false;
  if (/dev-pms\.mjs/i.test(cmdLine)) return false;
  if (/services[\\/]+pms/i.test(cmdLine) && /tsx/i.test(cmdLine)) return true;
  if (/services[\\/]+pms/i.test(cmdLine) && /src[\\/]index\.ts/i.test(cmdLine)) return true;
  return false;
}

/** @returns {{ pid: number; cmdLine: string }[]} */
function listNodeProcessesWindows() {
  /** @type {{ pid: number; cmdLine: string }[]} */
  const rows = [];
  try {
    const out = execSync(
      'wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv',
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
    );
    for (const line of out.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("Node,")) continue;
      const lastComma = trimmed.lastIndexOf(",");
      if (lastComma <= 0) continue;
      const pid = parseInt(trimmed.slice(lastComma + 1).trim(), 10);
      const firstComma = trimmed.indexOf(",");
      let cmdLine = trimmed.slice(firstComma + 1, lastComma).trim();
      if (cmdLine.startsWith('"') && cmdLine.endsWith('"')) {
        cmdLine = cmdLine.slice(1, -1);
      }
      if (Number.isFinite(pid) && pid > 0) rows.push({ pid, cmdLine });
    }
  } catch {
    /* none */
  }
  return rows;
}

/** @returns {{ pid: number; cmdLine: string }[]} */
function listNodeProcessesUnix() {
  /** @type {{ pid: number; cmdLine: string }[]} */
  const rows = [];
  try {
    const out = execSync("ps aux", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("node")) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;
      const pid = parseInt(parts[1] ?? "", 10);
      const cmdLine = parts.slice(10).join(" ");
      if (Number.isFinite(pid) && pid > 0) rows.push({ pid, cmdLine });
    }
  } catch {
    /* none */
  }
  return rows;
}

/**
 * @param {(cmdLine: string) => boolean} matcher
 * @param {string} label
 */
function killOrphanedWatchers(matcher, label) {
  const processes = isWin ? listNodeProcessesWindows() : listNodeProcessesUnix();
  let orphanKills = 0;

  for (const { pid, cmdLine } of processes) {
    if (killed.has(pid) || !matcher(cmdLine)) continue;
    try {
      if (isWin) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      }
      killed.add(pid);
      orphanKills++;
      console.log(`  → Killed orphaned ${label} PID ${pid}`);
    } catch {
      console.warn(`  → Could not kill orphaned ${label} PID ${pid}`);
    }
  }

  if (orphanKills === 0) {
    console.log(`  → No orphaned ${label} found`);
  }
}

/** Kill orphaned API watcher processes (including non-listening node --watch). */
function killOrphanedApiWatchers() {
  killOrphanedWatchers(isOrphanedApiWatcher, "API watcher");
}

/** Kill orphaned PMS tsx watch processes (often survive Ctrl+C on Windows). */
function killOrphanedPmsWatchers() {
  killOrphanedWatchers(isOrphanedPmsWatcher, "PMS watcher");
}

/**
 * Stop processes listening on the given ports (does not verify port 4000).
 * @param {number[]} ports
 * @returns {Promise<number>} count of processes stopped
 */
export async function killListenersOnPorts(ports) {
  let stopped = 0;
  for (const port of ports) {
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
        stopped++;
        console.log(`  port ${port} → stopped PID ${pid}`);
      } catch {
        console.warn(`  port ${port} → could not stop PID ${pid}`);
      }
    }
  }
  if (stopped > 0) {
    await new Promise((r) => setTimeout(r, 500));
  }
  return stopped;
}

/** @returns {Promise<boolean>} true when bind probes report port 4000 is free */
async function isPort4000BindFree() {
  return isPortFree(4000);
}

/** @param {number} port @returns {number | null} */
function pidListeningOnPort(port) {
  const pids = isWin ? pidsOnPortWindows(port) : pidsOnPortUnix(port);
  for (const pid of pids) return pid;
  return null;
}

/** @returns {Promise<void>} */
async function verifyPort4000Free() {
  await new Promise((r) => setTimeout(r, 500));
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await isPort4000BindFree()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  const pid = pidListeningOnPort(4000);
  const pidHint = pid != null ? String(pid) : "unknown";
  console.error(
    `\n⚠ Port 4000 still in use after kill. Run manually:\n` +
      (isWin ? `   taskkill /PID ${pidHint} /F (Windows)` : `   kill -9 ${pidHint} (Linux/Mac)`),
  );
  process.exit(1);
}

export async function runDevKillStale() {
  console.log("[dev:kill] Stopping listeners on dev ports…\n");

  await killListenersOnPorts(DEV_PORTS);

  console.log("\n[dev:kill] Scanning for orphaned API watchers…");
  killOrphanedApiWatchers();

  console.log("\n[dev:kill] Scanning for orphaned PMS watchers…");
  killOrphanedPmsWatchers();

  console.log("\n[dev:kill] Scanning for orphaned infra workers…");
  killOrphanedWorkers();

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

  await verifyPort4000Free();

  if (killed.size === 0) {
    console.log("\n[dev:kill] No stale listeners found. Run: pnpm dev");
  } else {
    console.log(`\n[dev:kill] Stopped ${killed.size} process(es). Run: pnpm dev`);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  await runDevKillStale();
}
