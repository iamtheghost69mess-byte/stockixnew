import { randomUUID } from "node:crypto";
import { apiConfig } from "@repo/config";
import type { createDb } from "@repo/db";
import {
  licenses,
  organizations,
  owners,
  tenantDeployments,
  tenantLifecycleJobs,
  tenants,
} from "@repo/db/schema";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";

import { logAudit } from "../audit.js";
import {
  DEFAULT_GRACE_PERIOD_DAYS,
  DEFAULT_LICENSE_TERM_DAYS,
} from "../license-constants.js";
import {
  generateLicenseKey,
  getActiveLicenseForTenant,
  getPlanLimits,
} from "../license-utils.js";
import {
  notifyJobLifecycle,
  notifyModuleAdded,
  notifyAddModuleFailed,
  notifyProvisionOutcome,
} from "../notification-helpers.js";
import { safeCreateNotification } from "../notification-service.js";
import {
  readFinanceTenantIdFromProvisionEvents,
  resolveAndPersistFinanceTenantId,
} from "../finance-tenant-resolve.js";
import { syncFinanceLicenseForStockixTenant } from "../finance-license.client.js";
import { mailSendSucceeded } from "../mail/mailer.js";
import { sendTenantWelcomeEmail, sendLicenseActivatedEmailForTenant, sendProvisionCompleteOwnerEmail } from "../mail/send.js";
import { rootDomainForOrganizationSubdomain } from "../lib/organization-domain.js";
import { emitInternalJobAudit, emitMetric } from "../lib/metrics.js";
import {
  PROVISION_PASSWORD_TTL_MS,
  type PosDefaultCredentialsPayload,
  provisionPasswordCache,
  provisionPosCredentialsCache,
  purgeProvisionCaches,
} from "../lib/provision-caches.js";
import {
  appendProvisionEventSafe,
  encryptProvisionSecret,
} from "../lib/provision-events.js";
import { isRecord, readNonEmptyString } from "../lib/record-utils.js";
import { logger } from "../lib/logger.js";
import {
  parseTenantModules,
  serializeTenantModules,
  type StockixModule,
} from "../services/auth/stockix-product-token.js";
import { ensureDefaultTenantConfig } from "./tenant-config.js";
import { handleTerminalProvisionJobFailure } from "../provisioning/provision-failure.js";

type Db = ReturnType<typeof createDb>;

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    actorEffectiveRole?: string;
    actorPermissions?: string[];
    apiKeyId?: string;
    requestId: string;
    requestStartMs: number;
  };
};

