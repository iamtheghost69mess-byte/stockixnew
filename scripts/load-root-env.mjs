/**
 * Match `packages/config`: load repo-root `.env` then `.env.local` (overrides).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

/** @param {string} repoRoot - absolute path to monorepo root (where `.env` lives) */
export function loadEnvFilesAtRoot(repoRoot) {
  const base = path.join(repoRoot, ".env");
  const local = path.join(repoRoot, ".env.local");
  if (existsSync(base)) loadEnv({ path: base, override: false });
  if (existsSync(local)) loadEnv({ path: local, override: true });
}

/** For files under repo `scripts/` only — resolves root as parent of that directory. */
export function loadRootEnv(importMetaUrl) {
  const root = path.join(path.dirname(fileURLToPath(importMetaUrl)), "..");
  loadEnvFilesAtRoot(root);
  return root;
}
