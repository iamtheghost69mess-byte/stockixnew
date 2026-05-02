import { join } from "node:path";

import { getRepoRoot } from "./repo-root.js";

export type TenantStackPaths = {
  /** Monorepo root (`apps/`, `packages/`, `infra/`). */
  repoRoot: string;
  /** Stockix Finance app root (Lerna package with `packages/server`, `docker/nginx`, …). */
  stockixFinanceRoot: string;
  /** Compose file for per-tenant Docker stacks. */
  tenantComposeFile: string;
};

/**
 * Filesystem layout for provisioning. In production, set `REPO_ROOT` and
 * `STOCKIX_TENANT_APP_ROOT` to the paths mounted on the host (see `infra/prod/docker-compose.yml`).
 */
export function getTenantStackPaths(): TenantStackPaths {
  const repoRoot = getRepoRoot();
  const stockixFinanceRoot =
    process.env.STOCKIX_TENANT_APP_ROOT?.trim() ||
    join(repoRoot, "services/stockix-finance");
  return {
    repoRoot,
    stockixFinanceRoot,
    tenantComposeFile: join(repoRoot, "infra/tenant-stack/docker-compose.yml"),
  };
}
