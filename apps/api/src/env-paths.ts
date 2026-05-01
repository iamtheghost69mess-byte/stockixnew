import { homedir } from "node:os";
import { join } from "node:path";

const isWin = process.platform === "win32";

/** Root directory for per-tenant generated `.env` files (`{root}/{slug}/.env`). */
export function defaultTenantEnvRoot(): string {
  const override = process.env.TENANT_ENV_ROOT?.trim();
  if (override) return override;
  if (isWin) return join(homedir(), ".stockix", "tenants");
  return "/opt/stockix/tenants";
}
