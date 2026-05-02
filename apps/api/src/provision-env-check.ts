/**
 * Fail fast before Docker / DB side effects when paths or dirs required for provisioning are wrong.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export type ProvisionEnvCheckResult =
  | { ok: true }
  | { ok: false; message: string; hint?: string };

export async function checkProvisionEnvironment(params: {
  repoRoot: string;
  bigcapitalRoot: string;
  composeFile: string;
  tenantEnvRoot: string;
}): Promise<ProvisionEnvCheckResult> {
  const { bigcapitalRoot, composeFile, tenantEnvRoot } = params;

  if (!existsSync(composeFile)) {
    return {
      ok: false,
      message: `Compose file missing: ${composeFile}`,
      hint: "API must run from a Stockix repo checkout where infra/tenant-stack/docker-compose.yml exists.",
    };
  }

  if (!existsSync(bigcapitalRoot)) {
    return {
      ok: false,
      message: `BIGCAPITAL_ROOT does not exist: ${bigcapitalRoot}`,
      hint: "In apps/api/.env set BIGCAPITAL_ROOT to an absolute path to services/bigcapital on this machine.",
    };
  }

  const serverDockerfile = join(bigcapitalRoot, "packages/server/Dockerfile");
  if (!existsSync(serverDockerfile)) {
    return {
      ok: false,
      message: `BIGCAPITAL_ROOT is not the BigCapital monorepo root (missing packages/server/Dockerfile): ${bigcapitalRoot}`,
      hint: "Point BIGCAPITAL_ROOT at the same directory Docker build uses (contains packages/server, docker/nginx).",
    };
  }

  const nginxDir = join(bigcapitalRoot, "docker/nginx");
  if (!existsSync(nginxDir)) {
    return {
      ok: false,
      message: `BIGCAPITAL_ROOT invalid (missing docker/nginx): ${bigcapitalRoot}`,
    };
  }

  try {
    await mkdir(tenantEnvRoot, { recursive: true, mode: 0o700 });
  } catch (e) {
    return {
      ok: false,
      message: `Cannot create or use TENANT_ENV_ROOT ${tenantEnvRoot}: ${e instanceof Error ? e.message : String(e)}`,
      hint: "Set TENANT_ENV_ROOT in apps/api/.env to a writable absolute path (e.g. %USERPROFILE%\\.stockix\\tenants on Windows).",
    };
  }

  return { ok: true };
}