export function registerInternalRoutes(app: Hono<ApiEnv>, db: Db | null): void {
app.post("/internal/jobs/claim", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
  if (!workerId) {
    return c.json({ error: "worker_id_required" }, 400);
  }
  const heartbeatStaleMs = apiConfig.workerHeartbeatStaleMs;
  const staleLeaseMs = apiConfig.workerStaleLeaseThresholdMs;
  // effectiveStaleMs = min(heartbeat, lease) — intentional conservative bound.
  // A job is considered stale when EITHER its heartbeat has not been updated
  // for workerHeartbeatStaleMs OR its total lease exceeds workerStaleLeaseThresholdMs.
  // Using min() ensures the tighter constraint wins, preventing both zombie jobs
  // (heartbeat-only check) and indefinitely locked jobs (lease-only check).
  // Both thresholds are configured in infra/prod/.env:
  //   WORKER_HEARTBEAT_STALE_MS  (default 600000 = 10min)
  //   WORKER_STALE_LEASE_THRESHOLD_MS (default 3000000 = 50min)
  // Architecture2.md §12.3 job lifecycle.
  const effectiveStaleMs = Math.min(heartbeatStaleMs, staleLeaseMs);
  const staleBefore = new Date(Date.now() - effectiveStaleMs);
  const staleBeforeIso = staleBefore.toISOString();
  const staleProvisionAlerts: Array<{
    tenantId: string;
    exhausted: boolean;
    correlationId: string | null;
    jobType: string;
  }> = [];
  const claimed = await db.transaction(async (tx) => {
    const staleRunning = await tx
      .select({
        id: tenantLifecycleJobs.id,
        tenantId: tenantLifecycleJobs.tenantId,
        type: tenantLifecycleJobs.type,
        attempts: tenantLifecycleJobs.attempts,
        maxAttempts: tenantLifecycleJobs.maxAttempts,
        correlationId: tenantLifecycleJobs.correlationId,
      })
      .from(tenantLifecycleJobs)
      .where(
        and(
          eq(tenantLifecycleJobs.status, "running"),
          sql`${tenantLifecycleJobs.claimedAt} IS NOT NULL`,
          sql`${tenantLifecycleJobs.claimedAt} < ${staleBeforeIso}::timestamptz`,
        ),
      );
    for (const staleJob of staleRunning) {
      if (staleJob.type === "tenant.provision" && staleJob.tenantId) {
        const [otherRunning] = await tx
          .select({ id: tenantLifecycleJobs.id })
          .from(tenantLifecycleJobs)
          .where(
            and(
              eq(tenantLifecycleJobs.tenantId, staleJob.tenantId),
              eq(tenantLifecycleJobs.status, "running"),
              ne(tenantLifecycleJobs.id, staleJob.id),
            ),
          )
          .limit(1);
        if (otherRunning) {
          logger.warn("concurrent_provision_aborted", {
            tenantId: staleJob.tenantId,
            staleJobId: staleJob.id,
            otherJobId: otherRunning.id,
          });
          continue;
        }
      }
      const nextAttempts = staleJob.attempts + 1;
      const exhausted = nextAttempts >= staleJob.maxAttempts;
      const nextStatus = exhausted ? "dead" : "pending";
      await tx
        .update(tenantLifecycleJobs)
        .set(
          exhausted
            ? {
                status: nextStatus,
                attempts: nextAttempts,
                lastError: sql`'worker_stale_lease_reclaimed'`,
                claimedAt: null,
                claimedBy: null,
                claimToken: null,
                completedAt: new Date(),
                updatedAt: new Date(),
              }
            : {
                status: nextStatus,
                attempts: nextAttempts,
                lastError: sql`'worker_stale_lease_reclaimed'`,
                claimedAt: null,
                claimedBy: null,
                claimToken: null,
                runAt: new Date(),
                completedAt: null,
                updatedAt: new Date(),
              },
        )
        .where(eq(tenantLifecycleJobs.id, staleJob.id));
      if (staleJob.type === "tenant.provision" && staleJob.tenantId) {
        if (exhausted) {
          await handleTerminalProvisionJobFailure(
            tx as unknown as Db,
            {
              type: staleJob.type,
              tenantId: staleJob.tenantId,
              correlationId: staleJob.correlationId ?? null,
              payload: null,
            },
            "worker_stale_lease_reclaimed",
          );
        }
        staleProvisionAlerts.push({
          tenantId: staleJob.tenantId,
          exhausted,
          correlationId: staleJob.correlationId ?? null,
          jobType: staleJob.type,
        });
      } else if (staleJob.type === "add_module" && staleJob.tenantId && exhausted) {
        await handleTerminalProvisionJobFailure(
          tx as unknown as Db,
          {
            type: staleJob.type,
            tenantId: staleJob.tenantId,
            correlationId: staleJob.correlationId ?? null,
            payload: null,
          },
          "worker_stale_lease_reclaimed",
        );
        staleProvisionAlerts.push({
          tenantId: staleJob.tenantId,
          exhausted: true,
          correlationId: staleJob.correlationId ?? null,
          jobType: staleJob.type,
        });
      }
    }

    const claimToken = randomUUID();
    const [updated] = await tx
      .update(tenantLifecycleJobs)
      .set({
        status: "running",
        claimedAt: new Date(),
        claimedBy: workerId,
        claimToken,
        updatedAt: new Date(),
      })
      .where(
        eq(
          tenantLifecycleJobs.id,
          sql`(
            SELECT id FROM tenant_lifecycle_jobs
            WHERE status = 'pending'
              AND attempts < max_attempts
              AND run_at <= NOW()
            ORDER BY priority DESC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )`,
        ),
      )
      .returning();
    return updated ?? null;
  });

  for (const alert of staleProvisionAlerts) {
    const [tenantRow] = await db
      .select({ ownerId: tenants.ownerId, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, alert.tenantId))
      .limit(1);
    if (!tenantRow) continue;
    if (alert.exhausted) {
      if (alert.jobType === "add_module") {
        notifyAddModuleFailed(db, {
          tenantId: alert.tenantId,
          lastError: "worker_stale_lease_reclaimed",
          correlationId: alert.correlationId,
        });
      } else {
        notifyProvisionOutcome(db, {
          tenantId: alert.tenantId,
          finalStatus: "failed",
          correlationId: alert.correlationId,
          lastError: "worker_stale_lease_reclaimed",
        });
      }
    } else {
      notifyJobLifecycle(db, {
        ownerId: tenantRow.ownerId,
        tenantId: alert.tenantId,
        tenantName: tenantRow.name,
        type: "job.stuck",
        lastError: "worker_stale_lease_reclaimed",
        correlationId: alert.correlationId,
      });
    }
  }

  return c.json({ job: claimed });
});

app.post("/internal/jobs/:jobId/heartbeat", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const jobId = c.req.param("jobId");
  const body = await c.req.json().catch(() => ({}));
  const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
  const claimToken = String((body as { claimToken?: unknown }).claimToken ?? "").trim();
  if (!workerId) {
    return c.json({ error: "worker_id_required" }, 400);
  }
  const [updated] = await db
    .update(tenantLifecycleJobs)
    .set({
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tenantLifecycleJobs.id, jobId),
        eq(tenantLifecycleJobs.status, "running"),
        eq(tenantLifecycleJobs.claimedBy, workerId),
        ...(claimToken ? [eq(tenantLifecycleJobs.claimToken, claimToken)] : []),
      ),
    )
    .returning({ id: tenantLifecycleJobs.id });
  if (!updated) {
    return c.json({ ok: false, error: "heartbeat_rejected" }, 409);
  }
  return c.json({ ok: true });
});

app.get("/internal/jobs/:jobId/cancel-check", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const jobId = c.req.param("jobId");
  const [job] = await db
    .select({
      id: tenantLifecycleJobs.id,
      status: tenantLifecycleJobs.status,
      lastError: tenantLifecycleJobs.lastError,
      cancelRequestedAt: tenantLifecycleJobs.cancelRequestedAt,
    })
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.id, jobId))
    .limit(1);
  if (!job) {
    return c.json({ cancelled: true, reason: "job_not_found" });
  }
  if (job.status === "cancelled" || job.status === "dead" || job.status === "completed") {
    return c.json({ cancelled: true, reason: `status=${job.status}` });
  }
  if (job.status === "running" && job.cancelRequestedAt) {
    return c.json({ cancelled: true, reason: "cancel_requested" });
  }
  return c.json({ cancelled: false });
});

