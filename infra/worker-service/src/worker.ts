import * as Sentry from "@sentry/node";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { logger } from "./lib/logger.js";

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
} from "@repo/db/schema";
import { and, eq, sql, isNotNull, lte } from "drizzle-orm";
import {
  initEmailLogging,
  processLicenseExpiryFollowUp,
} from "@repo/platform-worker-shared";
import { z } from "zod";
import { checkRequiredTenantImages } from "../domain/provisioning/check-tenant-images.js";
import {
  resolveProvisionJobOutcome,
  type ProvisionJobOutcome,
} from "../domain/provisioning/provision-outcome-rules.js";
import {
  assertNoConcurrentTenantLifecycleJob,
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

const workerId = `infra-worker-${randomUUID()}`;
const pollMs = 1500;
const POLL_INTERVAL_MS = pollMs;
const workerConcurrency = Math.max(
  1,
  parseInt(process.env.WORKER_CONCURRENCY ?? String(apiConfig.workerConcurrency), 10) || 1,
);
let lastSuccessfulPollAt = Date.now();

const healthServer = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    const lastPollAge = Date.now() - lastSuccessfulPollAt;
    const healthy = lastPollAge < POLL_INTERVAL_MS * 2;
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: healthy ? "ok" : "degraded", lastPollAge }));
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
/** Prefer 127.0.0.1 on Windows to avoid localhost → ::1 while API listens on IPv4. */
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
  const healthUrl = `${apiBaseUrl}/health`;
  const started = Date.now();
  logger.info(
    JSON.stringify({
      level: "info",
      type: "worker_waiting_for_api",
      healthUrl,
      maxWaitMs: apiReadyMaxWaitMs,
    }),
  );
  while (!shuttingDown && Date.now() - started < apiReadyMaxWaitMs) {
    try {
      const res = await fetch(healthUrl, { signal: timeoutSignal(5_000) });
      if (res.ok) {
        logger.info(JSON.stringify({ level: "info", type: "worker_api_ready", healthUrl }));
        return;
      }
    } catch {
      // API still starting (tsx watch) or temporarily down
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`api_not_ready:${healthUrl}`);
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

async function markJobFailure(jobId: string, message: string, noRetry = false): Promise<void> {
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
  }, heartbeatIntervalMs);
  return () => clearInterval(timer);
}

async function assertProvisionNotCancelled(
  jobId: string,
): Promise<void> {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
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
    await assertProvisionNotCancelled(job.id);
  };
  const payload = provisionPayloadSchema.parse(job.payload);
  if (payload.needsScrub) {
    await scrubTenantRuntimeArtifacts(payload.slug);
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
  if (job.tenantId) {
    // Concurrent provision guard — prevents duplicate compose/DB ops
    // for same tenant. See provision-lock.ts for implementation.
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
  // Return the one-time password so the loop can pass it to markJobComplete
  // without persisting it to any database (CRIT-02).
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
  return {
    tenantStatus: result.tenantStatus,
    posStatus: result.posStatus,
    posError: result.posError,
    posOrganizationId: result.posOrganizationId,
    posUrl: result.posUrl,
    posApiUrl: result.posApiUrl,
    posDefaultCredentials: result.posDefaultCredentials,
  };
}

async function runRemoveModuleJob(
  job: { id: string; payload: Record<string, unknown> },
): Promise<void> {
  const payload = removeModulePayloadSchema.parse(job.payload);
  if (payload.module === "pos" || payload.module === "pms") {
    await stopModuleStack(payload.slug, payload.module, (m) =>
      logger.info(`[worker][${job.id}] ${m}`),
    );
  }
  if (payload.module === "accounting") {
    await stopFinanceStack(payload.slug, (m) =>
      logger.info(`[worker][${job.id}] ${m}`),
    );
  }
}

async function runDeprovisionJob(db: ReturnType<typeof createDb>, job: {
  id: string;
  tenantId: string | null;
  payload: Record<string, unknown>;
}) {
  if (!job.tenantId) throw new Error("tenantId is required");
  await assertNoConcurrentTenantLifecycleJob(db, job.tenantId, job.id);
  const removeVolumes = job.payload.removeVolumes === true;
  const removeImages = job.payload.removeImages === true;
  const result = await withTenantLifecycleAdvisoryLock(db, job.tenantId, () =>
    deprovisionTenant(db, job.tenantId!, {
      removeVolumes,
      removeImages,
      log: (m) => logger.info(`[worker][${job.id}] ${m}`),
    }),
  );
  if (!result.ok) throw new Error(result.message);
}

async function runTenantLifecycleCommand(
  db: ReturnType<typeof createDb>,
  job: { tenantId: string | null; id: string },
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
}

const handlers = {
  "tenant.provision": runProvisionJob,
  "organization.provision": runOrgProvisionJob,
  "tenant.deprovision": runDeprovisionJob,
  add_module: runAddModuleJob,
  remove_module: (_db: ReturnType<typeof createDb>, job: ClaimedJob) => runRemoveModuleJob(job),
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

function isPermanentProvisionError(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    message.startsWith("tenant_slug_exists:") ||
    lowered.includes("tenants_slug_unique") ||
    lowered.includes("duplicate key value violates unique constraint") ||
    message.includes("POS_FRONTEND_STUB_IMAGE")
  );
}

async function workerPollLoop(db: ReturnType<typeof createDb>, loopId: number): Promise<void> {
  while (!shuttingDown) {
    const job = await claimNextJob().catch((error) => {
      if (isApiConnectionError(error)) {
        logApiUnreachable();
        return null;
      }
      Sentry.captureException(error);
      logger.error(`[worker] claim error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (job) {
      apiUnreachableCount = 0;
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
      } else {
        await withExecutionTimeout(handler(db, job), jobExecutionTimeoutMs);
      }
      await markJobComplete(job.id, provisionComplete);
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
      try {
        const cancelledByUser = message.startsWith("cancelled_by_user:");
        // Provisioning should fail fast and never retry automatically.
        const noRetry =
          cancelledByUser
          || job.type === "tenant.provision"
          || job.type === "organization.provision"
          || job.type === "add_module"
          || isPermanentProvisionError(message);
        await markJobFailure(job.id, message, noRetry);
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
          || isPermanentProvisionError(message);
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
  const databaseUrl = apiConfig.databaseUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for infra worker");
  }
  const db = createDb(databaseUrl);
  initEmailLogging(db);
  logger.info("Email logging initialized in worker", { event: "worker_email_logging_init" });
  logger.info(
    JSON.stringify({
      level: "info",
      type: "worker_start",
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
});
process.on("SIGINT", () => {
  shuttingDown = true;
  logger.info(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGINT", workerId }));
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
