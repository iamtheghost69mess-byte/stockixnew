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
): Promise<void> {
  const dir = traefikDir();
  await mkdir(dir, { recursive: true });
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
    `          - url: "http://${tenantUpstreamHost()}:${port}"\n`;
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
