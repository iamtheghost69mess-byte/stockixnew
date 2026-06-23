import * as Sentry from "@sentry/node";
import http from "node:http";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { logger } from "./lib/logger.js";

let workerControlPlaneRedis: Redis | null = null;

function getWorkerRedisClient(): Redis | null {
  const url = apiConfig.controlPlaneRedisUrl;
  if (!url) return null;
  if (!workerControlPlaneRedis) {
    workerControlPlaneRedis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 2000,
    });
    workerControlPlaneRedis.on("error", (err: Error) => {
      logger.warn("Worker control plane Redis connection error", { err: err.message });
    });
  }
  return workerControlPlaneRedis;
}

if (process.env.SENTRY_DSN?.trim()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.RELEASE_VERSION,
    tracesSampleRate: 0.1,
    integrations: [Sentry.httpIntegration()],
  });
} else if (process.env.NODE_ENV === "production") {
  logger.warn(
    "SENTRY_DSN not configured — errors will not be tracked in Sentry. " +
      "Set SENTRY_DSN in infra/prod/.env to enable production error monitoring.",
    { event: "sentry_dsn_missing_startup" },
  );
}
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { apiConfig } from "@repo/config";
import {
  createDb,
} from "@repo/db";
import {
  adminAuditLog,
  tenantLifecycleJobs,
  tenantProvisionEvents,
  tenantDeployments,
  tenants,
  licenses,
  deadLetterJobs,
  owners,
  organizations,
} from "@repo/db/schema";
import { and, eq, sql, isNotNull, lte, gte } from "drizzle-orm";
import {
  initEmailLogging,
  processLicenseExpiryFollowUp,
  syncFinanceLicenseForStockixTenant,
  sendMail,
  sendModuleAddedEmail,
  sendModuleRemovedEmail,
} from "@repo/platform-worker-shared";
import { z } from "zod";
import { checkRequiredTenantImages } from "../domain/provisioning/check-tenant-images.js";
import {
  resolveProvisionJobOutcome,
  type ProvisionJobOutcome,
} from "../domain/provisioning/provision-outcome-rules.js";
import {
  assertNoConcurrentTenantLifecycleJob,
  shutdownAdvisoryLockClient,
  withTenantLifecycleAdvisoryLock,
} from "../domain/provisioning/provision-lock.js";
import {
  deprovisionTenant,
  provisionTenant,
} from "../domain/provisioner.js";
import { scrubTenantRuntimeArtifacts } from "../domain/scrub-tenant-artifacts.js";
import { executeOrgProvisionRuntime } from "./org-provision-runtime.js";
import { executeAddModuleRuntime } from "./provision-runtime.js";
import { stopFinanceStack, stopModuleStack } from "./module-stacks.js";
import { composeProjectName as resolveComposeProjectName } from "../domain/provisioning/compose-project-name.js";
import { deprovisionChatwootAccount } from "./chatwoot-provision.js";

const workerId = `infra-worker-${randomUUID()}`;
const pollMs = Math.max(
  250,
  parseInt(process.env.PROVISION_POLL_MS ?? String(apiConfig.provisionPollMs), 10) || apiConfig.provisionPollMs,
);
const POLL_INTERVAL_MS = pollMs;
const workerConcurrency = Math.max(
  1,
  parseInt(process.env.WORKER_CONCURRENCY ?? String(apiConfig.workerConcurrency), 10) || 1,
);
let lastSuccessfulPollAt = Date.now();

const healthServer = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    const lastPollAge = Date.now() - lastSuccessfulPollAt;
    const healthy = lastPollAge < heartbeatIntervalMs * 2;
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: healthy ? "ok" : "degraded", lastPollAge }));
    return;
  }
  if (req.url === "/metrics" && req.method === "GET") {
    const { renderWorkerPrometheusMetrics } = await import("./worker-prometheus.js");
    const body = await renderWorkerPrometheusMetrics();
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end();
});
const workerHealthPort = parseInt(process.env.WORKER_HEALTH_PORT ?? "9090", 10);
healthServer.on("error", (err) => {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "EADDRINUSE") {
    logger.error(
      `Worker health port ${workerHealthPort} already in use — run pnpm dev:kill or set WORKER_HEALTH_PORT`,
      err,
    );
  }
  throw err;
});
healthServer.listen(workerHealthPort, "0.0.0.0");
/** Periodically flip time-expired licenses to status `expired`. */
const LICENSE_EXPIRE_SCAN_INTERVAL_MS = 5 * 60 * 1000;
let lastLicenseExpireScanMs = 0;

/** Reconcile Finance license state for all active tenants — catches divergence from missed events. */
const LICENSE_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let lastLicenseReconcileScanMs = 0;

