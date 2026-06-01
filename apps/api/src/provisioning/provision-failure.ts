import {
  organizations,
  tenantDeployments,
  tenantLifecycleJobs,
  tenantProvisionEvents,
  tenants,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { createDb } from "@repo/db";

import { invalidateTenantReadinessCache } from "./readiness-engine.js";

type Db = ReturnType<typeof createDb>;

export type TerminalProvisionJob = {
  type: string;
  tenantId: string | null;
  correlationId: string | null;
  payload: unknown;
};

function trimError(message: string): string {
  return message.slice(0, 4000);
}

/** Initial tenant provision failed — terminal, not usable until retry or delete. */
export async function markTenantProvisionFailed(
  db: Db,
  opts: {
    tenantId: string;
    lastError: string;
    correlationId?: string | null;
  },
): Promise<void> {
  const lastError = trimError(opts.lastError);
  await db
    .update(tenants)
    .set({ status: "failed" })
    .where(eq(tenants.id, opts.tenantId));
  await db
    .update(tenantDeployments)
    .set({
      status: "failed",
      lastError,
      updatedAt: new Date(),
    })
    .where(eq(tenantDeployments.tenantId, opts.tenantId));
  invalidateTenantReadinessCache(opts.correlationId ?? undefined);
}

/**
 * Module-add job failed on an otherwise healthy tenant — restore active status,
 * keep lastError on deployment for ops visibility. Does not tear down stacks.
 */
export async function revertTenantAfterAddModuleFailure(
  db: Db,
  opts: {
    tenantId: string;
    lastError: string;
    correlationId?: string | null;
  },
): Promise<void> {
  const lastError = trimError(opts.lastError);
  await db
    .update(tenants)
    .set({ status: "active" })
    .where(eq(tenants.id, opts.tenantId));
  await db
    .update(tenantDeployments)
    .set({
      status: "active",
      lastError,
      updatedAt: new Date(),
    })
    .where(eq(tenantDeployments.tenantId, opts.tenantId));
  invalidateTenantReadinessCache(opts.correlationId ?? undefined);
}

export async function markOrganizationProvisionFailed(
  db: Db,
  opts: {
    organizationId: string;
    lastError: string;
  },
): Promise<void> {
  const provisioningError = trimError(opts.lastError);
  await db
    .update(organizations)
    .set({
      status: "failed",
      provisioningError,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, opts.organizationId));
}

export function readOrganizationIdFromJobPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const organizationId = (payload as { organizationId?: unknown }).organizationId;
  return typeof organizationId === "string" && organizationId.length > 0
    ? organizationId
    : null;
}

/** Apply tenant/org status transitions when a lifecycle job reaches a terminal failure state. */
export async function handleTerminalProvisionJobFailure(
  db: Db,
  job: TerminalProvisionJob,
  lastError: string,
): Promise<"tenant_failed" | "add_module_reverted" | "organization_failed" | "none"> {
  if (job.type === "tenant.provision" && job.tenantId) {
    await markTenantProvisionFailed(db, {
      tenantId: job.tenantId,
      lastError,
      correlationId: job.correlationId,
    });
    return "tenant_failed";
  }

  if (job.type === "add_module" && job.tenantId) {
    await revertTenantAfterAddModuleFailure(db, {
      tenantId: job.tenantId,
      lastError,
      correlationId: job.correlationId,
    });
    return "add_module_reverted";
  }

  const organizationId = readOrganizationIdFromJobPayload(job.payload);
  if (job.type === "organization.provision" && organizationId) {
    await markOrganizationProvisionFailed(db, { organizationId, lastError });
    return "organization_failed";
  }

  return "none";
}

export async function appendProvisionFailureEvent(
  db: Db,
  opts: {
    correlationId: string;
    tenantId?: string | null;
    message: string;
  },
): Promise<void> {
  await db
    .insert(tenantProvisionEvents)
    .values({
      correlationId: opts.correlationId,
      tenantId: opts.tenantId ?? null,
      phase: "api",
      level: "error",
      message: trimError(opts.message),
    })
    .catch(() => undefined);
}

export async function markLifecycleJobTerminalFailure(
  db: Db,
  opts: {
    correlationId: string;
    lastError: string;
    status?: "failed" | "dead";
  },
): Promise<void> {
  const lastError = trimError(opts.lastError);
  await db
    .update(tenantLifecycleJobs)
    .set({
      status: opts.status ?? "failed",
      lastError,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenantLifecycleJobs.correlationId, opts.correlationId))
    .catch(() => undefined);
}
