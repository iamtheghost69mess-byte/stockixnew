import { tenantDeployments, tenantLifecycleJobs, tenants } from "@repo/db/schema";
import { desc, eq } from "drizzle-orm";
import type { createDb } from "@repo/db";
import type { Context } from "hono";
import type { Hono } from "hono";
import { z } from "zod";
import * as schema from "@repo/db/schema";
import { posProxyJson } from "../pos-proxy.js";
import { effectivePosApiUrl } from "../pos-public-url.js";
import { logAudit } from "../audit.js";
import { signStockixToken } from "@repo/auth";
import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import {
  assertTenantModuleLicensed,
  respondModuleAccessDenied,
} from "../lib/tenant-module-access.js";
import { loadLatestPosBootstrapCredentials } from "../lib/provision-events.js";
import {
  type PosDefaultCredentialsPayload,
  provisionPosCredentialsCache,
} from "../lib/provision-caches.js";

type Db = ReturnType<typeof createDb>;

const stockixTenantIdParam = z.string().uuid();

const resetPinBody = z.object({
  role: z.string().min(1).max(32),
});

export type PosCredentialRole = {
  role: string;
  username: string;
  pin: string;
  masked: boolean;
};

function canRevealPosCredentials(actorRole: string): boolean {
  return actorRole === "super_admin" || actorRole === "support_agent";
}

function parsePosCredentialRoles(data: unknown): PosCredentialRole[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const payload = root.data && typeof root.data === "object" ? root.data : root;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const rolesRaw =
    record.roles ?? record.defaultCredentials ?? undefined;
  if (!Array.isArray(rolesRaw)) return [];
  return rolesRaw
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => {
      const role = String(row.role ?? "").toLowerCase().trim();
      const username = String(row.username ?? row.name ?? row.role ?? "")
        .toLowerCase()
        .trim();
      const plainPin = String(row.pin ?? "").trim();
      const pinMasked = String(row.pinMasked ?? "").trim();
      const hasPlainPin =
        plainPin.length > 0 && !plainPin.includes("*") && plainPin !== "******";
      return {
        role,
        username,
        pin: hasPlainPin ? plainPin : pinMasked || "••••••",
        masked: !hasPlainPin,
      };
    })
    .filter((row) => row.role.length > 0);
}

async function loadTenantPosOrgId(
  db: Db,
  stockixTenantId: string,
): Promise<{ tenant: { id: string; slug: string }; posOrganizationId: string } | null> {
  const [row] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      posOrganizationId: tenantDeployments.posOrganizationId,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, stockixTenantId))
    .limit(1);

  if (!row?.posOrganizationId?.trim()) {
    return null;
  }

  return {
    tenant: { id: row.id, slug: row.slug },
    posOrganizationId: row.posOrganizationId.trim(),
  };
}

async function resolveStoredPosCredentials(
  db: Db,
  tenantId: string,
): Promise<PosDefaultCredentialsPayload | null> {
  const fromEvents = await loadLatestPosBootstrapCredentials(db, tenantId);
  if (fromEvents?.allRoles?.length) return fromEvents;

  const [latestJob] = await db
    .select({ correlationId: tenantLifecycleJobs.correlationId })
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.tenantId, tenantId))
    .orderBy(desc(tenantLifecycleJobs.createdAt))
    .limit(1);
  const correlationId = latestJob?.correlationId;
  if (!correlationId) return null;
  const cached = provisionPosCredentialsCache.get(correlationId);
  if (!cached || Date.now() > cached.expiresAt) return null;
  return cached.credentials;
}

