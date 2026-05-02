import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root (contains `apps/`, `packages/`, `infra/`). */
export function getRepoRoot(): string {
  const override = process.env.REPO_ROOT?.trim();
  if (override) return override;
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}