async function expireDueLicenses(db: ReturnType<typeof createDb>): Promise<void> {
  const now = new Date();
  const justExpired = await db
    .update(licenses)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(licenses.status, "active"),
        eq(licenses.isPerpetual, false),
        isNotNull(licenses.expiresAt),
        lte(licenses.expiresAt, now),
      ),
    )
    .returning({
      id: licenses.id,
      tenantId: licenses.tenantId,
      expiresAt: licenses.expiresAt,
      gracePeriodDays: licenses.gracePeriodDays,
    });

  await processLicenseExpiryFollowUp(db, {
    justExpired,
    now,
    log: (message) => logger.info(message),
  });
}
async function reconcileAllFinanceLicenses(db: ReturnType<typeof createDb>): Promise<void> {
  const activeTenants = await db
    .select({
      tenantId: tenantDeployments.tenantId,
      financeTenantId: tenantDeployments.financeTenantId,
    })
    .from(tenantDeployments)
    .where(and(eq(tenantDeployments.status, "active"), isNotNull(tenantDeployments.financeTenantId)));

  let synced = 0;
  let failed = 0;
  for (const row of activeTenants) {
    if (!row.tenantId || !row.financeTenantId || row.financeTenantId <= 0) continue;
    try {
      await syncFinanceLicenseForStockixTenant(
        db,
        { stockixTenantId: row.tenantId, financeTenantId: row.financeTenantId },
        (msg) => logger.debug(`[license-reconcile] ${msg}`),
      );
      synced++;
    } catch (err) {
      failed++;
      logger.warn(`[license-reconcile] failed for tenant ${row.tenantId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  logger.info(`[license-reconcile] completed: synced=${synced} failed=${failed} total=${activeTenants.length}`);
}

/** API_HOST must be [::1] when WSL2 relay only exposes IPv6 (wslrelay.exe → [::1]:port). */
const apiHost = process.env.API_HOST?.trim() || "127.0.0.1";
const apiBaseUrl = `http://${apiHost}:${apiConfig.port}`;
const requestTimeoutMs = 10_000;
const jobExecutionTimeoutMs = apiConfig.workerJobExecutionTimeoutMs;
const heartbeatIntervalMs = 30_000;
const apiReadyMaxWaitMs = 180_000;
const apiUnreachableLogIntervalMs = 30_000;
const startupGraceMs = parseInt(process.env.WORKER_STARTUP_GRACE_MS ?? "5000", 10);
let shuttingDown = false;
let lastApiUnreachableLogMs = 0;
let apiUnreachableCount = 0;
function runtimeBundleMtime(): string | null {
  try {
    const bundlePath = join(dirname(fileURLToPath(import.meta.url)), "worker.js");
    return statSync(bundlePath).mtime.toISOString();
  } catch {
    return null;
  }
}

const runtimeFingerprint = {
  workerId,
  startedAt: new Date().toISOString(),
  entrypoint: import.meta.url,
  runtimeBundleMtime: runtimeBundleMtime(),
  nodeVersion: process.version,
};

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function isApiConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "fetch failed") return true;
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
  }
  return false;
}

async function waitForApiReady(): Promise<void> {
  const readyUrl = `${apiBaseUrl}/ready`;
  const started = Date.now();
  let consecutiveOk = 0;
  logger.info(
    JSON.stringify({
      level: "info",
      type: "worker_waiting_for_api",
      readyUrl,
      maxWaitMs: apiReadyMaxWaitMs,
    }),
  );
  while (!shuttingDown && Date.now() - started < apiReadyMaxWaitMs) {
    try {
      const res = await fetch(readyUrl, { signal: timeoutSignal(5_000) });
      if (res.ok) {
        consecutiveOk++;
        if (consecutiveOk >= 2) {
          logger.info(JSON.stringify({ level: "info", type: "worker_api_ready", readyUrl }));
          return;
        }
      } else {
        consecutiveOk = 0;
      }
    } catch {
      consecutiveOk = 0;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`api_not_ready:${readyUrl}`);
}

function logApiUnreachable(): void {
  apiUnreachableCount++;

  if (apiUnreachableCount === 1) {
    logger.debug("[worker] API not ready yet — retrying...");
    return;
  }

  if (apiUnreachableCount < 3) return;

  const now = Date.now();
  if (now - lastApiUnreachableLogMs < apiUnreachableLogIntervalMs) return;
  lastApiUnreachableLogMs = now;
  logger.warn(
    `[worker] API unreachable at ${apiBaseUrl} (is \`api\` dev running?). Will retry job claims.`,
    { attempts: apiUnreachableCount, url: apiBaseUrl },
  );
}

async function withExecutionTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`execution_timeout:${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function emitWorkerMetric(name: string, value: number, tags: Record<string, string | number>) {
  const jobType = String(tags.jobType ?? "unknown");
  if (name === "worker.job.success") {
    const { workerJobSuccessTotal } = await import("./worker-prometheus.js");
    workerJobSuccessTotal.inc({ jobType }, value);
  } else if (name === "worker.job.failure") {
    const { workerJobFailureTotal } = await import("./worker-prometheus.js");
    workerJobFailureTotal.inc({ jobType }, value);
  }

  const endpoint = apiConfig.metricsEndpoint;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiConfig.metricsAuthToken ? { Authorization: `Bearer ${apiConfig.metricsAuthToken}` } : {}),
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
    logger.error(
      `[worker] metric emit failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

type ClaimedJob = {
  id: string;
  type: string;
  tenantId: string | null;
  correlationId: string | null;
  claimToken: string | null;
  payload: Record<string, unknown>;
};

let activeClaimToken: string | null = null;

async function claimNextJob(): Promise<ClaimedJob | null> {
  // Use WORKER_SECRET to authenticate with the internal job endpoints (CRIT-01).
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
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
  if (!res.ok) throw new Error(`claim_failed:${res.status}`);
  const body = (await res.json()) as { job?: ClaimedJob | null };
  const job = body.job ?? null;
  activeClaimToken = job?.claimToken ?? null;
  return job;
}

async function markJobComplete(
  jobId: string,
  opts?: {
    oneTimeAdminPassword?: string;
    financeOrganizationId?: string;
    financeTenantId?: number;
    financeDefaultWarehouseId?: number;
    posStatus?: string;
    posError?: string;
    tenantStatus?: string;
    walkInCustomerId?: number;
    cashAccountId?: number;
    cardAccountId?: number;
    posOrganizationId?: string;
    posUrl?: string;
    posApiUrl?: string;
    posDefaultCredentials?: {
      adminPin: string;
      allRoles: { role: string; username: string; pin: string }[];
    };
    completionOutcome?: ProvisionJobOutcome;
  },
): Promise<void> {
  // Use WORKER_SECRET to authenticate with the internal job endpoints (CRIT-01).
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const completionBody: Record<string, unknown> = {
    workerId,
    ...(activeClaimToken ? { claimToken: activeClaimToken } : {}),
  };
  // Pass the one-time admin password so the API holds it in memory only — never persisted to DB (CRIT-02).
  if (opts?.oneTimeAdminPassword !== undefined) {
    completionBody.oneTimeAdminPassword = opts.oneTimeAdminPassword;
  }
  const resultPayload: Record<string, unknown> = {};
  if (opts?.financeOrganizationId) {
    resultPayload.financeOrganizationId = opts.financeOrganizationId;
  }
  if (opts?.financeTenantId !== undefined) {
    resultPayload.financeTenantId = opts.financeTenantId;
  }
  if (opts?.financeDefaultWarehouseId !== undefined) {
    resultPayload.financeDefaultWarehouseId = opts.financeDefaultWarehouseId;
  }
  if (opts?.posStatus) {
    resultPayload.posStatus = opts.posStatus;
  }
  if (opts?.posError) {
    resultPayload.posError = opts.posError;
  }
  if (opts?.tenantStatus) {
    resultPayload.tenantStatus = opts.tenantStatus;
  }
  if (opts?.walkInCustomerId !== undefined) {
    resultPayload.walkInCustomerId = opts.walkInCustomerId;
  }
  if (opts?.cashAccountId !== undefined) {
    resultPayload.cashAccountId = opts.cashAccountId;
  }
  if (opts?.cardAccountId !== undefined) {
    resultPayload.cardAccountId = opts.cardAccountId;
  }
  if (opts?.posOrganizationId) {
    resultPayload.posOrganizationId = opts.posOrganizationId;
  }
  if (opts?.posUrl) {
    resultPayload.posUrl = opts.posUrl;
  }
  if (opts?.posApiUrl) {
    resultPayload.posApiUrl = opts.posApiUrl;
  }
  if (Object.keys(resultPayload).length > 0) {
    completionBody.result = resultPayload;
  }
  if (opts?.posDefaultCredentials) {
    completionBody.posDefaultCredentials = opts.posDefaultCredentials;
  }
  if (opts?.completionOutcome) {
    completionBody.completionOutcome = opts.completionOutcome;
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
  if (!res.ok) throw new Error(`complete_failed:${res.status}`);
}

async function markJobHeartbeat(jobId: string): Promise<void> {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      workerId,
      ...(activeClaimToken ? { claimToken: activeClaimToken } : {}),
    }),
    signal: timeoutSignal(requestTimeoutMs),
  });
  if (!res.ok) throw new Error(`heartbeat_failed:${res.status}`);
}