export function registerPosCredentialsRoutes(
  app: Hono<ControlPlaneAuthEnv>,
  db: Db | null,
): void {
  app.get("/tenants/:tenantId/pos-credentials", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const actorRole = String(c.get("actorRole") ?? "");
    if (!canRevealPosCredentials(actorRole)) {
      return c.json({ error: "forbidden", message: "Insufficient role to view POS PINs" }, 403);
    }

    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    const moduleAccess = await assertTenantModuleLicensed(db, tenantParsed.data, "pos");
    if (!moduleAccess.ok) return respondModuleAccessDenied(c, moduleAccess);

    const loaded = await loadTenantPosOrgId(db, tenantParsed.data);
    if (!loaded) {
      return c.json(
        { error: "pos_org_not_linked", message: "Tenant has no POS organization id" },
        404,
      );
    }

    const posApiBase = await effectivePosApiUrl(loaded.tenant.slug);
    if (!posApiBase) {
      return c.json(
        { error: "pos_unavailable", message: "Cannot resolve tenant POS API URL" },
        503,
      );
    }

    const stored = await resolveStoredPosCredentials(db, tenantParsed.data);
    if (stored?.allRoles?.length) {
      const roles: PosCredentialRole[] = stored.allRoles.map((row) => ({
        role: String(row.role).toLowerCase().trim(),
        username: String(row.username ?? row.role).toLowerCase().trim(),
        pin: String(row.pin).trim(),
        masked: false,
      }));

      await logAudit(db, {
        actorId: (c.get("actorId") as string | undefined) ?? "",
        action: "tenant.pos_credentials_revealed",
        targetTenantId: loaded.tenant.id,
        ipAddress: c.req.header("x-forwarded-for") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
        metadata: { posOrganizationId: loaded.posOrganizationId, roleCount: roles.length, source: "provision_secret" },
      });

      return c.json({ roles, posOrganizationId: loaded.posOrganizationId });
    }

    const requestId = c.get("requestId");

    const { data, status } = await posProxyJson(
      `/organizations/${encodeURIComponent(loaded.posOrganizationId)}/credentials`,
      "GET",
      undefined,
      undefined,
      posApiBase,
      requestId,
    );

    if (status < 200 || status >= 300) {
      const message =
        data && typeof data === "object" && "message" in data
          ? String((data as { message?: unknown }).message)
          : "POS platform credentials fetch failed";
      return c.json({ error: "pos_credentials_failed", message, posStatus: status }, status as 502);
    }

    const roles = parsePosCredentialRoles(data);

    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "tenant.pos_credentials_revealed",
      targetTenantId: loaded.tenant.id,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { posOrganizationId: loaded.posOrganizationId, roleCount: roles.length },
    });

    return c.json({ roles, posOrganizationId: loaded.posOrganizationId });
  });

  app.post("/tenants/:tenantId/pos-credentials/reset-pin", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const actorRole = String(c.get("actorRole") ?? "");
    if (!canRevealPosCredentials(actorRole)) {
      return c.json({ error: "forbidden", message: "Insufficient role to reset POS PINs" }, 403);
    }

    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    const bodyParsed = resetPinBody.safeParse(await c.req.json().catch(() => ({})));
    if (!bodyParsed.success) {
      return c.json({ error: "invalid_body", details: bodyParsed.error.flatten() }, 400);
    }

    const moduleAccess = await assertTenantModuleLicensed(db, tenantParsed.data, "pos");
    if (!moduleAccess.ok) return respondModuleAccessDenied(c, moduleAccess);

    const loaded = await loadTenantPosOrgId(db, tenantParsed.data);
    if (!loaded) {
      return c.json(
        { error: "pos_org_not_linked", message: "Tenant has no POS organization id" },
        404,
      );
    }

    const posApiBase = await effectivePosApiUrl(loaded.tenant.slug);
    if (!posApiBase) {
      return c.json(
        { error: "pos_unavailable", message: "Cannot resolve tenant POS API URL" },
        503,
      );
    }

    const role = bodyParsed.data.role.toLowerCase().trim();
    const requestId = c.get("requestId");
    const { data, status } = await posProxyJson(
      `/organizations/${encodeURIComponent(loaded.posOrganizationId)}/reset-pin`,
      "POST",
      { role },
      undefined,
      posApiBase,
      requestId,
    );

    if (status < 200 || status >= 300) {
      const message =
        data && typeof data === "object" && "message" in data
          ? String((data as { message?: unknown }).message)
          : "POS PIN reset failed";
      return c.json({ error: "pos_pin_reset_failed", message, posStatus: status }, status as 502);
    }

    const roles = parsePosCredentialRoles(data);
    const resetRoleRow = roles.find((r) => r.role === role);

    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "tenant.pos_pin_reset",
      targetTenantId: loaded.tenant.id,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { posOrganizationId: loaded.posOrganizationId, role, pinReset: true },
    });

    return c.json({
      role,
      pin: resetRoleRow?.pin ?? "",
      roles,
      posOrganizationId: loaded.posOrganizationId,
    });
  });

  app.get("/tenants/:tenantId/pos-sso-token", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const actorRole = String(c.get("actorRole") ?? "");
    if (!canRevealPosCredentials(actorRole)) {
      return c.json({ error: "forbidden", message: "Insufficient role to access POS" }, 403);
    }

    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    const moduleAccess = await assertTenantModuleLicensed(db, tenantParsed.data, "pos");
    if (!moduleAccess.ok) return respondModuleAccessDenied(c, moduleAccess);

    const loaded = await loadTenantPosOrgId(db, tenantParsed.data);
    if (!loaded) {
      return c.json(
        { error: "pos_org_not_linked", message: "Tenant has no POS organization id" },
        404,
      );
    }

    const actorId = c.get("actorId") as string;
    const ssoToken = await signStockixToken(
      {
        userId: actorId,
        tenantId: tenantParsed.data,
        organizationId: loaded.posOrganizationId,
        modules: ["pos"],
        roles: ["admin"],
        planSlug: "pro", // Assume pro for now or fetch from DB
      },
      process.env.AUTH_TOKEN_SECRET || "",
      "1m" // 1 minute short-lived token
    );

    await logAudit(db, {
      actorId,
      action: "tenant.pos_sso_token_generated",
      targetTenantId: loaded.tenant.id,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { posOrganizationId: loaded.posOrganizationId },
    });

    return c.json({ ssoToken, posUrl: await effectivePosApiUrl(loaded.tenant.slug) });
  });
}
