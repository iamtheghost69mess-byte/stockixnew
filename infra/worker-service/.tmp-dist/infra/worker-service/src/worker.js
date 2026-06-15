"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const execa_1 = require("execa");
const config_1 = require("@repo/config");
const db_1 = require("@repo/db");
const schema_1 = require("@repo/db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const zod_1 = require("zod");
const provisioner_js_1 = require("../domain/provisioner.js");
const workerId = `infra-worker-${(0, node_crypto_1.randomUUID)()}`;
const pollMs = 1500;
const apiBaseUrl = `http://localhost:${config_1.apiConfig.port}`;
const requestTimeoutMs = 10_000;
const jobExecutionTimeoutMs = 10 * 60 * 1000;
let shuttingDown = false;
function timeoutSignal(ms) {
    return AbortSignal.timeout(ms);
}
async function withExecutionTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`execution_timeout:${timeoutMs}ms`)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeout]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
async function emitWorkerMetric(name, value, tags) {
    const endpoint = config_1.apiConfig.metricsEndpoint;
    if (!endpoint)
        return;
    await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(config_1.apiConfig.metricsAuthToken ? { Authorization: `Bearer ${config_1.apiConfig.metricsAuthToken}` } : {}),
        },
        body: JSON.stringify({
            source: "worker",
            workerId,
            name,
            value,
            tags,
            ts: new Date().toISOString(),
        }),
        signal: timeoutSignal(requestTimeoutMs),
    }).catch((error) => {
        console.error(`[worker] metric emit failed: ${error instanceof Error ? error.message : String(error)}`);
    });
}
async function claimNextJob() {
    // Use WORKER_SECRET to authenticate with the internal job endpoints (CRIT-01).
    const secret = config_1.apiConfig.workerSecret;
    const requestId = (0, node_crypto_1.randomUUID)();
    const res = await fetch(`${apiBaseUrl}/internal/jobs/claim`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-request-id": requestId,
            "x-correlation-id": requestId,
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ workerId }),
        signal: timeoutSignal(requestTimeoutMs),
    });
    if (!res.ok)
        throw new Error(`claim_failed:${res.status}`);
    const body = (await res.json());
    return body.job ?? null;
}
async function markJobComplete(jobId, oneTimeAdminPassword) {
    // Use WORKER_SECRET to authenticate with the internal job endpoints (CRIT-01).
    const secret = config_1.apiConfig.workerSecret;
    const requestId = (0, node_crypto_1.randomUUID)();
    const completionBody = { workerId };
    // Pass the one-time admin password so the API holds it in memory only — never persisted to DB (CRIT-02).
    if (oneTimeAdminPassword !== undefined) {
        completionBody.oneTimeAdminPassword = oneTimeAdminPassword;
    }
    const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/complete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-request-id": requestId,
            "x-correlation-id": requestId,
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify(completionBody),
        signal: timeoutSignal(requestTimeoutMs),
    });
    if (!res.ok)
        throw new Error(`complete_failed:${res.status}`);
}
async function markJobFailure(jobId, message, noRetry = false) {
    // Use WORKER_SECRET to authenticate with the internal job endpoints (CRIT-01).
    const secret = config_1.apiConfig.workerSecret;
    const requestId = (0, node_crypto_1.randomUUID)();
    const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/fail`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-request-id": requestId,
            "x-correlation-id": requestId,
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ error: message, workerId, noRetry }),
        signal: timeoutSignal(requestTimeoutMs),
    });
    if (!res.ok)
        throw new Error(`fail_failed:${res.status}`);
}
async function assertProvisionNotCancelled(jobId) {
    const secret = config_1.apiConfig.workerSecret;
    const requestId = (0, node_crypto_1.randomUUID)();
    const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/cancel-check`, {
        method: "GET",
        headers: {
            "x-request-id": requestId,
            "x-correlation-id": requestId,
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        signal: timeoutSignal(requestTimeoutMs),
    });
    if (!res.ok) {
        throw new Error(`cancel_check_failed:${res.status}`);
    }
    const body = (await res.json());
    if (body.cancelled) {
        throw new Error(`cancelled_by_user: ${body.reason ?? "cancelled"}`);
    }
}
const ALLOWED_LIFECYCLE_COMMANDS = ["start", "stop"];
const provisionPayloadSchema = zod_1.z.object({
    slug: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    ownerId: zod_1.z.string().uuid(),
    adminEmail: zod_1.z.string().email(),
    adminFirstName: zod_1.z.string().min(1),
    adminLastName: zod_1.z.string().min(1),
});
async function runProvisionJob(db, job) {
    const guard = async () => {
        await assertProvisionNotCancelled(job.id);
    };
    await guard();
    const payload = provisionPayloadSchema.parse(job.payload);
    const result = await (0, provisioner_js_1.provisionTenant)(db, {
        slug: payload.slug,
        name: payload.name,
        ownerId: payload.ownerId,
        adminEmail: payload.adminEmail,
        adminFirstName: payload.adminFirstName,
        adminLastName: payload.adminLastName,
    }, (m) => console.log(`[worker][${job.id}] ${m}`), job.correlationId ?? (0, node_crypto_1.randomUUID)(), guard);
    if (!result.ok) {
        throw new Error(result.message);
    }
    await db.insert(schema_1.adminAuditLog).values({
        actorId: String(payload.ownerId ?? ""),
        action: "tenant.create",
        targetTenantId: result.tenantId,
        ipAddress: workerId,
        userAgent: "infra-worker",
        metadata: { mode: "job_worker", jobId: job.id },
    }).catch(async (error) => {
        if (job.correlationId) {
            await db.insert(schema_1.tenantProvisionEvents).values({
                correlationId: job.correlationId,
                phase: "audit",
                level: "error",
                message: "Failed to write admin audit log after successful provision",
                tenantId: result.tenantId,
                meta: {
                    step: "admin_audit_log",
                    error: error instanceof Error ? error.message : String(error),
                    jobId: job.id,
                },
            }).catch((nestedError) => {
                console.error(`[worker][${job.id}] failed to persist audit failure event: ${nestedError instanceof Error ? nestedError.message : String(nestedError)}`);
            });
        }
    });
    // Return the one-time password so the loop can pass it to markJobComplete
    // without persisting it to any database (CRIT-02).
    return result.oneTimeAdminPassword;
}
async function runDeprovisionJob(db, job) {
    if (!job.tenantId)
        throw new Error("tenantId is required");
    const removeVolumes = job.payload.removeVolumes === true;
    const removeImages = job.payload.removeImages === true;
    const result = await (0, provisioner_js_1.deprovisionTenant)(db, job.tenantId, {
        removeVolumes,
        removeImages,
        log: (m) => console.log(`[worker][${job.id}] ${m}`),
    });
    if (!result.ok)
        throw new Error(result.message);
}
async function runTenantLifecycleCommand(db, job, command) {
    if (!job.tenantId)
        throw new Error("tenantId is required");
    const rows = await db
        .select({
        tenantId: schema_1.tenants.id,
        slug: schema_1.tenants.slug,
        composeProjectName: schema_1.tenantDeployments.composeProjectName,
    })
        .from(schema_1.tenants)
        .leftJoin(schema_1.tenantDeployments, (0, drizzle_orm_1.eq)(schema_1.tenantDeployments.tenantId, schema_1.tenants.id))
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, job.tenantId))
        .limit(1);
    const row = rows[0];
    if (!row || !row.composeProjectName) {
        throw new Error("tenant_not_found");
    }
    await (0, execa_1.execa)("docker", ["compose", "-p", row.composeProjectName, command], {
        timeout: 60_000,
    });
}
const handlers = {
    "tenant.provision": runProvisionJob,
    "tenant.deprovision": runDeprovisionJob,
    "tenant.lifecycle": (db, job) => {
        const rawCommand = String(job.payload.command ?? "");
        if (!ALLOWED_LIFECYCLE_COMMANDS.includes(rawCommand)) {
            throw new Error(`Invalid lifecycle command: "${rawCommand}". Allowed: ${ALLOWED_LIFECYCLE_COMMANDS.join(", ")}`);
        }
        const command = rawCommand;
        return runTenantLifecycleCommand(db, job, command);
    },
};
function isPermanentProvisionError(message) {
    const lowered = message.toLowerCase();
    return (message.startsWith("tenant_slug_exists:") ||
        lowered.includes("tenants_slug_unique") ||
        lowered.includes("duplicate key value violates unique constraint"));
}
async function loop() {
    const databaseUrl = config_1.apiConfig.databaseUrl;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required for infra worker");
    }
    const db = (0, db_1.createDb)(databaseUrl);
    console.log(JSON.stringify({ level: "info", type: "worker_start", workerId }));
    while (!shuttingDown) {
        const job = await claimNextJob().catch((error) => {
            console.error(`[worker] claim error: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        });
        if (!job) {
            await new Promise((r) => setTimeout(r, pollMs));
            continue;
        }
        try {
            const handler = handlers[job.type];
            if (!handler) {
                throw new Error(`unsupported_job_type:${job.type}`);
            }
            // For tenant.provision jobs, capture the one-time admin password so it can be
            // forwarded to the API in-memory store without being written to the DB (CRIT-02).
            let oneTimeAdminPassword;
            if (job.type === "tenant.provision") {
                oneTimeAdminPassword = await withExecutionTimeout(runProvisionJob(db, job), jobExecutionTimeoutMs);
            }
            else {
                await withExecutionTimeout(handler(db, job), jobExecutionTimeoutMs);
            }
            await markJobComplete(job.id, oneTimeAdminPassword);
            await emitWorkerMetric("worker.job.success", 1, { jobType: job.type });
            console.log(JSON.stringify({
                level: "info",
                type: "worker_job_result",
                workerId,
                jobId: job.id,
                jobType: job.type,
                outcome: "success",
            }));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[worker][${job.id}] failed: ${message}`);
            try {
                const cancelledByUser = message.startsWith("cancelled_by_user:");
                // Provisioning should fail fast and never retry automatically.
                const noRetry = cancelledByUser || job.type === "tenant.provision" || isPermanentProvisionError(message);
                await markJobFailure(job.id, message, noRetry);
                await emitWorkerMetric("worker.job.failure", 1, { jobType: job.type });
                console.log(JSON.stringify({
                    level: "error",
                    type: "worker_job_result",
                    workerId,
                    jobId: job.id,
                    jobType: job.type,
                    outcome: "failed",
                    error: message,
                }));
            }
            catch (reportError) {
                console.error(`[worker][${job.id}] failed to report failure: ${reportError instanceof Error ? reportError.message : String(reportError)}`);
            }
        }
    }
}
process.on("SIGTERM", () => {
    shuttingDown = true;
    console.log(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGTERM", workerId }));
});
process.on("SIGINT", () => {
    shuttingDown = true;
    console.log(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGINT", workerId }));
});
void loop();
