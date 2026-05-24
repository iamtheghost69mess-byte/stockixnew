import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { apiConfig } from "@repo/config";

export function getRepoRoot(): string {
  const override = apiConfig.repoRoot;
  if (override) return override;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = join(here, "..", "..", "..");
  if (existsSync(join(candidate, "package.json"))) {
    return candidate;
  }
  // Backward-compatible fallback for unexpected layouts.
  return join(here, "..", "..", "..", "..");
}
