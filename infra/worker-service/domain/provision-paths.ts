import { join } from "node:path";
import { apiConfig } from "@repo/config";
import { getRepoRoot } from "./repo-root.js";

export type TenantStackPaths = {
  repoRoot: string;
  stockixFinanceRoot: string;
  tenantComposeFile: string;
};

export function getTenantStackPaths(): TenantStackPaths {
  const repoRoot = getRepoRoot();
  const stockixFinanceRoot = apiConfig.stockixTenantAppRoot || join(repoRoot, "services/stockix-finance");
  return {
    repoRoot,
    stockixFinanceRoot,
    tenantComposeFile: join(repoRoot, "infra/tenant-stack/docker-compose.yml"),
  };
}
