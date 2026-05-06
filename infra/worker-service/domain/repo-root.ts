import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apiConfig } from "@repo/config";

export function getRepoRoot(): string {
  const override = apiConfig.repoRoot;
  if (override) return override;
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
}
