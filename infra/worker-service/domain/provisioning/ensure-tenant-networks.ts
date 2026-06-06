import { execa } from "execa";

/** External networks referenced by tenant/POS compose files. */
const REQUIRED_EXTERNAL_NETWORKS = ["stockix-shared", "stockix_public"] as const;

async function dockerNetworkExists(name: string): Promise<boolean> {
  try {
    await execa("docker", ["network", "inspect", name], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure external Docker networks exist before compose.
 * Production: fail if missing (prod/shared stacks must be up). Dev: auto-create for local runs.
 */
export async function ensureTenantExternalNetworks(
  log: (message: string) => void,
): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  for (const name of REQUIRED_EXTERNAL_NETWORKS) {
    if (await dockerNetworkExists(name)) continue;
    if (isProduction) {
      throw new Error(
        `[preflight] Docker network ${name} is missing — start infra/shared and infra/prod stacks before provisioning`,
      );
    }
    log(`[preflight] creating Docker network ${name}`);
    await execa("docker", ["network", "create", name], { stdio: "pipe" });
  }
}
