import { execa } from "execa";

/** External networks referenced by tenant/POS compose files. */
const REQUIRED_EXTERNAL_NETWORKS = ["stockix-shared", "stockix_public"] as const;

/** Create missing Docker networks before compose (local dev may skip infra/prod stack). */
export async function ensureTenantExternalNetworks(
  log: (message: string) => void,
): Promise<void> {
  for (const name of REQUIRED_EXTERNAL_NETWORKS) {
    try {
      await execa("docker", ["network", "inspect", name], { stdio: "pipe" });
    } catch {
      log(`[preflight] creating Docker network ${name}`);
      await execa("docker", ["network", "create", name], { stdio: "pipe" });
    }
  }
}
