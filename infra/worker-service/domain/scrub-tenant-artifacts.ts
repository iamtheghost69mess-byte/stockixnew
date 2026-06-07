import { rm } from "node:fs/promises";
import { execa } from "execa";

function composeProjectFromSlug(slug: string): string {
  return `stockix-${slug}`;
}

async function bestEffortDockerProjectCleanup(project: string): Promise<void> {
  try {
    await execa("docker", ["compose", "-p", project, "down", "--volumes", "--remove-orphans"], {
      stdio: "pipe",
    });
  } catch {
    // Best-effort cleanup only.
  }

  try {
    const { stdout } = await execa("docker", ["ps", "-a", "--format", "{{.ID}}\t{{.Names}}"]);
    const ids = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("\t"))
      .filter((parts) => parts.length === 2 && parts[1]?.startsWith(`${project}-`))
      .map((parts) => parts[0]!)
      .filter(Boolean);
    if (ids.length > 0) {
      await execa("docker", ["rm", "-f", ...ids], { stdio: "pipe" });
    }
  } catch {
    // Best-effort cleanup only.
  }

  try {
    const { stdout } = await execa("docker", ["volume", "ls", "--format", "{{.Name}}"]);
    const volumes = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((name) => name.startsWith(`${project}_`));
    if (volumes.length > 0) {
      await execa("docker", ["volume", "rm", "-f", ...volumes], { stdio: "pipe" });
    }
  } catch {
    // Best-effort cleanup only.
  }

  try {
    await execa("docker", ["network", "rm", `${project}_default`], { stdio: "pipe" });
  } catch {
    // Best-effort cleanup only.
  }
}

/** P0-4: Docker scrub runs in the worker, not the API request path. */
export async function scrubTenantRuntimeArtifacts(slug: string): Promise<void> {
  const tenantEnvRoot = process.env.TENANT_ENV_ROOT?.trim() || "/opt/stockix/tenants";
  const traefikDynamicDir =
    process.env.TRAEFIK_DYNAMIC_DIR?.trim() || "/opt/stockix/traefik-dynamic";
  const project = composeProjectFromSlug(slug);
  await bestEffortDockerProjectCleanup(project);
  await bestEffortDockerProjectCleanup(`stockix-pos-${slug}`);
  await rm(`${tenantEnvRoot}/${slug}`, { recursive: true, force: true }).catch(() => undefined);
  await rm(`${traefikDynamicDir}/tenant-${slug}.yml`, { force: true }).catch(() => undefined);
  await rm(`${traefikDynamicDir}/tenant-pos-${slug}.yml`, { force: true }).catch(
    () => undefined,
  );
}