async function markJobFailure(jobId: string, message: string, noRetry = false, cancelled = false): Promise<void> {
  // Use WORKER_SECRET to authenticate with the internal job endpoints (CRIT-01).
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/fail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      error: message,
      workerId,
      noRetry,
      cancelled,
      ...(activeClaimToken ? { claimToken: activeClaimToken } : {}),
    }),
    signal: timeoutSignal(requestTimeoutMs),
  });
  if (!res.ok) throw new Error(`fail_failed:${res.status}`);
}

function startJobHeartbeatLoop(jobId: string): () => void {
  const timer = setInterval(() => {
    void markJobHeartbeat(jobId).catch((error) => {
      logger.error(
        `[worker][${jobId}] heartbeat failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    lastSuccessfulPollAt = Date.now();
  }, heartbeatIntervalMs);
  return () => clearInterval(timer);
}

async function assertProvisionNotCancelled(
  jobId: string,
): Promise<void> {
  // 1. Check Redis fast cancel flag first
  const redis = getWorkerRedisClient();
  if (redis) {
    try {
      const isCancelled = await redis.get(`tenant:provision:cancel:${jobId}`);
      if (isCancelled === "1") {
        throw new Error("cancelled_by_user: cancel flag matched in Redis");
      }
    } catch (redisErr) {
      if (redisErr instanceof Error && redisErr.message.startsWith("cancelled_by_user")) {
        throw redisErr;
      }
      logger.warn(`Worker Redis cancel check error: ${redisErr instanceof Error ? redisErr.message : String(redisErr)}`);
    }
  }

  // 2. Fallback to API status endpoint cancel check
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/cancel-check`, {
      method: "GET",
      headers: {
        "x-request-id": requestId,
        "x-correlation-id": requestId,
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      signal: timeoutSignal(requestTimeoutMs),
    });
  } catch {
    // Network error or timeout — API may be restarting. Treat as not-cancelled
    // so a deploy restart doesn't abort in-progress provision jobs.
    return;
  }
  if (!res.ok) {
    // Non-2xx from API (e.g. 503 during restart) — don't abort the job.
    return;
  }
  const body = (await res.json()) as { cancelled?: boolean; reason?: string };
  if (body.cancelled) {
    throw new Error(`cancelled_by_user: ${body.reason ?? "cancelled"}`);
  }
}

const ALLOWED_LIFECYCLE_COMMANDS = ["start", "stop"] as const;
type LifecycleCommand = typeof ALLOWED_LIFECYCLE_COMMANDS[number];

const provisionPayloadSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  ownerId: z.string().uuid(),
  adminEmail: z.string().email(),
  adminFirstName: z.string().min(1),
  adminLastName: z.string().min(1),
  planSlug: z.string().optional(),
  modules: z
    .array(z.enum(["accounting", "pos", "pms", "chat"]))
    .optional(),
  organizationId: z.string().uuid().optional(),
  stockixTenantId: z.string().uuid().optional(),
  stockixApiUrl: z.string().optional(),
  parentTenantSlug: z.string().optional(),
  mainTenantInternalBaseUrl: z.string().optional(),
  retryModules: z
    .array(z.enum(["accounting", "pos", "pms", "chat", "wire"]))
    .optional(),
  needsScrub: z.boolean().optional(),
  debug: z.boolean().optional(),
});

const orgProvisionPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  organizationSlug: z.string().min(1).optional(),
  isPrimary: z.boolean().optional(),
  adminEmail: z.string().email(),
  adminFirstName: z.string().min(1),
  adminLastName: z.string().min(1),
  orgName: z.string().min(1),
  parentTenantSlug: z.string().min(1),
  mainTenantInternalBaseUrl: z.string().min(1),
  stockixTenantId: z.string().uuid(),
  stockixApiUrl: z.string().optional(),
});

const addModulePayloadSchema = z.object({
  tenantId: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  adminEmail: z.string().email(),
  planSlug: z.string().optional(),
  module: z.enum(["pos", "pms", "chat", "accounting"]),
});

const removeModulePayloadSchema = z.object({
  slug: z.string().min(1),
  module: z.enum(["pos", "pms", "chat", "accounting"]),
});

async function runProvisionJob(db: ReturnType<typeof createDb>, job: {
  id: string;
  tenantId?: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
}): Promise<{
  oneTimeAdminPassword?: string;
  financeOrganizationId?: string;
  financeTenantId?: number;
  financeDefaultWarehouseId?: number;
  posStatus?: string;
  posError?: string;
  tenantStatus?: string;
  walkInCustomerId?: number;
  cashAccountId?: number;
  cardAccountId?: number;
  posOrganizationId?: string;
  posUrl?: string;
  posApiUrl?: string;
  posDefaultCredentials?: {
    adminPin: string;
    allRoles: { role: string; username: string; pin: string }[];
  };
  completionOutcome?: ProvisionJobOutcome;
}> {
  const guard = async () => {
    if (shuttingDown) throw new Error("worker_shutting_down");
    await assertProvisionNotCancelled(job.id);
  };
  const payload = provisionPayloadSchema.parse(job.payload);
  if (payload.needsScrub) {
    // await scrubTenantRuntimeArtifacts(payload.slug);
    if (job.correlationId) {
      await db.insert(tenantProvisionEvents).values({
        correlationId: job.correlationId,
        phase: "preflight",
        level: "info",
        message: "Runtime artifacts scrubbed before provision",
        meta: { operationKey: "preflight.scrub", slug: payload.slug, jobId: job.id },
      });
    }
    logger.info(`[worker][${job.id}] preflight.scrub completed for slug=${payload.slug}`);
  }
  await guard();

  const executeProvision = async () => {
    if (job.tenantId) {
      await assertNoConcurrentTenantLifecycleJob(db, job.tenantId, job.id);
    }
    const result = await provisionTenant(
      db,
      {
        slug: payload.slug,
        name: payload.name,
        ownerId: payload.ownerId,
        adminEmail: payload.adminEmail,
        adminFirstName: payload.adminFirstName,
        adminLastName: payload.adminLastName,
        planSlug: payload.planSlug,
        modules: payload.modules,
        stockixTenantId: payload.stockixTenantId,
        stockixApiUrl: payload.stockixApiUrl,
        parentTenantSlug: payload.parentTenantSlug,
        mainTenantInternalBaseUrl: payload.mainTenantInternalBaseUrl,
        controlPlaneOrgId: payload.organizationId ?? undefined,
        retryModules: payload.retryModules,
        debug: payload.debug ?? false,
      },
      (m) => logger.info(`[worker][${job.id}] ${m}`),
      job.correlationId ?? randomUUID(),
      guard,
      job.id,
    );
    if (!result.ok) {
      throw new Error(result.message);
    }
    const completionOutcome = resolveProvisionJobOutcome({
      ok: result.ok,
      tenantStatus: result.tenantStatus,
    });
    await db.insert(adminAuditLog).values({
      actorId: String(payload.ownerId ?? ""),
      action: "tenant.create",
      targetTenantId: result.tenantId,
      ipAddress: workerId,
      userAgent: "infra-worker",
      metadata: { mode: "job_worker", jobId: job.id },
    }).catch(async (error) => {
      if (job.correlationId) {
        await db.insert(tenantProvisionEvents).values({
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
          logger.error(
            `[worker][${job.id}] failed to persist audit failure event: ${
              nestedError instanceof Error ? nestedError.message : String(nestedError)
            }`,
          );
        });
      }
    });
    return {
      oneTimeAdminPassword: result.oneTimeAdminPassword,
      financeOrganizationId: result.financeOrganizationId,
      financeTenantId: result.financeTenantId,
      financeDefaultWarehouseId: result.financeDefaultWarehouseId,
      posStatus: result.posStatus,
      posError: result.posError,
      tenantStatus: result.tenantStatus,
      walkInCustomerId: result.walkInCustomerId,
      cashAccountId: result.cashAccountId,
      cardAccountId: result.cardAccountId,
      posOrganizationId: result.posOrganizationId,
      posUrl: result.posUrl,
      posApiUrl: result.posApiUrl,
      posDefaultCredentials: result.posDefaultCredentials,
      completionOutcome,
    };
  };

  if (job.tenantId) {
    return withTenantLifecycleAdvisoryLock(db, job.tenantId, executeProvision);
  }
  return executeProvision();
}