app.patch("/internal/organizations/:controlPlaneOrgId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

  const orgId = c.req.param("controlPlaneOrgId");
  const parsed = z.string().uuid().safeParse(orgId);
  if (!parsed.success) {
    return c.json({ error: "INVALID_ORG_ID" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const bodyParsed = z
    .object({
      financeOrganizationId: z.string().min(1).max(255).optional(),
      posOrganizationId: z.string().min(1).max(64).optional(),
      provisioningError: z.string().max(2000).nullable().optional(),
    })
    .safeParse(body);

  if (!bodyParsed.success) {
    return c.json(
      { error: "VALIDATION_ERROR", detail: bodyParsed.error.flatten() },
      400,
    );
  }

  if (
    !bodyParsed.data.financeOrganizationId
    && !bodyParsed.data.posOrganizationId
    && bodyParsed.data.provisioningError === undefined
  ) {
    return c.json({ error: "VALIDATION_ERROR", message: "No fields to update" }, 400);
  }

  const [updated] = await db
    .update(organizations)
    .set({
      ...(bodyParsed.data.financeOrganizationId
        ? { financeOrganizationId: bodyParsed.data.financeOrganizationId }
        : {}),
      ...(bodyParsed.data.posOrganizationId
        ? { posOrganizationId: bodyParsed.data.posOrganizationId }
        : {}),
      ...(bodyParsed.data.provisioningError !== undefined
        ? { provisioningError: bodyParsed.data.provisioningError }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, parsed.data))
    .returning({ id: organizations.id });

  if (!updated) {
    return c.json({ error: "organization_not_found" }, 404);
  }

  return c.json({ ok: true });
});

app.post("/internal/jobs/:jobId/complete", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const jobId = c.req.param("jobId");
  const body = await c.req.json().catch(() => ({}));
  const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
  const claimToken = String((body as { claimToken?: unknown }).claimToken ?? "").trim();
  // oneTimeAdminPassword is passed by the worker for tenant.provision jobs.
  // Persisted encrypted on tenant_deployments; also cached in memory for 15 minutes.
  const oneTimeAdminPassword =
    typeof (body as { oneTimeAdminPassword?: unknown }).oneTimeAdminPassword === "string"
      ? (body as { oneTimeAdminPassword: string }).oneTimeAdminPassword
      : undefined;
  const posDefaultCredentialsRaw = (body as { posDefaultCredentials?: unknown })
    .posDefaultCredentials;
  const posDefaultCredentials =
    isRecord(posDefaultCredentialsRaw)
    && typeof posDefaultCredentialsRaw.adminPin === "string"
    && Array.isArray(posDefaultCredentialsRaw.allRoles)
      ? (posDefaultCredentialsRaw as PosDefaultCredentialsPayload)
      : undefined;
  const completeResult = isRecord(body) && isRecord(body.result) ? body.result : null;
  const financeOrganizationIdFromResult = completeResult
    ? readNonEmptyString(completeResult.financeOrganizationId)
    : undefined;
  let financeTenantIdFromResult = completeResult
    ? Number(completeResult.financeTenantId)
    : NaN;
  const financeDefaultWarehouseIdFromResult = completeResult
    ? Number(completeResult.financeDefaultWarehouseId)
    : NaN;
  const walkInCustomerIdFromResult = completeResult
    ? Number(completeResult.walkInCustomerId)
    : NaN;
  const cashAccountIdFromResult = completeResult
    ? Number(completeResult.cashAccountId)
    : NaN;
  const cardAccountIdFromResult = completeResult
    ? Number(completeResult.cardAccountId)
    : NaN;
  const posOrganizationIdFromResult = completeResult
    ? readNonEmptyString(completeResult.posOrganizationId)
    : undefined;
  const posUrlFromResult = completeResult
    ? readNonEmptyString(completeResult.posUrl)
    : undefined;
  const [currentJob] = await db
    .select({
      id: tenantLifecycleJobs.id,
      type: tenantLifecycleJobs.type,
      tenantId: tenantLifecycleJobs.tenantId,
      correlationId: tenantLifecycleJobs.correlationId,
      payload: tenantLifecycleJobs.payload,
      claimedBy: tenantLifecycleJobs.claimedBy,
      claimToken: tenantLifecycleJobs.claimToken,
    })
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.id, jobId))
    .limit(1);
  if (!currentJob) return c.json({ error: "job_not_found" }, 404);

  if (
    currentJob.type === "tenant.provision"
    && currentJob.correlationId
    && (!Number.isFinite(financeTenantIdFromResult) || financeTenantIdFromResult <= 0)
  ) {
    const fromJournal = await readFinanceTenantIdFromProvisionEvents(
      db,
      currentJob.correlationId,
    );
    if (fromJournal) financeTenantIdFromResult = fromJournal;
  }
  if (
    currentJob.type === "tenant.provision"
    && currentJob.tenantId
    && (!Number.isFinite(financeTenantIdFromResult) || financeTenantIdFromResult <= 0)
  ) {
    const resolved = await resolveAndPersistFinanceTenantId(db, currentJob.tenantId);
    if (resolved.ok) financeTenantIdFromResult = resolved.financeTenantId;
  }
  if (workerId && currentJob.claimedBy && currentJob.claimedBy !== workerId) {
    return c.json({ error: "job_claim_mismatch" }, 409);
  }
  if (claimToken && currentJob.claimToken && currentJob.claimToken !== claimToken) {
    return c.json({ error: "job_claim_token_mismatch" }, 409);
  }
  const [updated] = await db
    .update(tenantLifecycleJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      lastError: null,
      claimedAt: null,
      claimedBy: null,
      claimToken: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tenantLifecycleJobs.id, jobId),
        eq(tenantLifecycleJobs.status, "running"),
        ...(claimToken ? [eq(tenantLifecycleJobs.claimToken, claimToken)] : []),
      ),
    )
    .returning();
  if (!updated) return c.json({ error: "job_not_running" }, 409);
  // Store the one-time admin password in memory as a fast path.
  if (currentJob?.type === "tenant.provision" && currentJob.correlationId && oneTimeAdminPassword) {
    provisionPasswordCache.set(currentJob.correlationId, {
      password: oneTimeAdminPassword,
      expiresAt: Date.now() + PROVISION_PASSWORD_TTL_MS,
    });
    await appendProvisionEventSafe(db, {
      correlationId: currentJob.correlationId,
      phase: "secret",
      level: "info",
      message: "Bootstrap admin OTP persisted",
      tenantId: currentJob.tenantId,
      meta: {
        type: "bootstrap_admin_otp",
        cipher: encryptProvisionSecret(oneTimeAdminPassword),
      },
    });
  }
  if (
    currentJob?.type === "tenant.provision"
    && currentJob.correlationId
    && posDefaultCredentials
  ) {
    provisionPosCredentialsCache.set(currentJob.correlationId, {
      credentials: posDefaultCredentials,
      expiresAt: Date.now() + PROVISION_PASSWORD_TTL_MS,
    });
    await appendProvisionEventSafe(db, {
      correlationId: currentJob.correlationId,
      phase: "secret",
      level: "info",
      message: "POS bootstrap PIN credentials persisted",
      tenantId: currentJob.tenantId,
      meta: {
        type: "pos_bootstrap_pins",
        cipher: encryptProvisionSecret(JSON.stringify(posDefaultCredentials)),
        posOrganizationId:
          completeResult && typeof completeResult.posOrganizationId === "string"
            ? completeResult.posOrganizationId
            : undefined,
      },
    });
  }
  if (currentJob?.type === "tenant.provision" && currentJob.correlationId) {
    await appendProvisionEventSafe(db, {
      correlationId: currentJob.correlationId,
      phase: "provisioning.completed",
      level: "info",
      message: "Provisioning worker marked lifecycle job completed",
      tenantId: currentJob.tenantId,
      meta: { jobId: currentJob.id },
    });
  }
  if (currentJob?.type === "tenant.provision") {
    const payloadSlug =
      currentJob.payload &&
      typeof currentJob.payload === "object" &&
      "slug" in currentJob.payload &&
      typeof (currentJob.payload as { slug?: unknown }).slug === "string"
        ? String((currentJob.payload as { slug: string }).slug)
        : null;
    let targetTenantId = currentJob.tenantId;
    if (!targetTenantId && payloadSlug) {
      const [row] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, payloadSlug))
        .limit(1);
      targetTenantId = row?.id ?? null;
    }
    if (targetTenantId) {
      const tenantStatusFromResult =
        completeResult && typeof completeResult.tenantStatus === "string"
          ? completeResult.tenantStatus
          : null;
      const posStatusFromResult =
        completeResult && typeof completeResult.posStatus === "string"
          ? completeResult.posStatus
          : null;
      const posErrorFromResult =
        completeResult && typeof completeResult.posError === "string"
          ? completeResult.posError
          : null;
      const finalTenantStatus =
        tenantStatusFromResult === "partial" || tenantStatusFromResult === "active"
          ? tenantStatusFromResult
          : posStatusFromResult === "failed"
            ? "partial"
            : "active";
      const deploymentStatus =
        finalTenantStatus === "partial" ? "active" : finalTenantStatus;
      const deploymentLastError =
        finalTenantStatus === "partial"
          ? (posErrorFromResult ?? "POS provisioning failed")
          : null;

      const [tenantNameRow] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, targetTenantId))
        .limit(1);
      if (tenantNameRow?.name) {
        await ensureDefaultTenantConfig(db, targetTenantId, {
          appName: tenantNameRow.name,
        });
      }

      await db
        .update(tenants)
        .set({ status: finalTenantStatus })
        .where(eq(tenants.id, targetTenantId));
      await db
        .update(tenantDeployments)
        .set({
          status: deploymentStatus,
          lastError: deploymentLastError,
          ...(finalTenantStatus === "active" ? { partialFailureKind: null } : {}),
          registrationCompletedAt: new Date(),
          updatedAt: new Date(),
          ...(oneTimeAdminPassword
            ? { financeAdminPassword: encryptProvisionSecret(oneTimeAdminPassword) }
            : {}),
        })
        .where(eq(tenantDeployments.tenantId, targetTenantId));

      notifyProvisionOutcome(db, {
        tenantId: targetTenantId,
        finalStatus: finalTenantStatus,
        correlationId: currentJob.correlationId,
        lastError: deploymentLastError,
      });

      try {
        const payload = currentJob.payload && typeof currentJob.payload === "object"
          ? (currentJob.payload as Record<string, unknown>)
          : {};
        const planSlug =
          typeof payload.planSlug === "string" && payload.planSlug.length > 0
            ? payload.planSlug
            : "starter";
        const provisionModules: StockixModule[] = Array.isArray(payload.modules)
          ? payload.modules.filter(
              (m): m is StockixModule =>
                typeof m === "string"
                && (["accounting", "pos", "pms", "chat"] as const).includes(m as StockixModule),
            )
          : ["accounting"];
        const modulesSerialized = serializeTenantModules(
          provisionModules.length > 0 ? provisionModules : ["accounting"],
        );
        const assignExistingLicenseId =
          typeof payload.assignExistingLicenseId === "string" ? payload.assignExistingLicenseId : null;
        const provisionRequestedById =
          typeof payload.provisionRequestedById === "string" ? payload.provisionRequestedById : null;
        const planLimits = await getPlanLimits(db, planSlug);

        await db
          .update(tenants)
          .set({ planSlug, modules: modulesSerialized })
          .where(eq(tenants.id, targetTenantId));

        if (assignExistingLicenseId) {
          const [lic] = await db
            .select()
            .from(licenses)
            .where(eq(licenses.id, assignExistingLicenseId))
            .limit(1);
          if (lic?.status === "unassigned") {
            const assignSet = {
              tenantId: targetTenantId,
              status: "active",
              activatedAt: new Date(),
              validFrom: lic.validFrom ?? new Date(),
              updatedAt: new Date(),
              planSlug,
              modules: modulesSerialized,
              maxOrganizations: planLimits.maxOrganizations,
              maxActivations: planLimits.maxActivations,
            };
            await db
              .update(licenses)
              .set(assignSet)
              .where(eq(licenses.id, lic.id));
          }
        } else {
          const existingLicense = await getActiveLicenseForTenant(db, targetTenantId);
          if (!existingLicense) {
            let licenseKey = generateLicenseKey();
            for (let attempt = 0; attempt < 3; attempt++) {
              const clash = await db
                .select({ id: licenses.id })
                .from(licenses)
                .where(eq(licenses.licenseKey, licenseKey))
                .limit(1);
              if (clash.length === 0) break;
              licenseKey = generateLicenseKey();
            }
            const validFrom = new Date();
            const expiresAt = new Date(validFrom);
            expiresAt.setDate(expiresAt.getDate() + DEFAULT_LICENSE_TERM_DAYS);
            await db.insert(licenses).values({
              licenseKey,
              product: "platform",
              modules: modulesSerialized,
              planSlug,
              tenantId: targetTenantId,
              status: "active",
              activatedAt: validFrom,
              validFrom,
              expiresAt,
              isPerpetual: false,
              maxOrganizations: planLimits.maxOrganizations,
              maxActivations: planLimits.maxActivations,
              maxUsers: planLimits.maxUsers,
              activationCount: 0,
              gracePeriodDays: DEFAULT_GRACE_PERIOD_DAYS,
              createdById: provisionRequestedById ?? null,
            });
          }
        }

        if (provisionRequestedById && z.string().uuid().safeParse(provisionRequestedById).success) {
          await logAudit(db, {
            actorId: provisionRequestedById,
            action: "license.auto_assigned_on_provision",
            targetTenantId: targetTenantId,
            ipAddress: apiConfig.hostname,
            userAgent: "worker/tenant.provision.complete",
            metadata: { assignExistingLicenseId, planSlug },
          });
        }
      } catch (licenseErr) {
        logger.error("provision license assignment failed (non-fatal)", licenseErr);
      }

      if (targetTenantId && (posOrganizationIdFromResult || posUrlFromResult)) {
        await db
          .update(tenantDeployments)
          .set({
            ...(posOrganizationIdFromResult
              ? { posOrganizationId: posOrganizationIdFromResult }
              : {}),
            ...(posUrlFromResult ? { posUrl: posUrlFromResult } : {}),
            updatedAt: new Date(),
          })
          .where(eq(tenantDeployments.tenantId, targetTenantId));
      }

      if (
        targetTenantId &&
        Number.isFinite(financeTenantIdFromResult) &&
        financeTenantIdFromResult > 0
      ) {
        await db
          .update(tenantDeployments)
          .set({
            financeTenantId: financeTenantIdFromResult,
            ...(Number.isFinite(financeDefaultWarehouseIdFromResult)
            && financeDefaultWarehouseIdFromResult > 0
              ? { financeDefaultWarehouseId: financeDefaultWarehouseIdFromResult }
              : {}),
            ...(Number.isFinite(walkInCustomerIdFromResult) && walkInCustomerIdFromResult > 0
              ? { financeWalkInCustomerId: walkInCustomerIdFromResult }
              : {}),
            ...(Number.isFinite(cashAccountIdFromResult) && cashAccountIdFromResult > 0
              ? { financeCashAccountId: cashAccountIdFromResult }
              : {}),
            ...(Number.isFinite(cardAccountIdFromResult) && cardAccountIdFromResult > 0
              ? { financeCardAccountId: cardAccountIdFromResult }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(tenantDeployments.tenantId, targetTenantId));

        try {
          await syncFinanceLicenseForStockixTenant(db, {
            stockixTenantId: targetTenantId,
            financeTenantId: financeTenantIdFromResult,
          });
          if (currentJob.correlationId) {
            await appendProvisionEventSafe(db, {
              correlationId: currentJob.correlationId,
              phase: "finance_license",
              message: `[finance-license] Synced license for finance tenant ${financeTenantIdFromResult}`,
              tenantId: targetTenantId,
            });
          }
        } catch (err) {
          logger.error("provision finance license sync failed", err);
        }
      }

      if (updated.type === "tenant.provision" && financeOrganizationIdFromResult) {
        const existingPrimary = await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(
            and(
              eq(organizations.tenantId, targetTenantId),
              eq(organizations.isPrimary, true),
            ),
          )
          .limit(1);

        if (existingPrimary.length === 0) {
          const [tenant] = await db
            .select()
            .from(tenants)
            .where(eq(tenants.id, targetTenantId))
            .limit(1);

          if (tenant) {
            const root = rootDomainForOrganizationSubdomain();
            const subdomain = `${tenant.slug}.${root}`.slice(0, 255);
            await db.insert(organizations).values({
              tenantId: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              subdomain,
              status: "active",
              isPrimary: true,
              financeOrganizationId: financeOrganizationIdFromResult,
            });
          }
        } else {
          await db
            .update(organizations)
            .set({
              status: "active",
              financeOrganizationId: financeOrganizationIdFromResult,
              updatedAt: new Date(),
            })
            .where(eq(organizations.id, existingPrimary[0]!.id));
        }
      }
    }

    const provisionJobPayload =
      currentJob.payload && typeof currentJob.payload === "object"
        ? (currentJob.payload as Record<string, unknown>)
        : {};
    const organizationIdRaw = provisionJobPayload.organizationId;
    const organizationIdForRow =
      typeof organizationIdRaw === "string" && z.string().uuid().safeParse(organizationIdRaw).success
        ? organizationIdRaw
        : null;
    if (organizationIdForRow) {
      await db
        .update(organizations)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(organizations.id, organizationIdForRow));
    }

    if (currentJob?.type === "tenant.provision" && targetTenantId) {
      void (async () => {
        try {
          const [tenant] = await db
            .select({
              name: tenants.name,
              adminEmail: tenants.adminEmail,
              organizationNumber: tenants.organizationNumber,
              slug: tenants.slug,
              modules: tenants.modules,
              ownerId: tenants.ownerId,
              planSlug: tenants.planSlug,
            })
            .from(tenants)
            .where(eq(tenants.id, targetTenantId))
            .limit(1);
          if (!tenant) return;

          const activeLicense = await getActiveLicenseForTenant(db, targetTenantId);
          if (activeLicense?.id) {
            void sendLicenseActivatedEmailForTenant(db, targetTenantId, {
              licenseId: activeLicense.id,
            }).catch((licenseMailErr) => {
              logger.error("provision license activated email failed (non-fatal)", licenseMailErr);
            });
          }

          if (tenant.adminEmail) {
            const baseUrlFromResult =
              completeResult && typeof completeResult.baseUrl === "string"
                ? completeResult.baseUrl
                : null;
            const root = rootDomainForOrganizationSubdomain();
            const financeUrl =
              baseUrlFromResult ??
              (root && tenant.slug
                ? `${apiConfig.publicBaseUrlScheme}://${tenant.slug}.${root}`
                : apiConfig.dashboardUrl);
            const provisionModules = parseTenantModules(tenant.modules);

            let mailResult;
            if (oneTimeAdminPassword && provisionModules.includes("accounting")) {
              const { sendFinanceWelcomeEmail } = await import("../mail/send.js");
              mailResult = await sendFinanceWelcomeEmail({
                to: tenant.adminEmail,
                tenantName: tenant.name,
                financeUrl,
                adminEmail: tenant.adminEmail,
                oneTimePassword: oneTimeAdminPassword,
                modules: provisionModules,
                tenantId: targetTenantId,
              });
            } else {
              mailResult = await sendTenantWelcomeEmail({
                to: tenant.adminEmail,
                tenantName: tenant.name,
                organizationNumber:
                  tenant.organizationNumber ??
                  financeOrganizationIdFromResult ??
                  "—",
                loginUrl: financeUrl,
                tenantId: targetTenantId,
              });
            }

            if (!mailSendSucceeded(mailResult)) {
              const mailDetail =
                mailResult.status === "failed"
                  ? mailResult.error
                  : mailResult.status;
              logger.error("provision welcome email not sent", undefined, {
                tenantId: targetTenantId,
                mailDetail,
              });
              if (tenant.ownerId) {
                safeCreateNotification(db, {
                  ownerId: tenant.ownerId,
                  type: "provision.partial",
                  severity: "warning",
                  title: "Welcome email not sent",
                  body: `Tenant ${tenant.name} is ready but the welcome email could not be delivered (${mailDetail}). Check MAIL_* configuration.`,
                  tenantId: targetTenantId,
                  actionUrl: `/tenants/${targetTenantId}`,
                  actionLabel: "View tenant",
                });
              }
            }
          }

          if (tenant.ownerId) {
            const [owner] = await db
              .select({ id: owners.id, email: owners.email })
              .from(owners)
              .where(eq(owners.id, tenant.ownerId))
              .limit(1);
            if (owner?.email) {
              void sendProvisionCompleteOwnerEmail({
                to: owner.email,
                ownerId: owner.id,
                tenantId: targetTenantId,
                tenantName: tenant.name,
                tenantSlug: tenant.slug,
                adminEmail: tenant.adminEmail ?? "—",
                planSlug: tenant.planSlug ?? "starter",
                modules: parseTenantModules(tenant.modules),
              }).catch((ownerMailErr) => {
                logger.error("provision owner notify email failed (non-fatal)", ownerMailErr);
              });
            }
          }
        } catch (welcomeErr) {
          logger.error("provision welcome email failed (non-fatal)", welcomeErr);
        }
      })();
    }
  }
  if (currentJob?.type === "organization.provision") {
    const orgPayload =
      currentJob.payload && typeof currentJob.payload === "object"
        ? (currentJob.payload as Record<string, unknown>)
        : {};
    const organizationIdRaw = orgPayload.organizationId;
    const organizationIdForRow =
      typeof organizationIdRaw === "string" && z.string().uuid().safeParse(organizationIdRaw).success
        ? organizationIdRaw
        : null;
    if (organizationIdForRow) {
      await db
        .update(organizations)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(organizations.id, organizationIdForRow));
    }
  }
  if (
    currentJob?.type === "tenant.lifecycle"
    && currentJob.tenantId
    && typeof (currentJob.payload as { status?: unknown }).status === "string"
  ) {
    const nextStatus = (currentJob.payload as { status: string }).status;
    await db.update(tenants).set({ status: nextStatus }).where(eq(tenants.id, currentJob.tenantId));
    await db
      .update(tenantDeployments)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(tenantDeployments.tenantId, currentJob.tenantId));

    const orgLifecycleStatus =
      nextStatus === "active"
        ? ("active" as const)
        : nextStatus === "suspended" || nextStatus === "stopped"
          ? ("suspended" as const)
          : null;
    if (orgLifecycleStatus) {
      const [childTenantRow] = await db
        .select({ slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, currentJob.tenantId))
        .limit(1);
      if (childTenantRow?.slug) {
        await db
          .update(organizations)
          .set({ status: orgLifecycleStatus, updatedAt: new Date() })
          .where(eq(organizations.slug, childTenantRow.slug));
      }
    }
  }
  if (currentJob?.type === "add_module" && currentJob.tenantId) {
    if (currentJob.correlationId && posDefaultCredentials) {
      provisionPosCredentialsCache.set(currentJob.correlationId, {
        credentials: posDefaultCredentials,
        expiresAt: Date.now() + PROVISION_PASSWORD_TTL_MS,
      });
      await appendProvisionEventSafe(db, {
        correlationId: currentJob.correlationId,
        phase: "secret",
        level: "info",
        message: "POS bootstrap PIN credentials persisted (add module)",
        tenantId: currentJob.tenantId,
        meta: {
          type: "pos_bootstrap_pins",
          cipher: encryptProvisionSecret(JSON.stringify(posDefaultCredentials)),
          posOrganizationId:
            completeResult && typeof completeResult.posOrganizationId === "string"
              ? completeResult.posOrganizationId
              : undefined,
        },
      });
    }
    const tenantStatusFromResult =
      completeResult && typeof completeResult.tenantStatus === "string"
        ? completeResult.tenantStatus
        : null;
    const posStatusFromResult =
      completeResult && typeof completeResult.posStatus === "string"
        ? completeResult.posStatus
        : null;
    const posErrorFromResult =
      completeResult && typeof completeResult.posError === "string"
        ? completeResult.posError
        : null;
    const finalTenantStatus =
      tenantStatusFromResult === "partial" || tenantStatusFromResult === "active"
        ? tenantStatusFromResult
        : posStatusFromResult === "failed"
          ? "partial"
          : "active";
    await db
      .update(tenants)
      .set({ status: finalTenantStatus })
      .where(eq(tenants.id, currentJob.tenantId));
    if (posOrganizationIdFromResult || posUrlFromResult || posErrorFromResult) {
      await db
        .update(tenantDeployments)
        .set({
          ...(posOrganizationIdFromResult
            ? { posOrganizationId: posOrganizationIdFromResult }
            : {}),
          ...(posUrlFromResult ? { posUrl: posUrlFromResult } : {}),
          lastError: finalTenantStatus === "partial" ? (posErrorFromResult ?? null) : null,
          updatedAt: new Date(),
        })
        .where(eq(tenantDeployments.tenantId, currentJob.tenantId));
    }
    if (currentJob.correlationId) {
      await appendProvisionEventSafe(db, {
        correlationId: currentJob.correlationId,
        phase: "add_module.completed",
        level: "info",
        message: "Add-module worker job completed",
        tenantId: currentJob.tenantId,
        meta: { jobId: currentJob.id },
      });
    }
    const moduleFromPayload =
      currentJob.payload &&
      typeof currentJob.payload === "object" &&
      "module" in currentJob.payload &&
      typeof (currentJob.payload as { module?: unknown }).module === "string"
        ? String((currentJob.payload as { module: string }).module)
        : null;
    if (moduleFromPayload) {
      if (finalTenantStatus === "partial") {
        notifyProvisionOutcome(db, {
          tenantId: currentJob.tenantId,
          finalStatus: "partial",
          correlationId: currentJob.correlationId,
        });
      } else {
        notifyModuleAdded(db, {
          tenantId: currentJob.tenantId,
          module: moduleFromPayload,
          correlationId: currentJob.correlationId,
        });
      }
    }
  }
  if (currentJob?.type === "tenant.deprovision" && currentJob.tenantId) {
    const correlations = await db
      .select({ correlationId: tenantLifecycleJobs.correlationId })
      .from(tenantLifecycleJobs)
      .where(eq(tenantLifecycleJobs.tenantId, currentJob.tenantId));
    purgeProvisionCaches(
      correlations
        .map((row) => row.correlationId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );
    await db.delete(tenantLifecycleJobs).where(eq(tenantLifecycleJobs.tenantId, currentJob.tenantId));
  }
  return c.json({ ok: true, job: updated ?? null });
});

