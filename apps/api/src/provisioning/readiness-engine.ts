import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execa } from "execa";
import { apiConfig } from "@repo/config";
import { parseTenantModules } from "../services/auth/stockix-product-token.js";
import type { createDb } from "@repo/db";
import {
  tenantDeployments,
  tenantLifecycleJobs,
  tenantProvisionEvents,
  tenants,
} from "@repo/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";

export type TenantReadinessStatus = "NOT_READY" | "READY" | "DEGRADED";

export type TenantReadiness = {
  status: TenantReadinessStatus;
  checks: {
    jobCompleted: boolean;
    tenantExists: boolean;
    deploymentValid: boolean;
    tenantResponding: boolean;
    authReady: boolean;
    routeActive: boolean;
    financeTenantLinked: boolean;
    financeLicenseSynced: boolean;
  };
  reasons: string[];
};

type Db = ReturnType<typeof createDb>;
const READINESS_CACHE_TTL_MS = 2_000;
const readinessCache = new Map<string, { expiresAt: number; value: TenantReadiness }>();

export function invalidateTenantReadinessCache(correlationId?: string): void {
  if (!correlationId) {
    readinessCache.clear();
    return;
  }
  readinessCache.delete(correlationId);
}

async function resolveServerPingUrl(composeProjectName: string): Promise<string | null> {
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "-p",
      composeProjectName,
      "port",
      "server",
      "3000",
    ]);
    const trimmed = stdout.trim();
    const match = trimmed.match(/:(\d+)\s*$/);
    if (!match?.[1]) return null;
    return `http://127.0.0.1:${match[1]}/api/ping/`;
  } catch {
    return null;
  }
}

function hasBootstrapAdminEvent(
  events: Array<{ phase: string; meta: Record<string, unknown> | null; message: string }>,
): boolean {
  for (const e of events) {
    if (e.phase === "journal" && e.meta && e.meta.operationKey === "tenant.bootstrap_admin") {
      return true;
    }
    if (e.message.toLowerCase().includes("bootstrap admin")) {
      return true;
    }
  }
  return false;
}

async function isRouteActive(slug: string | null): Promise<boolean> {
  if (!slug) return false;
  const file = `${apiConfig.traefikDynamicDir}/tenant-${slug}.yml`;
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function getTenantReadiness(
  db: Db,
  correlationId: string,
): Promise<TenantReadiness> {
  const cached = readinessCache.get(correlationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const [job] = await db
      .select({
        id: tenantLifecycleJobs.id,
        status: tenantLifecycleJobs.status,
        type: tenantLifecycleJobs.type,
        completedAt: tenantLifecycleJobs.completedAt,
        payload: tenantLifecycleJobs.payload,
      })
      .from(tenantLifecycleJobs)
      .where(eq(tenantLifecycleJobs.correlationId, correlationId))
      .orderBy(desc(tenantLifecycleJobs.createdAt))
      .limit(1);

    const jobCompleted = Boolean(job && job.type === "tenant.provision" && job.status === "completed");
    const slugFromPayload =
      job?.payload && typeof job.payload.slug === "string" ? String(job.payload.slug) : null;

    const tenant = slugFromPayload
      ? (await db
          .select({
            id: tenants.id,
            slug: tenants.slug,
            tenantStatus: tenants.status,
            deploymentStatus: tenantDeployments.status,
            composeProjectName: tenantDeployments.composeProjectName,
            internalPort: tenantDeployments.internalPort,
            deploymentLastError: tenantDeployments.lastError,
            financeTenantId: tenantDeployments.financeTenantId,
            tenantModules: tenants.modules,
          })
          .from(tenants)
          .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
          .where(eq(tenants.slug, slugFromPayload))
          .limit(1))[0]
      : undefined;

    const events = await db
      .select({
        phase: tenantProvisionEvents.phase,
        meta: tenantProvisionEvents.meta,
        message: tenantProvisionEvents.message,
      })
      .from(tenantProvisionEvents)
      .where(eq(tenantProvisionEvents.correlationId, correlationId))
      .orderBy(asc(tenantProvisionEvents.createdAt))
      .limit(2000);

    const tenantExists = Boolean(tenant?.id);
    const deploymentValid = Boolean(
      tenantExists &&
        tenant?.composeProjectName &&
        typeof tenant.internalPort === "number" &&
        tenant.internalPort > 0 &&
        tenant.deploymentStatus !== "failed",
    );
    const routeActive = await isRouteActive(tenant?.slug ?? slugFromPayload);
    const authReady = hasBootstrapAdminEvent(events);

    let tenantResponding = false;
    if (jobCompleted && tenantExists && deploymentValid && tenant?.composeProjectName) {
      const pingUrl = await resolveServerPingUrl(tenant.composeProjectName);
      if (pingUrl) {
        try {
          const response = await fetch(pingUrl, { signal: AbortSignal.timeout(5000) });
          tenantResponding = response.ok;
        } catch {
          tenantResponding = false;
        }
      }
    }

    const needsFinanceLink = parseTenantModules(
      typeof tenant?.tenantModules === "string" ? tenant.tenantModules : null,
    ).includes("accounting");
    const financeTenantLinked =
      !needsFinanceLink
      || (tenant?.financeTenantId != null && Number(tenant.financeTenantId) > 0);

    const financeLicenseSynced =
      !needsFinanceLink
      || events.some(
        (e) =>
          e.message.includes("[finance-license] Synced")
          || e.message.includes("finance license synced"),
      );

    const checks = {
      jobCompleted,
      tenantExists,
      deploymentValid,
      tenantResponding,
      authReady,
      routeActive,
      financeTenantLinked,
      financeLicenseSynced,
    };

    const reasons: string[] = [];
    if (!checks.jobCompleted) reasons.push("job_not_completed");
    if (!checks.tenantExists) reasons.push("tenant_missing");
    if (!checks.deploymentValid) reasons.push("deployment_invalid");
    if (!checks.routeActive) reasons.push("traefik_route_pending");
    if (!checks.authReady) reasons.push("bootstrap_admin_not_confirmed");
    if (!checks.tenantResponding) reasons.push("tenant_ping_unreachable");
    if (!checks.financeTenantLinked) reasons.push("finance_tenant_id_missing");
    if (!checks.financeLicenseSynced) reasons.push("finance_license_sync_missing");
    if (tenant?.deploymentLastError) reasons.push(`deployment_error:${tenant.deploymentLastError}`);
    if (tenant?.tenantStatus === "failed") reasons.push("tenant_status_failed");
    if (tenant?.tenantStatus === "partial") reasons.push("tenant_status_partial");

    const allGreen = Object.values(checks).every(Boolean);
    const status: TenantReadinessStatus = allGreen
      ? "READY"
      : checks.jobCompleted && (checks.tenantExists || checks.deploymentValid)
        ? "DEGRADED"
        : "NOT_READY";

    const value = { status, checks, reasons };
    readinessCache.set(correlationId, {
      expiresAt: Date.now() + READINESS_CACHE_TTL_MS,
      value,
    });
    return value;
  } catch (error) {
    const value: TenantReadiness = {
      status: "NOT_READY",
      checks: {
        jobCompleted: false,
        tenantExists: false,
        deploymentValid: false,
        routeActive: false,
        authReady: false,
        tenantResponding: false,
        financeTenantLinked: false,
        financeLicenseSynced: false,
      },
      reasons: [
        "readiness_evaluation_error",
        error instanceof Error ? error.message : String(error),
      ],
    };
    readinessCache.set(correlationId, {
      expiresAt: Date.now() + READINESS_CACHE_TTL_MS,
      value,
    });
    return value;
  }
}
