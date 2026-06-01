import { apiConfig } from "@repo/config";
import { execa } from "execa";
import { parseTenantModules, type StockixModule } from "../services/auth/stockix-product-token.js";
import { resolvePosBackendHealthUrl } from "../pos-public-url.js";
import type { createDb } from "@repo/db";
import {
  tenantDeployments,
  tenantLifecycleJobs,
  tenantProvisionEvents,
  tenants,
} from "@repo/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";

export type TenantReadinessStatus = "NOT_READY" | "READY" | "DEGRADED" | "FAILED";

export type TenantReadiness = {
  status: TenantReadinessStatus;
  reason?: string;
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
  // The API container is in stockix_internal. Use the tenant server container's
  // IP in that network for direct reachability (host-published ports are blocked
  // by Docker isolation between bridge networks on Linux).
  const workerNetwork = apiConfig.workerInternalNetwork;
  const containerName = `${composeProjectName}-server-1`;
  try {
    const { stdout } = await execa("docker", [
      "inspect",
      "--format",
      `{{(index .NetworkSettings.Networks "${workerNetwork}").IPAddress}}`,
      containerName,
    ]);
    const ip = stdout.trim();
    if (ip && ip !== "<no value>" && ip !== "") {
      return `http://${ip}:3000/api/ping`;
    }
  } catch {
    // fall through
  }
  return null;
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

function isRouteActiveFromEvents(
  slug: string | null,
  events: Array<{ phase: string; meta: Record<string, unknown> | null; message: string }>,
): boolean {
  if (!slug) return false;
  return events.some(
    (e) =>
      e.phase === "journal" &&
      e.meta != null &&
      e.meta.operationKey === "edge.publish" &&
      e.meta.slug === slug,
  );
}

export function hasPosStackCompletedEvent(
  events: Array<{ phase: string; meta: Record<string, unknown> | null; message: string }>,
): boolean {
  return events.some(
    (e) =>
      e.phase === "pos.stack.completed"
      || (e.phase === "journal" && e.meta?.operationKey === "pos.stack"),
  );
}

export function evaluateModuleGatedReadinessChecks(input: {
  modules: StockixModule[];
  jobCompleted: boolean;
  tenantExists: boolean;
  deploymentValid: boolean;
  financeRouteActive: boolean;
  financeAuthReady: boolean;
  financeResponding: boolean;
  financeTenantLinked: boolean;
  financeLicenseSynced: boolean;
  posStackReady: boolean;
  posResponding: boolean;
  posOrganizationLinked: boolean;
}): {
  authReady: boolean;
  routeActive: boolean;
  tenantResponding: boolean;
  financeTenantLinked: boolean;
  financeLicenseSynced: boolean;
} {
  const needsAccounting = input.modules.includes("accounting");
  const needsPos = input.modules.includes("pos");

  return {
    authReady: needsAccounting
      ? input.financeAuthReady
      : needsPos
        ? input.posStackReady
        : true,
    routeActive: needsAccounting
      ? input.financeRouteActive
      : needsPos
        ? input.posOrganizationLinked || input.posStackReady
        : true,
    tenantResponding: needsAccounting
      ? input.financeResponding
      : needsPos
        ? input.posResponding
        : true,
    financeTenantLinked: needsAccounting ? input.financeTenantLinked : true,
    financeLicenseSynced: needsAccounting ? input.financeLicenseSynced : true,
  };
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

    const jobCompleted = Boolean(
      job
        && (job.type === "tenant.provision" || job.type === "add_module")
        && job.status === "completed",
    );
    const slugFromPayload =
      job?.payload && typeof job.payload.slug === "string" ? String(job.payload.slug) : null;
    const tenantIdFromPayload =
      job?.payload && typeof job.payload.tenantId === "string"
        ? String(job.payload.tenantId)
        : job?.payload && typeof (job.payload as { tenantId?: unknown }).tenantId === "string"
          ? String((job.payload as { tenantId: string }).tenantId)
          : null;

    const tenantBySlug = slugFromPayload
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
            posOrganizationId: tenantDeployments.posOrganizationId,
            tenantModules: tenants.modules,
          })
          .from(tenants)
          .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
          .where(eq(tenants.slug, slugFromPayload))
          .limit(1))[0]
      : undefined;

    const tenantById =
      !tenantBySlug && tenantIdFromPayload
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
              posOrganizationId: tenantDeployments.posOrganizationId,
              tenantModules: tenants.modules,
            })
            .from(tenants)
            .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
            .where(eq(tenants.id, tenantIdFromPayload))
            .limit(1))[0]
        : undefined;

    const tenant = tenantBySlug ?? tenantById;

    if (tenant?.tenantStatus === "failed") {
      const value: TenantReadiness = {
        status: "FAILED",
        reason: tenant.deploymentLastError ?? "provision_failed",
        checks: {
          jobCompleted: false,
          tenantExists: true,
          deploymentValid: false,
          tenantResponding: false,
          authReady: false,
          routeActive: false,
          financeTenantLinked: false,
          financeLicenseSynced: false,
        },
        reasons: ["tenant_status_failed"],
      };
      readinessCache.set(correlationId, {
        expiresAt: Date.now() + READINESS_CACHE_TTL_MS,
        value,
      });
      return value;
    }

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

    const modules = parseTenantModules(
      typeof tenant?.tenantModules === "string" ? tenant.tenantModules : null,
    );
    const needsAccounting = modules.includes("accounting");
    const needsPos = modules.includes("pos");

    const tenantExists = Boolean(tenant?.id);
    const deploymentValid = needsAccounting
      ? Boolean(
          tenantExists &&
            tenant?.composeProjectName &&
            typeof tenant.internalPort === "number" &&
            tenant.internalPort > 0 &&
            tenant.deploymentStatus !== "failed",
        )
      : needsPos
        ? Boolean(
            tenantExists &&
              tenant?.posOrganizationId?.trim() &&
              tenant.deploymentStatus !== "failed",
          )
        : Boolean(tenantExists && tenant?.deploymentStatus !== "failed");

    const financeRouteActive = isRouteActiveFromEvents(tenant?.slug ?? slugFromPayload, events);
    const financeAuthReady = hasBootstrapAdminEvent(events);
    const posStackReady = hasPosStackCompletedEvent(events);
    const posOrganizationLinked = Boolean(tenant?.posOrganizationId?.trim());

    let financeResponding = false;
    if (
      jobCompleted &&
      tenantExists &&
      needsAccounting &&
      tenant?.composeProjectName &&
      deploymentValid
    ) {
      const pingUrl = await resolveServerPingUrl(tenant.composeProjectName);
      if (pingUrl) {
        try {
          const response = await fetch(pingUrl, { signal: AbortSignal.timeout(5000) });
          financeResponding = response.ok;
        } catch {
          financeResponding = false;
        }
      }
    }

    let posResponding = false;
    if (jobCompleted && tenantExists && needsPos && tenant?.slug) {
      const healthUrl = await resolvePosBackendHealthUrl(tenant.slug);
      if (healthUrl) {
        try {
          const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
          posResponding = response.ok;
        } catch {
          posResponding = false;
        }
      }
    }

    const financeTenantLinked =
      tenant?.financeTenantId != null && Number(tenant.financeTenantId) > 0;
    const financeLicenseSynced = events.some((e) => {
      const m = e.message.toLowerCase();
      return m.includes("[finance-license] synced") || m.includes("finance license synced");
    });

    const moduleChecks = evaluateModuleGatedReadinessChecks({
      modules,
      jobCompleted,
      tenantExists,
      deploymentValid,
      financeRouteActive,
      financeAuthReady,
      financeResponding,
      financeTenantLinked,
      financeLicenseSynced,
      posStackReady,
      posResponding,
      posOrganizationLinked,
    });

    const checks = {
      jobCompleted,
      tenantExists,
      deploymentValid,
      tenantResponding: moduleChecks.tenantResponding,
      authReady: moduleChecks.authReady,
      routeActive: moduleChecks.routeActive,
      financeTenantLinked: moduleChecks.financeTenantLinked,
      financeLicenseSynced: moduleChecks.financeLicenseSynced,
    };

    const reasons: string[] = [];
    if (!checks.jobCompleted) reasons.push("job_not_completed");
    if (!checks.tenantExists) reasons.push("tenant_missing");
    if (!checks.deploymentValid) reasons.push("deployment_invalid");
    if (!checks.routeActive) {
      reasons.push(needsAccounting ? "traefik_route_pending" : "pos_route_pending");
    }
    if (!checks.authReady) {
      reasons.push(needsAccounting ? "bootstrap_admin_not_confirmed" : "pos_stack_not_completed");
    }
    if (!checks.tenantResponding) {
      reasons.push(needsAccounting ? "tenant_ping_unreachable" : "pos_health_unreachable");
    }
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
