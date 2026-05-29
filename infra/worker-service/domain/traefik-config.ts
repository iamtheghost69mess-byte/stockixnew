import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { apiConfig } from "@repo/config";

function traefikDir(): string {
  return apiConfig.traefikDynamicDir;
}

function tenantUpstreamHost(): string {
  return apiConfig.traefikTenantUpstreamHost;
}

/** Connect the nginx container to the Traefik network and return its direct URL.
 *  Falls back to host.docker.internal:port if the network connect/inspect fails.
 */
async function resolveNginxDirectUrl(
  composeProjectName: string,
  fallbackPort: number,
): Promise<string> {
  const traefikNetwork = process.env.TRAEFIK_NETWORK ?? "stockix_public";
  const containerName = `${composeProjectName}-nginx-1`;
  try {
    await execa("docker", ["network", "connect", traefikNetwork, containerName], {
      stdio: "pipe",
      reject: false,
    });
    const { stdout } = await execa(
      "docker",
      [
        "inspect",
        "--format",
        `{{(index .NetworkSettings.Networks "${traefikNetwork}").IPAddress}}`,
        containerName,
      ],
      { stdio: "pipe" },
    );
    const ip = stdout.trim();
    if (ip && ip !== "<no value>" && ip !== "") {
      return `http://${ip}:80`;
    }
  } catch {
    // Fall through to host-port fallback.
  }
  return `http://${tenantUpstreamHost()}:${fallbackPort}`;
}

export async function writeTenantTraefikConfig(
  slug: string,
  port: number,
  domain: string,
  composeProjectName?: string,
): Promise<void> {
  const dir = traefikDir();
  await mkdir(dir, { recursive: true });
  const upstreamUrl = composeProjectName
    ? await resolveNginxDirectUrl(composeProjectName, port)
    : `http://${tenantUpstreamHost()}:${port}`;
  const config =
    `http:\n` +
    `  routers:\n` +
    `    tenant-${slug}:\n` +
    `      rule: "Host(\`${slug}.${domain}\`)"\n` +
    `      entryPoints:\n` +
    `        - websecure\n` +
    `      tls:\n` +
    `        certResolver: cloudflare\n` +
    `      service: tenant-${slug}\n` +
    `  services:\n` +
    `    tenant-${slug}:\n` +
    `      loadBalancer:\n` +
    `        servers:\n` +
    `          - url: "${upstreamUrl}"\n`;
  await writeFile(join(dir, `tenant-${slug}.yml`), config, "utf8");
}

export async function removeTenantTraefikConfig(slug: string): Promise<void> {
  try {
    await unlink(join(traefikDir(), `tenant-${slug}.yml`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("no such file")) {
      throw error;
    }
  }
}

export async function writePosTraefikConfig(
  slug: string,
  backendPort: number,
  frontendPort: number,
  domain: string,
): Promise<void> {
  const dir = traefikDir();
  await mkdir(dir, { recursive: true });
  const host = tenantUpstreamHost();
  const config =
    `http:\n` +
    `  routers:\n` +
    `    tenant-pos-${slug}:\n` +
    `      rule: "Host(\`${slug}-pos.${domain}\`)"\n` +
    `      entryPoints:\n` +
    `        - websecure\n` +
    `      tls:\n` +
    `        certResolver: cloudflare\n` +
    `      service: tenant-pos-${slug}-frontend\n` +
    `    tenant-pos-api-${slug}:\n` +
    `      rule: "Host(\`${slug}-pos-api.${domain}\`)"\n` +
    `      entryPoints:\n` +
    `        - websecure\n` +
    `      tls:\n` +
    `        certResolver: cloudflare\n` +
    `      service: tenant-pos-${slug}-backend\n` +
    `  services:\n` +
    `    tenant-pos-${slug}-frontend:\n` +
    `      loadBalancer:\n` +
    `        servers:\n` +
    `          - url: "http://${host}:${frontendPort}"\n` +
    `    tenant-pos-${slug}-backend:\n` +
    `      loadBalancer:\n` +
    `        servers:\n` +
    `          - url: "http://${host}:${backendPort}"\n`;
  await writeFile(join(dir, `tenant-pos-${slug}.yml`), config, "utf8");
}

export async function removePosTraefikConfig(slug: string): Promise<void> {
  try {
    await unlink(join(traefikDir(), `tenant-pos-${slug}.yml`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("no such file")) {
      throw error;
    }
  }
}
