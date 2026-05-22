import { join } from "node:path";
import { execa } from "execa";
import { apiConfig } from "@repo/config";

function repoRoot(): string {
  return apiConfig.repoRoot ?? process.cwd();
}

export function resolveTenantModules(inputModules?: string[]): string[] {
  if (inputModules && inputModules.length > 0) return inputModules;
  return ["accounting"];
}

export function isModuleGatingEnabled(): boolean {
  return process.env.PROVISION_MODULE_GATING === "1";
}

export async function provisionPosStack(opts: {
  slug: string;
  tenantId: string;
  log: (m: string) => void;
}): Promise<void> {
  const composeFile = join(repoRoot(), "infra", "pos-tenant-stack", "docker-compose.yml");
  const project = `stockix-pos-${opts.slug}`;
  const posAppRoot = process.env.POS_APP_ROOT ?? join(repoRoot(), "services", "posnew");
  opts.log(`[provision][pos] compose up project=${project}`);
  await execa(
    "docker",
    ["compose", "-f", composeFile, "-p", project, "up", "-d", "--build"],
    {
      env: {
        ...process.env,
        COMPOSE_PROJECT_NAME: project,
        POS_APP_ROOT: posAppRoot,
        TENANT_ID: opts.tenantId,
        AUTH_TOKEN_SECRET: apiConfig.authTokenSecret ?? "",
      },
      stdio: "inherit",
    },
  );
}

export async function provisionPmsStack(opts: {
  slug: string;
  tenantId: string;
  log: (m: string) => void;
}): Promise<void> {
  const composeFile = join(repoRoot(), "infra", "pms-tenant-stack", "docker-compose.yml");
  const project = `stockix-pms-${opts.slug}`;
  const pmsAppRoot = process.env.PMS_APP_ROOT ?? join(repoRoot(), "services", "pms");
  opts.log(`[provision][pms] compose up project=${project}`);
  await execa(
    "docker",
    ["compose", "-f", composeFile, "-p", project, "up", "-d", "--build"],
    {
      env: {
        ...process.env,
        COMPOSE_PROJECT_NAME: project,
        PMS_APP_ROOT: pmsAppRoot,
        TENANT_ID: opts.tenantId,
        AUTH_TOKEN_SECRET: apiConfig.authTokenSecret ?? "",
        PLATFORM_API_SECRET: apiConfig.platformApiSecret ?? "",
        DATABASE_URL: process.env.DATABASE_URL ?? "",
      },
      stdio: "inherit",
    },
  );
}
