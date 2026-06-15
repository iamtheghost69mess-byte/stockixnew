import { homedir } from "node:os";
import { join } from "node:path";
import { apiConfig } from "@repo/config";

const isWin = process.platform === "win32";

export function defaultTenantEnvRoot(): string {
  const override = apiConfig.tenantEnvRoot;
  if (override) return override;
  if (isWin) return join(homedir(), ".stockix", "tenants");
  if (apiConfig.nodeEnv !== "production") return join(homedir(), ".stockix", "tenants");
  return "/opt/stockix/tenants";
}