async function runOrgProvisionJob(
  db: ReturnType<typeof createDb>,
  job: {
    id: string;
    correlationId: string | null;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const guard = async () => {
    if (shuttingDown) throw new Error("worker_shutting_down");
    await assertProvisionNotCancelled(job.id);
  };
  await guard();
  const payload = orgProvisionPayloadSchema.parse(job.payload);
  await executeOrgProvisionRuntime(
    db,
    {
      organizationId: payload.organizationId,
      organizationSlug: payload.organizationSlug ?? payload.parentTenantSlug,
      isPrimary: Boolean(payload.isPrimary),
      adminEmail: payload.adminEmail,
      adminFirstName: payload.adminFirstName,
      adminLastName: payload.adminLastName,
      orgName: payload.orgName,
      mainTenantInternalBaseUrl: payload.mainTenantInternalBaseUrl,
      parentTenantSlug: payload.parentTenantSlug,
      stockixTenantId: payload.stockixTenantId,
      stockixApiUrl: payload.stockixApiUrl,
      correlationId: job.correlationId ?? randomUUID(),
    },
    (m) => logger.info(`[worker][${job.id}] ${m}`),
    guard,
  );
}

async function runAddModuleJob(
  db: ReturnType<typeof createDb>,
  job: {
    id: string;
    correlationId: string | null;
    payload: Record<string, unknown>;
  },
): Promise<{
  tenantStatus?: string;
  posStatus?: string;
  posError?: string;
  posOrganizationId?: string;
  posUrl?: string;
  posApiUrl?: string;
  posDefaultCredentials?: {
    adminPin: string;
    allRoles: { role: string; username: string; pin: string }[];
  };
}> {
  const payload = addModulePayloadSchema.parse(job.payload);
  const executeAddModule = async () => {
    const result = await executeAddModuleRuntime(
      db,
      {
        tenantId: payload.tenantId,
        slug: payload.slug,
        name: payload.name,
        adminEmail: payload.adminEmail,
        module: payload.module,
        planSlug: payload.planSlug,
      },
      (m) => logger.info(`[worker][${job.id}] ${m}`),
      job.correlationId ?? randomUUID(),
    );
    sendModuleAddedEmail({
      to: payload.adminEmail,
      tenantName: payload.name,
      moduleName: payload.module,
      tenantId: payload.tenantId,
    }).catch((e: unknown) => {
      logger.info(`[worker][${job.id}] module-added email failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    });
    return result;
  };

  if (payload.tenantId) {
    return withTenantLifecycleAdvisoryLock(db, payload.tenantId, executeAddModule);
  }
  return executeAddModule();
}

async function runRemoveModuleJob(
  db: ReturnType<typeof createDb>,
  job: { id: string; tenantId: string | null; payload: Record<string, unknown> },
): Promise<void> {
  const payload = removeModulePayloadSchema.parse(job.payload);
  const log = (m: string) => logger.info(`[worker][${job.id}] ${m}`);

  // Send removal notification before stopping the stack
  if (job.tenantId) {
    const [tenantRow] = await db
      .select({ name: tenants.name, ownerId: tenants.ownerId })
      .from(tenants)
      .where(eq(tenants.id, job.tenantId))
      .limit(1);
    if (tenantRow?.ownerId) {
      const [ownerRow] = await db
        .select({ email: owners.email })
        .from(owners)
        .where(eq(owners.id, tenantRow.ownerId))
        .limit(1);
      if (ownerRow?.email) {
        sendModuleRemovedEmail({
          to: ownerRow.email,
          tenantName: tenantRow.name,
          moduleName: payload.module,
          tenantId: job.tenantId,
        }).catch((e: unknown) => {
          log(`module-removed email failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        });
      }
    }
  }

  if (payload.module === "pos" || payload.module === "pms") {
    await stopModuleStack(payload.slug, payload.module, log);
  }
  if (payload.module === "accounting") {
    await stopFinanceStack(payload.slug, log);
  }
  if (payload.module === "chat" && job.tenantId && db) {
    try {
      const orgs = await db
        .select({ id: organizations.id, chatwootAccountId: organizations.chatwootAccountId })
        .from(organizations)
        .where(eq(organizations.tenantId, job.tenantId));

      for (const org of orgs) {
        if (org.chatwootAccountId) {
          await deprovisionChatwootAccount({
            db,
            organizationId: org.id,
            chatwootAccountId: org.chatwootAccountId,
            chatwootBaseUrl: process.env.CHATWOOT_BASE_URL ?? "",
            chatwootApiKey: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
            log,
          });
        }
      }
    } catch (chatwootErr) {
      log(`[chatwoot] cleanup skipped: ${chatwootErr instanceof Error ? chatwootErr.message : String(chatwootErr)}`);
    }
  }
}

