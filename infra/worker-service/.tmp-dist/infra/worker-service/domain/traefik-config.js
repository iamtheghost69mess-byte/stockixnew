"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeTenantTraefikConfig = writeTenantTraefikConfig;
exports.removeTenantTraefikConfig = removeTenantTraefikConfig;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const config_1 = require("@repo/config");
function traefikDir() {
    return config_1.apiConfig.traefikDynamicDir;
}
function tenantUpstreamHost() {
    return config_1.apiConfig.traefikTenantUpstreamHost;
}
async function writeTenantTraefikConfig(slug, port, domain) {
    const dir = traefikDir();
    await (0, promises_1.mkdir)(dir, { recursive: true });
    const config = `http:\n` +
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
    await (0, promises_1.writeFile)((0, node_path_1.join)(dir, `tenant-${slug}.yml`), config, "utf8");
}
async function removeTenantTraefikConfig(slug) {
    try {
        await (0, promises_1.unlink)((0, node_path_1.join)(traefikDir(), `tenant-${slug}.yml`));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes("no such file")) {
            throw error;
        }
    }
}
