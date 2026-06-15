"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeProvisionRuntime = executeProvisionRuntime;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const execa_1 = require("execa");
const config_1 = require("@repo/config");
const db_1 = require("@repo/db");
const schema_1 = require("@repo/db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const env_paths_js_1 = require("../domain/env-paths.js");
const provision_paths_js_1 = require("../domain/provision-paths.js");
const provision_trace_js_1 = require("../domain/provision-trace.js");
const compose_project_name_js_1 = require("../domain/provisioning/compose-project-name.js");
const constants_js_1 = require("../domain/provisioning/constants.js");
const tenant_env_js_1 = require("../domain/provisioning/tenant-env.js");
const tenant_docker_workflow_js_1 = require("../domain/provisioning/tenant-docker-workflow.js");
function encryptDeploymentSecret(plaintext) {
    const key = Buffer.from(config_1.apiConfig.deploymentSecretKey, "hex");
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}
async function loadProvisionJournal(db, correlationId) {
    const rows = await db
        .select({
        phase: schema_1.tenantProvisionEvents.phase,
        meta: schema_1.tenantProvisionEvents.meta,
    })
        .from(schema_1.tenantProvisionEvents)
        .where((0, drizzle_orm_1.eq)(schema_1.tenantProvisionEvents.correlationId, correlationId))
        .orderBy((0, drizzle_orm_1.asc)(schema_1.tenantProvisionEvents.createdAt))
        .limit(2000);
    const journal = new Set();
    for (const row of rows) {
        if (row.phase !== "journal")
            continue;
        const key = row.meta && typeof row.meta === "object" ? row.meta.operationKey : undefined;
        if (key && key.length > 0) {
            journal.add(key);
        }
    }
    return journal;
}
async function resolveServerInternalUrl(params) {
    try {
        const { stdout } = await (0, execa_1.execa)("docker", [
            "compose",
            "-f",
            params.composeFile,
            "-p",
            params.project,
            "--env-file",
            params.envPath,
            "port",
            "server",
            "3000",
        ], { env: params.composeEnv, extendEnv: true, stdio: "pipe" });
        const trimmed = stdout.trim();
        const match = trimmed.match(/:(\d+)\s*$/);
        if (match?.[1]) {
            return `http://${params.fallbackHost}:${match[1]}`;
        }
    }
    catch {
        // Fallback keeps backward compatibility if port lookup is unavailable.
    }
    return `http://${params.fallbackHost}:${params.fallbackPort}`;
}
async function executeProvisionRuntime(deps, db, input, log, correlationId, assertNotCancelled) {
    let tenantId;
    let deploymentId;
    const trace = (0, provision_trace_js_1.createProvisionTracer)(db, correlationId, () => ({ slug: input.slug, tenantId, deploymentId }), log);
    const { tenantComposeFile: composeFile, stockixFinanceRoot } = (0, provision_paths_js_1.getTenantStackPaths)();
    const rootDomain = config_1.apiConfig.rootDomain || "example.com";
    const publicScheme = config_1.apiConfig.publicBaseUrlScheme;
    const maxPort = config_1.apiConfig.maxTenantPort;
    const tenantEnvRoot = (0, env_paths_js_1.defaultTenantEnvRoot)();
    const project = (0, compose_project_name_js_1.composeProjectName)(input.slug);
    const baseUrl = `${publicScheme}://${input.slug}.${rootDomain}`;
    const requestId = correlationId;
    let port;
    let oneTimeAdminPassword;
    let composeCtx = null;
    let sideEffectsStarted = false;
    const completedOps = await loadProvisionJournal(db, correlationId);
    const checkNotCancelled = async () => {
        if (!assertNotCancelled)
            return;
        await assertNotCancelled();
    };
    const runComposeWithCancellation = async (args) => {
        log(`[compose] starting: docker compose ${args.join(" ")}`);
        const controller = new AbortController();
        const intervalId = setInterval(() => {
            checkNotCancelled().catch((error) => {
                if (!controller.signal.aborted) {
                    log(`[compose] cancellation requested during ${args.join(" ")}: ${error instanceof Error ? error.message : String(error)}`);
                    controller.abort(error);
                }
            });
        }, 1000);
        try {
            const timeoutMs = args[0] === "run"
                ? 10 * 60 * 1000
                : args.includes("mysql") || args.includes("mongo") || args.includes("redis")
                    ? 5 * 60 * 1000
                    : 5 * 60 * 1000;
            await deps.docker.run(composeCtx.composeFile, composeCtx.project, composeCtx.envPath, composeCtx.composeEnv, args, { cancelSignal: controller.signal, timeoutMs });
            log(`[compose] completed: docker compose ${args.join(" ")}`);
            await checkNotCancelled();
        }
        catch (error) {
            log(`[compose] failed: docker compose ${args.join(" ")} :: ${error instanceof Error ? error.message : String(error)}`);
            if (controller.signal.aborted) {
                const reason = controller.signal.reason;
                if (reason instanceof Error) {
                    throw reason;
                }
                throw new Error(typeof reason === "string" ? reason : "cancelled_by_user");
            }
            throw error;
        }
        finally {
            clearInterval(intervalId);
        }
    };
    const hasOp = (key) => completedOps.has(key);
    const markOp = async (operationKey, message, meta) => {
        completedOps.add(operationKey);
        await trace.event("journal", message, {
            meta: {
                operationKey,
                ...meta,
            },
        });
    };
    const recordCleanupError = async (step, error) => {
        const msg = error instanceof Error ? error.message : String(error);
        try {
            await trace.event("cleanup", `non-fatal error in ${step}: ${msg}`, {
                level: "error",
                meta: { step, error: msg },
            });
        }
        catch {
            // last-resort logging only
            console.error(`[provision][${correlationId}] cleanup log failure step=${step}: ${msg}`);
        }
    };
    try {
        log(`[provision] start slug=${input.slug} correlationId=${correlationId}`);
        await checkNotCancelled();
        await (0, promises_1.mkdir)((0, node_path_1.join)(stockixFinanceRoot, "data/logs/nginx"), { recursive: true });
        await (0, promises_1.mkdir)((0, node_path_1.join)(stockixFinanceRoot, "docker/certbot/certs"), { recursive: true });
        const { secrets } = deps;
        oneTimeAdminPassword = secrets.bootstrapAdminPassword();
        const jwtSecret = secrets.persistSecret(secrets.randomHex(32));
        const dbPassword = secrets.persistSecret(secrets.randomHex(16));
        const dbRootPassword = secrets.persistSecret(secrets.randomHex(16));
        const mongoUrlPersisted = "mongodb://mongo/stockix";
        const agendashUser = "agendash";
        const agendashPassword = secrets.persistSecret(secrets.randomHex(12));
        const existingSlug = await db
            .select({ id: schema_1.tenants.id })
            .from(schema_1.tenants)
            .where((0, drizzle_orm_1.eq)(schema_1.tenants.slug, input.slug))
            .limit(1);
        if (existingSlug.length > 0) {
            throw new Error(`tenant_slug_exists:${input.slug}`);
        }
        await db.transaction(async (tx) => {
            const allocated = await (0, db_1.allocateTenantPort)(tx, maxPort);
            port = allocated;
            const [tRow] = await tx.insert(schema_1.tenants).values({
                slug: input.slug,
                name: input.name,
                ownerId: input.ownerId,
                adminEmail: input.adminEmail,
                adminFirstName: input.adminFirstName,
                adminLastName: input.adminLastName,
                status: "provisioning",
            }).returning({ id: schema_1.tenants.id });
            tenantId = tRow.id;
            const [dRow] = await tx.insert(schema_1.tenantDeployments).values({
                tenantId,
                status: "provisioning",
                composeProjectName: project,
                internalPort: allocated,
                mysqlPassword: encryptDeploymentSecret(dbPassword),
                mysqlRootPassword: encryptDeploymentSecret(dbRootPassword),
                jwtSecret: encryptDeploymentSecret(jwtSecret),
                mongoUrl: mongoUrlPersisted,
            }).returning({ id: schema_1.tenantDeployments.id });
            deploymentId = dRow.id;
        });
        await checkNotCancelled();
        const envBody = (0, tenant_env_js_1.buildTenantComposeEnvBody)({
            stockixFinanceRoot,
            baseUrl,
            jwtSecret,
            dbPassword,
            dbRootPassword,
            publicProxyPort: port,
            signupAllowedEmails: input.adminEmail,
            agendashUser,
            agendashPassword,
        });
        const envPath = await (0, tenant_env_js_1.writeTenantEnvFileAtomic)((0, node_path_1.join)(tenantEnvRoot, input.slug), envBody);
        const composeEnv = {
            STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot,
            BASE_URL: baseUrl,
            DB_CLIENT: "mysql",
            DB_HOST: "mysql",
            DB_USER: "stockix_tenant",
            DB_PASSWORD: dbPassword,
            DB_ROOT_PASSWORD: dbRootPassword,
            DB_CHARSET: "utf8",
            SYSTEM_DB_CLIENT: "mysql",
            SYSTEM_DB_HOST: "mysql",
            SYSTEM_DB_USER: "stockix_tenant",
            SYSTEM_DB_PASSWORD: dbPassword,
            SYSTEM_DB_NAME: "stockix_system",
            TENANT_DB_CLIENT: "mysql",
            TENANT_DB_HOST: "mysql",
            TENANT_DB_USER: "stockix_tenant",
            TENANT_DB_PASSWORD: dbPassword,
            TENANT_DB_NAME_PERFIX: "stockix_tenant_",
            JWT_SECRET: jwtSecret,
            PUBLIC_PROXY_PORT: String(port),
            PUBLIC_PROXY_SSL_PORT: "443",
            SIGNUP_DISABLED: "true",
            SIGNUP_ALLOWED_DOMAINS: "",
            SIGNUP_ALLOWED_EMAILS: input.adminEmail,
            MAIL_HOST: "",
            MAIL_USERNAME: "",
            MAIL_PASSWORD: "",
            MAIL_PORT: "",
            MAIL_SECURE: "",
            MAIL_FROM_NAME: "",
            MAIL_FROM_ADDRESS: "",
            AGENDASH_AUTH_USER: agendashUser,
            AGENDASH_AUTH_PASSWORD: agendashPassword,
        };
        composeCtx = { composeFile, project, envPath, composeEnv };
        const { docker, finance, edge } = deps;
        await checkNotCancelled();
        const staleContainersRaw = await (0, execa_1.execa)("docker", ["ps", "-a", "--filter", `name=${project}`, "--format", "{{.Names}}"], { stdio: "pipe" })
            .then(({ stdout }) => stdout)
            .catch(() => "");
        const staleContainers = staleContainersRaw
            .split("\n")
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
        if (staleContainers.length > 0) {
            await trace.event("preflight.cleanup", "Detected stale project containers before provision", {
                level: "warn",
                meta: { composeProjectName: project, staleContainers },
            });
        }
        await docker
            .run(composeCtx.composeFile, composeCtx.project, composeCtx.envPath, composeCtx.composeEnv, ["down", "--remove-orphans", "-v", "--timeout", "10"], { timeoutMs: 2 * 60 * 1000 })
            .catch(() => undefined);
        await trace.event("preflight.cleanup", "completed", {
            meta: { composeProjectName: project },
        });
        sideEffectsStarted = true;
        await checkNotCancelled();
        if (!hasOp("docker.data_step")) {
            log("[provision] step start: docker.data_step");
            await runComposeWithCancellation(["up", "-d", "--no-deps", "--remove-orphans", "mysql", "mongo", "redis"]);
            await markOp("docker.data_step", "Data services compose step completed", {
                composeProjectName: project,
            });
            log("[provision] step done: docker.data_step");
        }
        else {
            await trace.event("resume", "Skipping data step (already journaled)", {
                meta: { operationKey: "docker.data_step", composeProjectName: project },
            });
        }
        await checkNotCancelled();
        if (!hasOp("docker.migration_step")) {
            log("[provision] step start: docker.migration_step");
            log("database_migration");
            await runComposeWithCancellation(["run", "--rm", "database_migration"]);
            await markOp("docker.migration_step", "Migration compose step completed", {
                composeProjectName: project,
            });
            log("[provision] step done: docker.migration_step");
        }
        else {
            await trace.event("resume", "Skipping migration step (already journaled)", {
                meta: { operationKey: "docker.migration_step", composeProjectName: project },
            });
        }
        await checkNotCancelled();
        if (!hasOp("docker.app_step")) {
            log("[provision] step start: docker.app_step");
            await runComposeWithCancellation(["up", "-d", "--remove-orphans", "webapp", "nginx", "server"]);
            await markOp("docker.app_step", "Application compose step completed", {
                composeProjectName: project,
            });
            log("[provision] step done: docker.app_step");
        }
        else {
            await trace.event("resume", "Skipping app step (already journaled)", {
                meta: { operationKey: "docker.app_step", composeProjectName: project },
            });
        }
        await checkNotCancelled();
        const internalUrl = await resolveServerInternalUrl({
            composeFile,
            project,
            envPath: composeCtx.envPath,
            composeEnv: composeCtx.composeEnv,
            fallbackHost: config_1.apiConfig.tenantInternalHost,
            fallbackPort: port,
        });
        if (!hasOp("tenant.health_check")) {
            log("[provision] step start: tenant.health_check");
            await finance.waitUntilReady(internalUrl, constants_js_1.STOCKIX_FINANCE_HEALTH_TIMEOUT_MS, log, requestId, trace);
            await markOp("tenant.health_check", "Tenant health check completed", { internalUrl });
            log("[provision] step done: tenant.health_check");
        }
        else {
            await trace.event("resume", "Skipping health check (already journaled)", {
                meta: { operationKey: "tenant.health_check", internalUrl },
            });
        }
        await checkNotCancelled();
        if (!hasOp("tenant.bootstrap_admin")) {
            log("[provision] step start: tenant.bootstrap_admin");
            await finance.registerBootstrapAdmin({
                internalBaseUrl: internalUrl,
                firstName: input.adminFirstName,
                lastName: input.adminLastName,
                email: input.adminEmail,
                password: oneTimeAdminPassword,
                log,
                requestId,
                trace,
            });
            await markOp("tenant.bootstrap_admin", "Tenant bootstrap admin registered", {
                internalBaseUrl: internalUrl,
                adminEmail: input.adminEmail,
            });
            log("[provision] step done: tenant.bootstrap_admin");
        }
        else {
            await trace.event("resume", "Skipping bootstrap admin registration (already journaled)", {
                meta: { operationKey: "tenant.bootstrap_admin", adminEmail: input.adminEmail },
            });
        }
        await checkNotCancelled();
        if (!hasOp("edge.publish")) {
            log("[provision] step start: edge.publish");
            try {
                await edge.publish(input.slug, port, rootDomain);
            }
            catch (error) {
                await trace.event("edge", "Traefik edge publish failed", {
                    level: "error",
                    meta: {
                        slug: input.slug,
                        internalPort: port,
                        error: error instanceof Error ? error.message : String(error),
                    },
                });
                throw error;
            }
            await markOp("edge.publish", "Traefik edge publish completed", {
                slug: input.slug,
                internalPort: port,
            });
            log("[provision] step done: edge.publish");
        }
        else {
            await trace.event("resume", "Skipping edge publish (already journaled)", {
                meta: { operationKey: "edge.publish", slug: input.slug, internalPort: port },
            });
        }
        log(`[provision] success slug=${input.slug} tenantId=${tenantId}`);
        return {
            ok: true,
            tenantId: tenantId,
            deploymentId: deploymentId,
            composeProjectName: project,
            internalPort: port,
            baseUrl,
            oneTimeAdminPassword: oneTimeAdminPassword,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (tenantId) {
            await db
                .update(schema_1.tenants)
                .set({ status: "failed" })
                .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, tenantId))
                .catch((error) => recordCleanupError("tenant_status_failed_update", error));
        }
        if (deploymentId) {
            await db
                .update(schema_1.tenantDeployments)
                .set({ status: "failed", lastError: message, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.tenantDeployments.id, deploymentId))
                .catch((error) => recordCleanupError("deployment_status_failed_update", error));
        }
        if (sideEffectsStarted && composeCtx) {
            await trace
                .event("cleanup", "Attempting best-effort compose rollback", {
                level: "warn",
                meta: { composeProjectName: composeCtx.project },
            })
                .catch((error) => recordCleanupError("cleanup_event_before_rollback", error));
            const rolledBack = await (0, tenant_docker_workflow_js_1.composeDownBestEffort)(deps.docker, composeCtx);
            if (rolledBack && tenantId) {
                await db
                    .delete(schema_1.tenants)
                    .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, tenantId))
                    .catch((error) => recordCleanupError("tenant_delete_after_rollback", error));
                await trace
                    .event("cleanup", "Compose rollback completed and tenant records removed", {
                    level: "info",
                    meta: { composeProjectName: composeCtx.project, tenantId },
                })
                    .catch((error) => recordCleanupError("cleanup_event_after_rollback", error));
            }
            else if (!rolledBack) {
                await trace
                    .event("cleanup", "Compose rollback failed; tenant marked failed for operator recovery", {
                    level: "error",
                    meta: { composeProjectName: composeCtx.project, tenantId, deploymentId },
                })
                    .catch((error) => recordCleanupError("cleanup_event_rollback_failed", error));
            }
        }
        await trace
            .event("failed", message, { level: "error", meta: { cause: String(err) } })
            .catch((error) => recordCleanupError("final_failed_event", error));
        log(`[provision] failed slug=${input.slug} correlationId=${correlationId}: ${message}`);
        return { ok: false, message, cause: String(err) };
    }
}