async function runDeprovisionJob(db: ReturnType<typeof createDb>, job: {
  id: string;
  tenantId: string | null;
  payload: Record<string, unknown>;
}) {
  if (!job.tenantId) throw new Error("tenantId is required");
  await assertNoConcurrentTenantLifecycleJob(db, job.tenantId, job.id);

  // Clean up Chatwoot accounts only if the tenant has the "chat" module.
  const [tenantRow] = await db
    .select({ modules: tenants.modules })
    .from(tenants)
    .where(eq(tenants.id, job.tenantId))
    .limit(1);
  const licensedModules: string[] = JSON.parse(tenantRow?.modules ?? "[]");

  if (licensedModules.includes("chat")) {
    try {
      const orgs = await db
        .select({ id: organizations.id, chatwootAccountId: organizations.chatwootAccountId })
        .from(organizations)
        .where(eq(organizations.tenantId, job.tenantId));

      for (const org of orgs) {
        if (org.chatwootAccountId) {
          await deprovisionChatwootAccount({
            db,
            organizationId: org.id,
            chatwootAccountId: org.chatwootAccountId,
            chatwootBaseUrl: process.env.CHATWOOT_BASE_URL ?? "",
            chatwootApiKey: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
            log: (m) => logger.info(`[worker][${job.id}] ${m}`),
          });
        }
      }
    } catch (chatwootErr) {
      logger.warn(`[worker][${job.id}] chatwoot cleanup skipped: ${chatwootErr instanceof Error ? chatwootErr.message : String(chatwootErr)}`);
    }
  }

  if (job.payload.needsScrub) {
    const rows = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, job.tenantId)).limit(1);
    if (rows[0]) {
      logger.info(`[worker][${job.id}] deprovision needsScrub flag is set. Scrubbing...`);
      await scrubTenantRuntimeArtifacts(rows[0].slug);
    }
  }

  const removeVolumes = job.payload.removeVolumes === true;
  const removeImages = job.payload.removeImages === true;
  const result = await withTenantLifecycleAdvisoryLock(db, job.tenantId, () =>
    deprovisionTenant(db, job.tenantId!, {
      removeVolumes,
      removeImages,
      lifecycleJobId: job.id,
      log: (m) => logger.info(`[worker][${job.id}] ${m}`),
    }),
  );
  if (!result.ok) throw new Error(result.message);
}

async function runTenantLifecycleCommand(
  db: ReturnType<typeof createDb>,
  job: { tenantId: string | null; id: string; payload: Record<string, unknown> },
  command: string,
) {
  if (!job.tenantId) throw new Error("tenantId is required");
  const rows = await db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      composeProjectName: tenantDeployments.composeProjectName,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, job.tenantId))
    .limit(1);
  const row = rows[0];
  if (!row || !row.composeProjectName) {
    throw new Error("tenant_not_found");
  }
  await execa("docker", ["compose", "-p", row.composeProjectName, command], {
    timeout: 60_000,
  });

  // Mirror the lifecycle outcome into tenantDeployments.status so the dashboard
  // reflects the actual container state immediately after the job completes.
  const statusFromPayload = typeof job.payload.status === "string" ? job.payload.status : null;
  const derivedStatus = statusFromPayload ?? (command === "stop" ? "suspended" : command === "start" ? "active" : null);
  if (derivedStatus) {
    await db
      .update(tenantDeployments)
      .set({ status: derivedStatus, updatedAt: new Date() })
      .where(eq(tenantDeployments.tenantId, job.tenantId));
  }
}

async function runTenantSuspendJob(
  db: ReturnType<typeof createDb>,
  job: { id: string; tenantId: string | null; payload: Record<string, unknown> },
): Promise<void> {
  if (!job.tenantId) throw new Error("tenantId is required");
  const log = (m: string) => logger.info(`[worker][${job.id}] ${m}`);

  const [row] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, job.tenantId))
    .limit(1);
  if (!row) throw new Error("tenant_not_found");

  // Stop the Finance stack using the explicit compose file path (more reliable than -p only).
  await stopFinanceStack(row.slug, log);

  await db
    .update(tenantDeployments)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, job.tenantId));

  log(`[tenant.suspend] Finance stack stopped and deployment status set to suspended for slug=${row.slug}`);
}

async function runTenantReactivateJob(
  db: ReturnType<typeof createDb>,
  job: { id: string; tenantId: string | null; payload: Record<string, unknown> },
): Promise<void> {
  if (!job.tenantId) throw new Error("tenantId is required");
  const log = (m: string) => logger.info(`[worker][${job.id}] ${m}`);

  const [row] = await db
    .select({ slug: tenants.slug, composeProjectName: tenantDeployments.composeProjectName })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, job.tenantId))
    .limit(1);
  if (!row) throw new Error("tenant_not_found");

  const project = row.composeProjectName ?? resolveComposeProjectName(row.slug);
  log(`[tenant.reactivate] Starting Finance stack project=${project} for slug=${row.slug}`);

  // Restart stopped containers in the existing project (preserves volumes and config).
  await execa("docker", ["compose", "-p", project, "start"], { timeout: 120_000 });

  await db
    .update(tenantDeployments)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, job.tenantId));

  log(`[tenant.reactivate] Finance stack started and deployment status set to active for slug=${row.slug}`);
}

async function runLicenseSyncRetryJob(
  db: ReturnType<typeof createDb>,
  job: { id: string; tenantId: string | null; payload: Record<string, unknown> },
): Promise<void> {
  if (!job.tenantId) throw new Error("tenantId is required for license_sync_retry");
  const log = (m: string) => logger.info(`[worker][${job.id}] ${m}`);

  const [dep] = await db
    .select({ financeTenantId: tenantDeployments.financeTenantId })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, job.tenantId))
    .limit(1);

  if (!dep?.financeTenantId || dep.financeTenantId <= 0) {
    log(`[license_sync_retry] No finance_tenant_id for tenant ${job.tenantId} — skipping`);
    return;
  }

  await syncFinanceLicenseForStockixTenant(
    db,
    { stockixTenantId: job.tenantId, financeTenantId: dep.financeTenantId },
    log,
  );
  log(`[license_sync_retry] Sync succeeded for tenant ${job.tenantId}`);
}

async function runEmailRetryJob(
  _db: ReturnType<typeof createDb>,
  job: { id: string; tenantId: string | null; payload: Record<string, unknown> },
): Promise<void> {
  const p = job.payload;
  const to = String(p.to ?? "");
  const subject = String(p.subject ?? "");
  const html = String(p.html ?? "");
  if (!to || !subject || !html) throw new Error("email_retry: missing to/subject/html in payload");

  const result = await sendMail({
    to,
    subject,
    html,
    text: typeof p.text === "string" ? p.text : undefined,
    idempotencyKey: typeof p.idempotencyKey === "string" ? p.idempotencyKey : undefined,
    templateKey: typeof p.templateKey === "string" ? p.templateKey : "email_retry",
    tenantId: typeof p.tenantId === "string" ? p.tenantId : job.tenantId ?? undefined,
  });

  if (result.status === "failed") {
    throw new Error(`email_retry failed: ${result.error}`);
  }
  logger.info(`[worker][${job.id}] email_retry sent to=${to} templateKey=${p.templateKey ?? "unknown"}`);
}