app.post("/internal/jobs/:jobId/fail", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const jobId = c.req.param("jobId");
  const body = await c.req.json().catch(() => ({}));
  const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
  const claimToken = String((body as { claimToken?: unknown }).claimToken ?? "").trim();
  const errorMessage = String((body as { error?: unknown }).error ?? "job_failed").slice(0, 4000);
  const noRetry = (body as { noRetry?: unknown }).noRetry === true;
  const cancelled = (body as { cancelled?: unknown }).cancelled === true;
  const requestId = c.get("requestId");
  const [updated] = await db.transaction(async (tx) => {
    const [job] = await tx
      .select({
        id: tenantLifecycleJobs.id,
        status: tenantLifecycleJobs.status,
        attempts: tenantLifecycleJobs.attempts,
        maxAttempts: tenantLifecycleJobs.maxAttempts,
        claimedBy: tenantLifecycleJobs.claimedBy,
        claimToken: tenantLifecycleJobs.claimToken,
      })
      .from(tenantLifecycleJobs)
      .where(eq(tenantLifecycleJobs.id, jobId))
      .limit(1);
    if (!job) return [];
    if (workerId && job.claimedBy && job.claimedBy !== workerId) {
      return [];
    }
    if (claimToken && job.claimToken && job.claimToken !== claimToken) {
      return [];
    }
    const nextAttempts = (job.attempts ?? 0) + 1;
    const maxAttempts = job.maxAttempts ?? 5;
    const exhausted = cancelled || noRetry || nextAttempts >= maxAttempts;
    const retryDelayMs = Math.min(60_000, 2 ** Math.max(0, nextAttempts - 1) * 1000);
    const terminalStatus = cancelled ? "cancelled" : exhausted ? "dead" : "pending";
    const [next] = await tx
      .update(tenantLifecycleJobs)
      .set({
        status: terminalStatus,
        attempts: nextAttempts,
        lastError: sql`${errorMessage}`,
        runAt: exhausted ? new Date() : new Date(Date.now() + retryDelayMs),
        claimedAt: null,
        claimedBy: null,
        claimToken: null,
        cancelRequestedAt: null,
        completedAt: exhausted ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantLifecycleJobs.id, jobId),
          eq(tenantLifecycleJobs.status, "running"),
          ...(claimToken ? [eq(tenantLifecycleJobs.claimToken, claimToken)] : []),
        ),
      )
      .returning();
    return next ? [next] : [];
  });
  if (updated) {
    const attempts = Number(updated.attempts ?? 0);
    const maxAttempts = Number(updated.maxAttempts ?? 0);
    const exhausted = updated.status === "dead" || updated.status === "cancelled";
    await emitMetric(
      updated.status === "cancelled"
        ? "worker.job.cancelled"
        : exhausted
          ? "worker.job.dead"
          : "worker.job.retry",
      1,
      {
        requestId,
        jobId: updated.id,
        jobType: updated.type,
        attempts,
        maxAttempts,
        noRetry: noRetry ? 1 : 0,
      },
    );
    emitInternalJobAudit(c, updated.status === "cancelled" ? "job.cancelled" : exhausted ? "job.dead" : "job.retry_scheduled", {
      jobId: updated.id,
      status: updated.status,
      attempts,
      maxAttempts,
      noRetry,
      workerId: workerId || null,
    });

    if (exhausted) {
      const outcome = await handleTerminalProvisionJobFailure(db, updated, errorMessage);

      if (outcome === "tenant_failed" && updated.tenantId) {
        notifyProvisionOutcome(db, {
          tenantId: updated.tenantId,
          finalStatus: "failed",
          correlationId: updated.correlationId,
          lastError: errorMessage,
        });
      } else if (outcome === "add_module_reverted" && updated.tenantId) {
        const moduleFromPayload =
          updated.payload
          && typeof updated.payload === "object"
          && "module" in updated.payload
          && typeof (updated.payload as { module?: unknown }).module === "string"
            ? String((updated.payload as { module: string }).module)
            : null;
        notifyAddModuleFailed(db, {
          tenantId: updated.tenantId,
          module: moduleFromPayload,
          lastError: errorMessage,
          correlationId: updated.correlationId,
        });
      }
    }
  }
  return c.json({ ok: true, job: updated ?? null });
});

app.get("/internal/jobs/dead", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const rows = await db
    .select()
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.status, "dead"))
    .orderBy(asc(tenantLifecycleJobs.updatedAt))
    .limit(100);
  emitInternalJobAudit(c, "job.dead_list_viewed", { count: rows.length });
  return c.json({ jobs: rows });
});

app.post("/internal/jobs/:jobId/requeue", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const jobId = c.req.param("jobId");
  const [updated] = await db
    .update(tenantLifecycleJobs)
    .set({
      status: "pending",
      lastError: null,
      runAt: new Date(),
      claimedAt: null,
      claimedBy: null,
      updatedAt: new Date(),
    })
    .where(and(eq(tenantLifecycleJobs.id, jobId), eq(tenantLifecycleJobs.status, "dead")))
    .returning();
  if (!updated) return c.json({ error: "dead_job_not_found" }, 404);
  await emitMetric("worker.job.requeue", 1, {
    requestId: c.get("requestId"),
    jobId: updated.id,
    jobType: updated.type,
  });
  emitInternalJobAudit(c, "job.requeue", {
    jobId: updated.id,
    jobType: updated.type,
    previousStatus: "dead",
    nextStatus: "pending",
  });
  return c.json({ ok: true, job: updated });
});

}
