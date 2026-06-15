"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.provisionTenant = provisionTenant;
exports.deprovisionTenant = deprovisionTenant;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const schema_1 = require("@repo/db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const env_paths_js_1 = require("./env-paths.js");
const provision_paths_js_1 = require("./provision-paths.js");
const compose_project_name_js_1 = require("./provisioning/compose-project-name.js");
const tenant_provision_service_js_1 = require("./provisioning/tenant-provision-service.js");
const crypto_tenant_secret_generator_js_1 = require("./provisioning/adapters/crypto-tenant-secret-generator.js");
const execa_docker_compose_runner_js_1 = require("./provisioning/adapters/execa-docker-compose-runner.js");
const fetch_stockix_finance_bootstrap_js_1 = require("./provisioning/adapters/fetch-stockix-finance-bootstrap.js");
const traefik_edge_publisher_js_1 = require("./provisioning/adapters/traefik-edge-publisher.js");
const dockerRunner = new execa_docker_compose_runner_js_1.ExecaDockerComposeRunner();
const edgePublisher = new traefik_edge_publisher_js_1.TraefikEdgePublisher();
const tenantProvisionService = new tenant_provision_service_js_1.TenantProvisionService({
    docker: dockerRunner,
    secrets: new crypto_tenant_secret_generator_js_1.CryptoTenantSecretGenerator(),
    finance: new fetch_stockix_finance_bootstrap_js_1.FetchStockixFinanceBootstrap(),
    edge: edgePublisher,
});
async function provisionTenant(db, input, log, correlationId, assertNotCancelled) {
    return tenantProvisionService.provision(db, input, log, correlationId, assertNotCancelled);
}
async function deprovisionTenant(db, tenantId, options = {}) {
    const log = options.log ?? (() => undefined);
    const found = await db
        .select({ id: schema_1.tenants.id, slug: schema_1.tenants.slug, composeProject: schema_1.tenantDeployments.composeProjectName })
        .from(schema_1.tenants)
        .leftJoin(schema_1.tenantDeployments, (0, drizzle_orm_1.eq)(schema_1.tenantDeployments.tenantId, schema_1.tenants.id))
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, tenantId))
        .limit(1);
    const row = found[0];
    if (!row)
        return { ok: false, message: "Tenant not found" };
    const project = row.composeProject ?? (0, compose_project_name_js_1.composeProjectName)(row.slug);
    const { tenantComposeFile: composeFile, stockixFinanceRoot } = (0, provision_paths_js_1.getTenantStackPaths)();
    const envPath = (0, node_path_1.join)((0, env_paths_js_1.defaultTenantEnvRoot)(), row.slug, ".env");
    const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };
    let dockerStatus = "skipped";
    try {
        await (0, promises_1.stat)(envPath);
        const downArgs = ["down", "--remove-orphans", "--timeout", "30"];
        if (options.removeVolumes) {
            downArgs.push("-v");
        }
        if (options.removeImages) {
            downArgs.push("--rmi", "local");
        }
        await dockerRunner.run(composeFile, project, envPath, composeEnv, downArgs, { timeoutMs: 2 * 60 * 1000 });
        dockerStatus = "stopped";
    }
    catch {
        dockerStatus = "skipped";
    }
    await edgePublisher.unpublish(row.slug).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log(`edge unpublish failed for ${row.slug}: ${message}`);
    });
    await db.delete(schema_1.tenantProvisionEvents).where((0, drizzle_orm_1.eq)(schema_1.tenantProvisionEvents.tenantId, tenantId));
    await db.delete(schema_1.adminAuditLog).where((0, drizzle_orm_1.eq)(schema_1.adminAuditLog.targetTenantId, tenantId));
    await db.delete(schema_1.tenantDeployments).where((0, drizzle_orm_1.eq)(schema_1.tenantDeployments.tenantId, tenantId));
    await db.delete(schema_1.tenants).where((0, drizzle_orm_1.eq)(schema_1.tenants.id, tenantId));
    await (0, promises_1.rm)((0, node_path_1.join)((0, env_paths_js_1.defaultTenantEnvRoot)(), row.slug), { recursive: true, force: true }).catch(() => undefined);
    log(`deprovision done for ${project}`);
    return { ok: true, slug: row.slug, composeProject: project, docker: dockerStatus };
}