const handlers = {
  "tenant.provision": runProvisionJob,
  "organization.provision": runOrgProvisionJob,
  "tenant.deprovision": runDeprovisionJob,
  "tenant.suspend": runTenantSuspendJob,
  "tenant.reactivate": runTenantReactivateJob,
  add_module: runAddModuleJob,
  remove_module: (db: ReturnType<typeof createDb>, job: ClaimedJob) => runRemoveModuleJob(db, job),
  license_sync_retry: runLicenseSyncRetryJob,
  email_retry: runEmailRetryJob,
  "tenant.lifecycle": (
    db: ReturnType<typeof createDb>,
    job: { tenantId: string | null; id: string; payload: Record<string, unknown> },
  ) => {
    const rawCommand = String(job.payload.command ?? "");
    if (!(ALLOWED_LIFECYCLE_COMMANDS as readonly string[]).includes(rawCommand)) {
      throw new Error(`Invalid lifecycle command: "${rawCommand}". Allowed: ${ALLOWED_LIFECYCLE_COMMANDS.join(", ")}`);
    }
    const command = rawCommand as LifecycleCommand;
    return runTenantLifecycleCommand(db, job, command);
  },
} as const;

type JobHandler = (db: ReturnType<typeof createDb>, job: ClaimedJob) => Promise<void>;

function isPermanentWorkerError(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    message.startsWith("tenant_slug_exists:") ||
    lowered.includes("tenants_slug_unique") ||
    lowered.includes("duplicate key value violates unique constraint") ||
    message.includes("POS_FRONTEND_STUB_IMAGE") ||
    lowered.includes("tenant_not_found")
  );
}

let dockerCircuitBreakerTripped = false;
let consecutiveDockerFailures = 0;
let lastDockerHealthCheckAt = 0;
const DOCKER_HEALTH_CHECK_INTERVAL_MS = 30_000;

async function checkDockerSocketReady(): Promise<boolean> {
  try {
    await execa("docker", ["info"], { timeout: 5000 });
    consecutiveDockerFailures = 0;
    if (dockerCircuitBreakerTripped) {
      logger.info("[worker] Docker socket-proxy recovered. Circuit breaker reset.");
      dockerCircuitBreakerTripped = false;
    }
    return true;
  } catch (err) {
    consecutiveDockerFailures++;
    if (consecutiveDockerFailures >= 3 && !dockerCircuitBreakerTripped) {
      logger.error("[worker] Docker socket-proxy unreachable 3 consecutive times. Tripping circuit breaker!", {
        error: err instanceof Error ? err.message : String(err),
      });
      dockerCircuitBreakerTripped = true;
    }
    return false;
  }
}

const HEARTBEAT_STALE_MS = 600_000; // 10 minutes

