import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { apiConfig } from "@repo/config";
import { parseTenantModules } from "./services/auth/stockix-product-token.js";
import {
  safeCreateNotification,
  type NotificationType,
} from "./notification-service.js";

type Db = PostgresJsDatabase<typeof schema>;

function tenantDetailPath(tenantId: string): string {
  return `/tenants/${tenantId}`;
}

function licenseDetailPath(licenseId: string): string {
  return `/licenses/${licenseId}`;
}

function formatModulesList(modulesJson: string | null | undefined): string {
  const modules = parseTenantModules(modulesJson);
  if (modules.length === 0) return "accounting";
  return modules.join(", ");
}

async function loadTenantContext(db: Db, tenantId: string) {
  const [row] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      ownerId: tenants.ownerId,
      adminEmail: tenants.adminEmail,
      modules: tenants.modules,
      internalPort: tenantDeployments.internalPort,
      posUrl: tenantDeployments.posUrl,
      lastError: tenantDeployments.lastError,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row ?? null;
}

function financePublicUrl(slug: string, internalPort: number | null): string | null {
  const root = apiConfig.rootDomain?.trim() || "localhost";
  const scheme = (apiConfig.publicBaseUrlScheme ?? "http").replace(/:+$/, "");
  if (root === "localhost" && internalPort != null && Number.isFinite(internalPort)) {
    return `${scheme}://${slug}.${root}:${internalPort}`;
  }
  if (root !== "localhost") {
    return `${scheme}://${slug}.${root}`;
  }
  return null;
}

export function notifyProvisionOutcome(
  db: Db,
  opts: {
    tenantId: string;
    finalStatus: "active" | "partial" | "failed";
    correlationId?: string | null;
    lastError?: string | null;
  },
): void {
  void (async () => {
    const tenant = await loadTenantContext(db, opts.tenantId);
    if (!tenant) return;

    const financeUrl = financePublicUrl(tenant.slug, tenant.internalPort);
    const posUrl = tenant.posUrl?.trim() || null;

    const base = {
      ownerId: tenant.ownerId,
      tenantId: tenant.id,
      correlationId: opts.correlationId ?? undefined,
      actionUrl: tenantDetailPath(tenant.id),
    };

    const modulesLabel = formatModulesList(tenant.modules);

    if (opts.finalStatus === "active") {
      safeCreateNotification(db, {
        ...base,
        type: "provision.complete",
        severity: "success",
        title: `${tenant.name} is ready`,
        body: `Tenant provisioned successfully with ${modulesLabel}. Bootstrap credentials are available in the tenant detail page${tenant.adminEmail ? ` (admin: ${tenant.adminEmail})` : ""}.`,
        actionLabel: "View tenant",
        meta: {
          financeUrl,
          posUrl,
          modules: parseTenantModules(tenant.modules),
          adminEmail: tenant.adminEmail,
        },
      });
      return;
    }

    if (opts.finalStatus === "partial") {
      const errDetail = tenant.lastError ?? opts.lastError ?? "unknown error";
      safeCreateNotification(db, {
        ...base,
        type: "provision.partial",
        severity: "warning",
        title: `${tenant.name} — POS setup incomplete`,
        body: `Finance is active and ready. POS provisioning failed: ${errDetail}. Retry from the tenant detail page.`,
        actionLabel: "Retry POS setup",
        meta: { financeUrl, posUrl, lastError: errDetail },
      });
      return;
    }

    const failDetail =
      opts.lastError ?? tenant.lastError ?? "Check the provision log for details.";
    safeCreateNotification(db, {
      ...base,
      type: "provision.failed",
      severity: "error",
      title: `${tenant.name} provisioning failed`,
      body: `Provisioning could not complete. ${failDetail}`,
      actionLabel: "View details & retry",
      meta: { lastError: failDetail },
    });
  })().catch((err) => {
    console.error(
      "[notification] provision outcome failed:",
      err instanceof Error ? err.message : String(err),
    );
  });
}

export function notifyJobLifecycle(
  db: Db,
  opts: {
    ownerId: string;
    tenantId: string;
    tenantName: string;
    type: Extract<NotificationType, "job.stuck" | "job.dead">;
    lastError?: string | null;
    correlationId?: string | null;
  },
): void {
  const severity = opts.type === "job.dead" ? "error" : "warning";
  safeCreateNotification(db, {
    ownerId: opts.ownerId,
    type: opts.type,
    severity,
    title:
      opts.type === "job.dead"
        ? `Provisioning job failed for ${opts.tenantName}`
        : `Provisioning job may be stuck for ${opts.tenantName}`,
    body:
      opts.lastError ??
      (opts.type === "job.dead"
        ? "The worker marked this job as dead after repeated failures."
        : "No worker heartbeat for 5 minutes. The job was reclaimed for retry."),
    tenantId: opts.tenantId,
    correlationId: opts.correlationId ?? undefined,
    actionUrl: tenantDetailPath(opts.tenantId),
    actionLabel: "View tenant",
  });
}

export function notifyModuleAdded(
  db: Db,
  opts: { tenantId: string; module: string; correlationId?: string | null },
): void {
  void (async () => {
    const tenant = await loadTenantContext(db, opts.tenantId);
    if (!tenant) return;
    safeCreateNotification(db, {
      ownerId: tenant.ownerId,
      type: "provision.module_added",
      severity: "success",
      title: `Module added to ${tenant.name}`,
      body: `Module "${opts.module}" provisioning has completed.`,
      tenantId: tenant.id,
      correlationId: opts.correlationId ?? undefined,
      actionUrl: tenantDetailPath(tenant.id),
      actionLabel: "View tenant",
      meta: { module: opts.module },
    });
  })().catch(() => undefined);
}

export function notifyLicenseForTenant(
  db: Db,
  opts: {
    tenantId: string;
    licenseId: string;
    type: Extract<
      NotificationType,
      "license.expired" | "license.expiring" | "license.revoked" | "license.suspended"
    >;
    body: string;
    daysLeft?: number;
    milestoneDays?: number;
  },
): void {
  void (async () => {
    const [tenant] = await db
      .select({ id: tenants.id, name: tenants.name, ownerId: tenants.ownerId })
      .from(tenants)
      .where(eq(tenants.id, opts.tenantId))
      .limit(1);
    if (!tenant) return;

    const severity =
      opts.type === "license.expiring"
        ? "warning"
        : opts.type === "license.suspended"
          ? "warning"
          : "error";

    const titleByType: Record<typeof opts.type, string> = {
      "license.expired": `License expired for ${tenant.name}`,
      "license.expiring": `License expiring soon for ${tenant.name}`,
      "license.revoked": `License revoked for ${tenant.name}`,
      "license.suspended": `License suspended for ${tenant.name}`,
    };

    safeCreateNotification(db, {
      ownerId: tenant.ownerId,
      type: opts.type,
      severity,
      title: titleByType[opts.type],
      body: opts.body,
      tenantId: tenant.id,
      licenseId: opts.licenseId,
      actionUrl: licenseDetailPath(opts.licenseId),
      actionLabel:
        opts.type === "license.expiring" ? "Extend license" : "View license",
      meta:
        opts.daysLeft != null || opts.milestoneDays != null
          ? {
              ...(opts.daysLeft != null ? { daysLeft: opts.daysLeft } : {}),
              ...(opts.milestoneDays != null
                ? { milestoneDays: opts.milestoneDays }
                : {}),
            }
          : undefined,
    });
  })().catch((err) => {
    console.error(
      "[notification] license notify failed:",
      err instanceof Error ? err.message : String(err),
    );
  });
}
