import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root (contains `apps/`, `packages/`, `infra/`). */
export function getRepoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}
