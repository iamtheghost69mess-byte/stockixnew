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

/** When true, routing is via Traefik Docker provider labels; no file config is written. */
function useDockerLabels(): boolean {
  const flag = process.env.TRAEFIK_LABELS_ENABLED?.trim().toLowerCase();
  return flag === "true" || flag === "1";
}

/** Ensure the nginx container is on the Traefik network.
 *
 *  This is now a **verify-and-reconnect** rather than the sole connection point:
 *  the tenant docker-compose.yml declares `stockix_public` as an external network,
 *  so nginx is connected at `docker compose up`. This function handles edge-cases
 *  (container recreated outside compose, manual disconnect, etc.).
 *
 *  Returns the container's IP on the Traefik network, or null if unavailable.
 */
async function ensureNginxOnTraefikNetwork(
  composeProjectName: string,
): Promise<string | null> {
  const traefikNetwork = process.env.TRAEFIK_NETWORK ?? "stockix_public";
  const containerName = `${composeProjectName}-nginx-1`;
  try {
    // Idempotent: docker network connect is a no-op if already connected.
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
      return ip;
    }
  } catch {
    // Fall through — caller will use fallback.
  }
  return null;
}

/**
 * Write a Traefik dynamic YAML config for a tenant.
 *
 * When Docker labels are enabled (`TRAEFIK_LABELS_ENABLED=true`), routing is
 * handled entirely by Traefik's Docker provider. No file config is written and
 * any stale file is removed to prevent duplicate-router conflicts.
 *
 * When Docker labels are disabled (local dev), the file-based approach is used
 * with a direct upstream URL resolved from the nginx container's network IP.
 */
export async function writeTenantTraefikConfig(
  slug: string,
  port: number,
  domain: string,
  composeProjectName?: string,
): Promise<void> {
  const dir = traefikDir();
  await mkdir(dir, { recursive: true });

  // When Docker labels are active, Traefik discovers nginx automatically via
  // the Docker provider. We skip writing a file-based config to avoid conflicts
  // (duplicate router names between Docker labels and file provider).
  if (useDockerLabels()) {
    // Still ensure the nginx container is on the Traefik network as a safety net.
    if (composeProjectName) {
      await ensureNginxOnTraefikNetwork(composeProjectName);
    }
    // Remove any stale file config that might conflict with Docker labels.
    await removeTenantTraefikConfig(slug).catch(() => undefined);
    return;
  }

  // Fallback: file-based config for environments not using Docker labels.
  let upstreamUrl: string;
  if (composeProjectName) {
    const ip = await ensureNginxOnTraefikNetwork(composeProjectName);
    upstreamUrl = ip ? `http://${ip}:80` : `http://${tenantUpstreamHost()}:${port}`;
  } else {
    upstreamUrl = `http://${tenantUpstreamHost()}:${port}`;
  }

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
