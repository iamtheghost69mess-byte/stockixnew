import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiConfig } from "@repo/config";

function traefikDir(): string {
  return apiConfig.traefikDynamicDir;
}

function tenantUpstreamHost(): string {
  return apiConfig.traefikTenantUpstreamHost;
}

export async function writeTenantTraefikConfig(
  slug: string,
  port: number,
  domain: string,
  _composeProjectName?: string,
): Promise<void> {
  const dir = traefikDir();
  await mkdir(dir, { recursive: true });
  // Direct to Finance server — per-tenant nginx removed.
  const upstreamUrl = `http://${tenantUpstreamHost()}:${port}`;
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
  // POS upstream: host.docker.internal:{posPort}
  // Port uniqueness enforced by assertTenantPortAvailable before this write (provision-runtime / module-stacks)
  // Port range: tenant_port_seq through MAX_TENANT_PORT (apiConfig.maxTenantPort)
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