async function reclaimStaleJobs(db: ReturnType<typeof createDb>): Promise<void> {
  const staleTime = new Date(Date.now() - HEARTBEAT_STALE_MS);
  
  await db.transaction(async (tx) => {
    const runningJobs = await tx
      .select()
      .from(tenantLifecycleJobs)
      .where(eq(tenantLifecycleJobs.status, "running"));

    const staleJobs = [];
    for (const job of runningJobs) {
      const isHeartbeatStale = job.claimedAt && new Date(job.claimedAt).getTime() <= staleTime.getTime();
      const maxDurMs = (job.maxDuration ?? 3600) * 1000;
      const isDurationStale = job.startedAt && (Date.now() - new Date(job.startedAt).getTime() > maxDurMs);

      if (isHeartbeatStale || isDurationStale) {
        staleJobs.push(job);
      }
    }

    for (const job of staleJobs) {
      const maxDurMs = (job.maxDuration ?? 3600) * 1000;
      const isDurationStale = job.startedAt && (Date.now() - new Date(job.startedAt).getTime() > maxDurMs);
      const errorMsg = isDurationStale ? "worker_job_timeout_exceeded" : "worker_stale_lease_reclaimed";

      const nextAttempts = job.attempts + 1;
      const exhausted = nextAttempts >= job.maxAttempts;
      const nextStatus = exhausted ? "dead" : "pending";

      await tx
        .update(tenantLifecycleJobs)
        .set({
          status: nextStatus,
          attempts: nextAttempts,
          lastError: errorMsg,
          claimedAt: null,
          claimedBy: null,
          claimToken: null,
          runAt: exhausted ? new Date() : new Date(),
          completedAt: exhausted ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(tenantLifecycleJobs.id, job.id));

      if (exhausted) {
        await tx.insert(deadLetterJobs).values({
          jobId: job.id,
          type: job.type,
          tenantId: job.tenantId,
          correlationId: job.correlationId,
          payload: job.payload,
          attempts: nextAttempts,
          maxAttempts: job.maxAttempts,
          lastError: errorMsg,
        });
      }
      
      logger.info(`[worker] Reclaimed stale job ID: ${job.id}, type: ${job.type}, reason: ${errorMsg}, next status: ${nextStatus}`);
    }
  });
}

async function workerPollLoop(db: ReturnType<typeof createDb>, loopId: number): Promise<void> {
  logger.debug(`[worker] Loop ${loopId} polling cycle started.`);
  while (!shuttingDown) {
    const now = Date.now();
    // Run Docker health check periodically
    if (now - lastDockerHealthCheckAt >= DOCKER_HEALTH_CHECK_INTERVAL_MS) {
      lastDockerHealthCheckAt = now;
      await checkDockerSocketReady().catch(() => {});
    }

    if (dockerCircuitBreakerTripped) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }

    logger.debug(`[worker] Loop ${loopId} attempting to claim next job...`);
    const job = await claimNextJob().catch((error) => {
      logger.debug(`[worker] Loop ${loopId} claimNextJob error: ${error instanceof Error ? error.message : String(error)}`);
      if (isApiConnectionError(error)) {
        logApiUnreachable();
        return null;
      }
      Sentry.captureException(error);
      logger.error(`[worker] claim error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (job) {
      logger.info(`[worker] Loop ${loopId} successfully claimed job: ID=${job.id}, Type=${job.type}`);
      apiUnreachableCount = 0;
    } else {
      logger.debug(`[worker] Loop ${loopId} no job claimed.`);
    }
    lastSuccessfulPollAt = Date.now();
    if (!job) {
      const nowMs = Date.now();
      if (
        loopId === 0
        && nowMs - lastLicenseExpireScanMs >= LICENSE_EXPIRE_SCAN_INTERVAL_MS
      ) {
        lastLicenseExpireScanMs = nowMs;
        await expireDueLicenses(db).catch((error) => {
          logger.error(
            `[worker] license expire scan failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
        await reclaimStaleJobs(db).catch((error) => {
          logger.error(
            `[worker] reclaim stale jobs scan failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });

        if (nowMs - lastLicenseReconcileScanMs >= LICENSE_RECONCILE_INTERVAL_MS) {
          lastLicenseReconcileScanMs = nowMs;
          await reconcileAllFinanceLicenses(db).catch((error) => {
            logger.error(
              `[worker] license reconcile scan failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        }
      }
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    const stopHeartbeat = startJobHeartbeatLoop(job.id);
    try {
      const handler = handlers[job.type as keyof typeof handlers] as JobHandler | undefined;
      if (!handler) {
        throw new Error(`unsupported_job_type:${job.type}`);
      }
      // For tenant.provision jobs, capture the one-time admin password so it can be
      // forwarded to the API in-memory store without being written to the DB (CRIT-02).
      let provisionComplete:
        | {
            oneTimeAdminPassword?: string;
            financeOrganizationId?: string;
            financeTenantId?: number;
            financeDefaultWarehouseId?: number;
            posStatus?: string;
            posError?: string;
            tenantStatus?: string;
            walkInCustomerId?: number;
            cashAccountId?: number;
            cardAccountId?: number;
            posOrganizationId?: string;
            posUrl?: string;
            posApiUrl?: string;
            posDefaultCredentials?: {
              adminPin: string;
              allRoles: { role: string; username: string; pin: string }[];
            };
            completionOutcome?: ProvisionJobOutcome;
          }
        | undefined;
      if (job.type === "tenant.provision") {
        provisionComplete = await withExecutionTimeout(runProvisionJob(db, job), jobExecutionTimeoutMs);
      } else if (job.type === "add_module") {
        provisionComplete = await withExecutionTimeout(runAddModuleJob(db, job), jobExecutionTimeoutMs);
      } else if (job.type === "tenant.deprovision") {
        await withExecutionTimeout(handler(db, job), 10 * 60 * 1000);
        // Job row is completed in deprovisionTenant before tenant delete (FK cascade).
      } else {
        await withExecutionTimeout(handler(db, job), jobExecutionTimeoutMs);
      }
      if (job.type !== "tenant.deprovision") {
        await markJobComplete(job.id, provisionComplete);
      }
      const jobOutcome =
        provisionComplete?.completionOutcome
        ?? (job.type === "tenant.provision" || job.type === "add_module" ? "success" : "success");
      await emitWorkerMetric("worker.job.success", 1, { jobType: job.type });
      logger.info(
        JSON.stringify({
          level: "info",
          type: "worker_job_result",
          workerId,
          jobId: job.id,
          jobType: job.type,
          outcome: jobOutcome,
          loopId,
        }),
      );
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[worker][${job.id}] failed: ${message}`);

      if (job.type === "tenant.deprovision" && job.tenantId) {
        try {
          logger.error(`[worker][${job.id}] deprovision timeout guard triggered. Scrubbing...`);
          const rows = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, job.tenantId)).limit(1);
          // if (rows[0]) await scrubTenantRuntimeArtifacts(rows[0].slug);
        } catch (scrubErr) {
          logger.error(`[worker][${job.id}] deprovision fallback scrub failed: ${scrubErr instanceof Error ? scrubErr.message : String(scrubErr)}`);
        }
      }

      try {
        const cancelledByUser = message.startsWith("cancelled_by_user:");
        // Provisioning should fail fast and never retry automatically.
        const noRetry =
          cancelledByUser
          || job.type === "tenant.provision"
          || job.type === "organization.provision"
          || job.type === "add_module"
          || isPermanentWorkerError(message);
        await markJobFailure(job.id, message, noRetry, cancelledByUser);
        await emitWorkerMetric("worker.job.failure", 1, { jobType: job.type });
        logger.info(
          JSON.stringify({
            level: "error",
            type: "worker_job_result",
            workerId,
            jobId: job.id,
            jobType: job.type,
            outcome: "failed",
            error: message,
            loopId,
          }),
        );
      } catch (reportError) {
        logger.error(
          `[worker][${job.id}] failed to report failure: ${reportError instanceof Error ? reportError.message : String(reportError)}`,
        );
        const fallbackNoRetry =
          job.type === "tenant.provision"
          || job.type === "organization.provision"
          || job.type === "add_module"
          || isPermanentWorkerError(message);
        const status = fallbackNoRetry ? "dead" : "pending";
        const nextRunAt = fallbackNoRetry ? null : new Date(Date.now() + 30_000);
        await db.transaction(async (tx) => {
          await tx
            .update(tenantLifecycleJobs)
            .set({
              status,
              lastError: `worker_fallback_failure_persist:${message}`,
              claimedAt: null,
              claimedBy: null,
              claimToken: null,
              runAt: nextRunAt ?? sql`${tenantLifecycleJobs.runAt}`,
              updatedAt: new Date(),
              completedAt: fallbackNoRetry ? new Date() : null,
              attempts: sql`${tenantLifecycleJobs.attempts} + 1`,
            })
            .where(eq(tenantLifecycleJobs.id, job.id));

          if (job.type === "tenant.provision" && job.tenantId) {
            await tx
              .update(tenants)
              .set({ status: "failed" })
              .where(eq(tenants.id, job.tenantId));
            await tx
              .update(tenantDeployments)
              .set({
                status: "failed",
                lastError: `worker_fallback_failure_persist:${message}`,
                updatedAt: new Date(),
              })
              .where(eq(tenantDeployments.tenantId, job.tenantId));
          } else if (job.type === "tenant.deprovision" && job.tenantId) {
            if (fallbackNoRetry) {
              await tx
                .update(tenants)
                .set({ status: "failed" })
                .where(eq(tenants.id, job.tenantId));
            }
          } else if (job.type === "add_module" && job.tenantId) {
            await tx
              .update(tenants)
              .set({ status: "active" })
              .where(eq(tenants.id, job.tenantId));
            await tx
              .update(tenantDeployments)
              .set({
                status: "active",
                lastError: `worker_fallback_failure_persist:${message}`,
                updatedAt: new Date(),
              })
              .where(eq(tenantDeployments.tenantId, job.tenantId));
          }
        }).catch((fallbackError) => {
          logger.error(
            `[worker][${job.id}] fallback failure persistence failed: ${
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            }`,
          );
        });
      }
    } finally {
      stopHeartbeat();
      activeClaimToken = null;
    }
  }
}

async function loop() {
  try {
    apiConfig.validateRequiredEnv();
  } catch (error) {
    logger.error(
      JSON.stringify({
        level: "error",
        event: "worker_secret_rejected",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
  const databaseUrl = apiConfig.databaseUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for infra worker");
  }
  const db = createDb(databaseUrl);
  initEmailLogging(db);
  logger.info("Email logging initialized in worker", { event: "worker_email_logging_init" });

  // Dead-letter monitor: check every 5 minutes for newly failed jobs and log/alert
  const DEAD_LETTER_MONITOR_INTERVAL_MS = 5 * 60_000;
  let lastDeadLetterCheck = new Date(Date.now() - DEAD_LETTER_MONITOR_INTERVAL_MS);
  setInterval(async () => {
    try {
      const since = lastDeadLetterCheck;
      lastDeadLetterCheck = new Date();
      const newDeadLetterJobs = await db
        .select({ id: deadLetterJobs.id, type: deadLetterJobs.type, tenantId: deadLetterJobs.tenantId, lastError: deadLetterJobs.lastError })
        .from(deadLetterJobs)
        .where(and(isNotNull(deadLetterJobs.failedAt), gte(deadLetterJobs.failedAt, since)));
      for (const dlJob of newDeadLetterJobs) {
        Sentry.captureMessage(`Dead-letter job: ${dlJob.type}`, {
          level: "error",
          extra: { jobId: dlJob.id, tenantId: dlJob.tenantId, lastError: dlJob.lastError },
        });
        logger.error(`[worker][dead-letter] type=${dlJob.type} id=${dlJob.id} tenant=${dlJob.tenantId ?? "none"} error=${dlJob.lastError?.slice(0, 200) ?? "unknown"}`);
      }
    } catch (err) {
      logger.warn(`[worker][dead-letter-monitor] check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, DEAD_LETTER_MONITOR_INTERVAL_MS);

  // Capacity monitoring: runs every hour
  const CAPACITY_MONITOR_INTERVAL_MS = 60 * 60_000;
  const capacityMonitorTick = async () => {
    const {
      tenantPortAllocated,
      tenantPortCapacityPct,
      diskUsagePct,
      proxysqlConnectionsPct,
    } = await import("./worker-prometheus.js");

    // Port exhaustion
    try {
      const portMax = parseInt(process.env.TENANT_PORT_RANGE_MAX ?? "65000", 10);
      const portMin = parseInt(process.env.TENANT_PORT_RANGE_MIN ?? "10000", 10);
      const [maxPortRow] = await db
        .select({ maxPort: sql<number>`COALESCE(MAX(${tenantDeployments.internalPort}), ${portMin})` })
        .from(tenantDeployments);
      const highest = Number(maxPortRow?.maxPort ?? portMin);
      tenantPortAllocated.set(highest);
      const pct = ((highest - portMin) / (portMax - portMin)) * 100;
      tenantPortCapacityPct.set(Math.min(100, pct));
      if (pct >= 50) {
        logger.error(`[worker][capacity] PORT CAPACITY WARNING: ${pct.toFixed(1)}% of port range used (highest=${highest}, max=${portMax})`);
        Sentry.captureMessage("Tenant port range above 50% capacity", { level: "warning", extra: { highest, portMax, pct } });
      }
    } catch (err) {
      logger.warn(`[worker][capacity] port check failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Disk usage
    try {
      const envRoot = process.env.TENANT_ENV_ROOT ?? "/opt/tenants";
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("df", ["--output=pcent", envRoot]);
      const match = stdout.match(/(\d+)%/);
      if (match) {
        const pct = parseInt(match[1] ?? "0", 10);
        diskUsagePct.set(pct);
        if (pct >= 80) {
          logger.error(`[worker][capacity] DISK WARNING: ${pct}% used on ${envRoot}`);
          Sentry.captureMessage("Tenant disk usage critical", { level: "warning", extra: { envRoot, pct } });
        }
      }
    } catch (err) {
      logger.warn(`[worker][capacity] disk check failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ProxySQL connections
    try {
      const proxysqlStatsUrl = process.env.PROXYSQL_STATS_URL;
      if (proxysqlStatsUrl) {
        const res = await fetch(`${proxysqlStatsUrl}/stats/connections`, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) {
          const data = (await res.json()) as { active?: number; max?: number };
          if (typeof data.active === "number" && typeof data.max === "number" && data.max > 0) {
            const pct = (data.active / data.max) * 100;
            proxysqlConnectionsPct.set(pct);
            if (pct >= 80) {
              logger.error(`[worker][capacity] PROXYSQL CONNECTION WARNING: ${pct.toFixed(1)}% of max connections used`);
              Sentry.captureMessage("ProxySQL connections near limit", { level: "warning", extra: { active: data.active, max: data.max, pct } });
            }
          }
        }
      }
    } catch (err) {
      logger.warn(`[worker][capacity] proxysql check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  void capacityMonitorTick();
  setInterval(() => void capacityMonitorTick(), CAPACITY_MONITOR_INTERVAL_MS);

  logger.info(
    JSON.stringify({
      level: "info",
      type: "worker_start",
      event: "worker_secret_validated",
      length: apiConfig.workerSecret.length,
      jobExecutionTimeoutMs,
      apiBaseUrl,
      ...runtimeFingerprint,
    }),
  );
  await waitForApiReady().catch((error) => {
    logger.error(
      `[worker] ${error instanceof Error ? error.message : String(error)} — start the API (pnpm dev apps) then restart the worker.`,
    );
    process.exit(1);
  });
  logger.info(
    JSON.stringify({
      level: "info",
      type: "worker_startup_grace",
      graceMs: startupGraceMs,
    }),
  );
  await new Promise((r) => setTimeout(r, startupGraceMs));
  logger.info(
    JSON.stringify({
      level: "info",
      type: "worker_claiming_jobs",
      apiBaseUrl,
      workerConcurrency,
    }),
  );
  await checkRequiredTenantImages().catch((error) => {
    logger.warn(
      `[worker] image pre-check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  await Promise.all(
    Array.from({ length: workerConcurrency }, (_, loopId) => workerPollLoop(db, loopId)),
  );
}

process.on("SIGTERM", () => {
  shuttingDown = true;
  logger.info(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGTERM", workerId }));
  void shutdownAdvisoryLockClient();
});
process.on("SIGINT", () => {
  shuttingDown = true;
  logger.info(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGINT", workerId }));
  void shutdownAdvisoryLockClient();
});
process.on("exit", () => {
  void shutdownAdvisoryLockClient();
});
process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
  logger.error(`[worker] uncaughtException: ${error instanceof Error ? error.message : String(error)}`);
});
process.on("unhandledRejection", (reason) => {
  Sentry.captureException(reason);
  logger.error(`[worker] unhandledRejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});

void loop();
