import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { apiConfig, isMailConfigured } from "@repo/config";
import { publicConfig } from "@repo/config/public";
import type { createDb } from "@repo/db";
import {
  adminAuditLog,
  apiKeys,
  licenseActivations,
  licenses,
  organizations,
  ownerOrganizationAccess,
  owners,
  plans,
  tenantConfig,
  tenantDeployments,
  tenantLifecycleJobs,
  tenants,
  tenantProvisionEvents,
} from "@repo/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { execa } from "execa";
import { z } from "zod";
import { logAudit } from "../audit.js";
import { decryptDeploymentSecret } from "@repo/shared/deployment-secrets";
import { ROLE_RANK, type Role } from "@repo/shared/roles";
import { effectivePosUrl } from "../pos-public-url.js";
import {
  applyTenantLicenseReactivate,
  applyTenantLicenseSuspend,
} from "../tenant-license-lifecycle.js";
import { subscribeProvision } from "../provision-bus.js";
import {
  createProvisionTracer,
  rowToProvisionPayload,
  type ProvisionEventPayload,
} from "../provision-trace.js";
import { enqueueOrgProvisioning } from "../org-provision.js";
import {
  assertOrgInSupportScope,
  assertTenantInOwnerScope,
  filterOrganizationsForSupportAgent,
  getScopedTenantIdsForOwner,
  getSupportScopedOrgIdsForTenant,
} from "../org-access-scope.js";
import { canCreateOrganization, getTenantLicenseEligibility } from "../plan-limits.js";
import { insertTenantJob, listTenantJobs } from "../services/tenant-jobs.js";
import {
  parseTenantModules,
  serializeTenantModules,
} from "../services/auth/stockix-product-token.js";
import { getTenantReadiness } from "../provisioning/readiness-engine.js";
import { rootDomainForOrganizationSubdomain } from "../lib/organization-domain.js";
import {
  type PosDefaultCredentialsPayload,
  provisionPasswordCache,
  provisionPosCredentialsCache,
  PROVISION_PASSWORD_TTL_MS,
  purgeProvisionCaches,
} from "../lib/provision-caches.js";
import {
  appendProvisionEventSafe,
  decryptProvisionSecret,
  encryptProvisionSecret,
  loadProvisionEventsJson,
} from "../lib/provision-events.js";
import { isRecord, readNonEmptyString } from "../lib/record-utils.js";
import { logger } from "../lib/logger.js";
import { generateLicenseKey, getActiveLicenseForTenant } from "../license-utils.js";
import {
  readFinanceTenantIdFromProvisionEvents,
  resolveAndPersistFinanceTenantId,
} from "../finance-tenant-resolve.js";
import { syncFinanceLicenseForStockixTenant } from "../finance-license.client.js";
import { mailSendSucceeded } from "../mail/mailer.js";

type Db = ReturnType<typeof createDb>;
type DbClient = NonNullable<Db>;

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

function decryptProvisionSecretLocal(ciphertext: string): string | null {
  return decryptProvisionSecret(ciphertext);
}

export async function tenantWithinOwnerScope(
  client: DbClient,
  c: { get: (key: string) => unknown },
  tenantId: string,
): Promise<boolean> {
  const actorId = String(c.get("actorId") ?? "");
  const actorRole = String(c.get("actorRole") ?? "");
  const actorPermissions = (c.get("actorPermissions") as string[] | undefined) ?? [];
  return assertTenantInOwnerScope(client, actorId, tenantId, actorPermissions, actorRole);
}

export const organizationCreateBody = z.object({
  name: z.string().min(1).max(100),
});

export const organizationPatchBody = z
  .object({
    name: z.string().min(1).max(100).optional(),
    status: z.enum(["suspended"]).optional(),
  })
  .strip();

export const organizationAccessPostBody = z.object({
  ownerId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

/** Same derivation as `CryptoTenantSecretGenerator.bootstrapAdminPassword(tenantKey)`. */
export function bootstrapAdminPasswordFromTenantSlug(slug: string): string {
  const key = slug.trim();
  if (key.length === 0) {
    throw new Error("bootstrapAdminPassword requires non-empty tenant slug");
  }
  const secretHex = apiConfig.deploymentSecretKey;
  const hmacKey = Buffer.from(secretHex, "hex");
  return createHmac("sha256", hmacKey).update(`bootstrap:${key}`, "utf8").digest("base64url");
}

export function parseSigninAccessToken(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const accessToken =
    readNonEmptyString(body.accessToken) ??
    readNonEmptyString(body.access_token) ??
    readNonEmptyString(body.token);
  return accessToken ?? null;
}

/** Mirrors `apps/dashboard/lib/tenant-url.ts` for the browser origin of a tenant Finance stack. */
export function tenantFinanceBrowserOrigin(slug: string, internalPort: number | null): string | null {
  const scheme = publicConfig.stockixPublicScheme.replace(/:+$/, "");
  if (publicConfig.stockixRootDomain === "localhost" && internalPort != null) {
    return `${scheme}://${publicConfig.stockixLocalTenantHost}:${internalPort}`;
  }
  if (publicConfig.stockixRootDomain === "localhost") {
    return null;
  }
  return `${scheme}://${slug}.${publicConfig.stockixRootDomain}`;
}

function orgRandomSuffix4(): string {
  const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(4);
  let s = "";
  for (const b of bytes) {
    s += charset[b % charset.length]!;
  }
  return s;
}

function slugifyOrganizationName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base.length > 0 ? base : "org";
}

export async function pickUniqueOrganizationSlug(dbClient: DbClient, name: string): Promise<string> {
  const base = slugifyOrganizationName(name);
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate = `${base}-${orgRandomSuffix4()}`.slice(0, 100);
    const clash = await dbClient
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (clash.length === 0) return candidate;
  }
  throw new Error("organization_slug_exhausted");
}

/** Matches `composeProjectName` in infra/worker-service (Docker project per org stack). */
export function dockerComposeProjectForOrgSlug(slug: string): string {
  return `stockix-${slug.replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}`;
}

export async function internalPortsByComposeProject(
  db: DbClient,
  composeNames: readonly string[],
): Promise<Map<string, number>> {
  if (composeNames.length === 0) return new Map();
  const unique = [...new Set(composeNames.filter((n) => n.length > 0))];
  if (unique.length === 0) return new Map();
  const depRows = await db
    .select({
      name: tenantDeployments.composeProjectName,
      port: tenantDeployments.internalPort,
    })
    .from(tenantDeployments)
    .where(inArray(tenantDeployments.composeProjectName, unique));
  return new Map(depRows.map((r) => [r.name, r.port]));
}

export function serializeOrganizationRow(
  row: typeof organizations.$inferSelect,
  stackPublicPort?: number | null,
) {
  const root = rootDomainForOrganizationSubdomain();
  const scheme = (apiConfig.publicBaseUrlScheme ?? "http").replace(/:+$/, "");
  const publicUrl =
    root === "localhost" &&
    stackPublicPort != null &&
    Number.isFinite(stackPublicPort)
      ? `${scheme}://${row.subdomain}:${stackPublicPort}`
      : null;

  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    subdomain: row.subdomain,
    status: row.status,
    isPrimary: row.isPrimary,
    financeOrganizationId: row.financeOrganizationId ?? null,
    posOrganizationId: row.posOrganizationId ?? null,
    provisioningError: row.provisioningError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publicUrl,
  };
}


export function maskPinForDisplay(pin: string): string {
  const trimmed = pin.trim();
  if (trimmed.length <= 2) return "••••";
  return `${trimmed.slice(0, 2)}${"•".repeat(Math.min(trimmed.length - 2, 8))}`;
}

export async function loadLatestPosBootstrapCredentials(
  dbClient: DbClient,
  tenantId: string,
): Promise<PosDefaultCredentialsPayload | null> {
  const secretRows = await dbClient
    .select({ meta: tenantProvisionEvents.meta })
    .from(tenantProvisionEvents)
    .where(
      and(
        eq(tenantProvisionEvents.tenantId, tenantId),
        eq(tenantProvisionEvents.phase, "secret"),
      ),
    )
    .orderBy(desc(tenantProvisionEvents.createdAt))
    .limit(30);
  for (const secretRow of secretRows) {
    const meta = secretRow.meta;
    if (!meta || typeof meta !== "object" || meta.type !== "pos_bootstrap_pins") continue;
    const cipher = meta.cipher as string | undefined;
    if (typeof cipher !== "string") continue;
    const decrypted = decryptProvisionSecretLocal(cipher);
    if (!decrypted) continue;
    try {
      return JSON.parse(decrypted) as PosDefaultCredentialsPayload;
    } catch {
      continue;
    }
  }
  return null;
}

export async function loadLatestFinanceAdminPasswordFromEvents(
  dbClient: DbClient,
  tenantId: string,
): Promise<string | null> {
  const secretRows = await dbClient
    .select({ meta: tenantProvisionEvents.meta })
    .from(tenantProvisionEvents)
    .where(
      and(
        eq(tenantProvisionEvents.tenantId, tenantId),
        eq(tenantProvisionEvents.phase, "secret"),
      ),
    )
    .orderBy(desc(tenantProvisionEvents.createdAt))
    .limit(30);
  for (const secretRow of secretRows) {
    const meta = secretRow.meta;
    if (!meta || typeof meta !== "object" || meta.type !== "bootstrap_admin_otp") continue;
    const cipher = meta.cipher as string | undefined;
    if (typeof cipher !== "string") continue;
    const decrypted = decryptProvisionSecretLocal(cipher);
    if (decrypted) return decrypted;
  }
  return null;
}

function decryptFinanceAdminPasswordStored(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const decrypted = decryptProvisionSecretLocal(stored);
  if (decrypted) return decrypted;
  if (!stored.startsWith("enc:")) return stored;
  return null;
}

export async function resolveFinanceAdminPasswordForTenant(
  dbClient: DbClient,
  tenantId: string,
  stored: string | null | undefined,
): Promise<string | null> {
  const fromDb = decryptFinanceAdminPasswordStored(stored);
  if (fromDb) return fromDb;
  return loadLatestFinanceAdminPasswordFromEvents(dbClient, tenantId);
}

export function canViewFinanceAdminPassword(actorRole: string): boolean {
  const rank = ROLE_RANK[actorRole as Role];
  return Number.isFinite(rank) && rank >= ROLE_RANK.support_agent;
}

export function composeProjectFromSlug(slug: string): string {
  return `stockix-${slug}`;
}

async function bestEffortDockerProjectCleanup(project: string): Promise<void> {
  try {
    await execa("docker", ["compose", "-p", project, "down", "--volumes", "--remove-orphans"], {
      stdio: "pipe",
    });
  } catch {
    // Best-effort cleanup only.
  }

  try {
    const { stdout } = await execa("docker", ["ps", "-a", "--format", "{{.ID}}\t{{.Names}}"]);
    const ids = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("\t"))
      .filter((parts) => parts.length === 2 && parts[1]?.startsWith(`${project}-`))
      .map((parts) => parts[0]!)
      .filter(Boolean);
    if (ids.length > 0) {
      await execa("docker", ["rm", "-f", ...ids], { stdio: "pipe" });
    }
  } catch {
    // Best-effort cleanup only.
  }

  try {
    const { stdout } = await execa("docker", ["volume", "ls", "--format", "{{.Name}}"]);
    const volumes = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((name) => name.startsWith(`${project}_`));
    if (volumes.length > 0) {
      await execa("docker", ["volume", "rm", "-f", ...volumes], { stdio: "pipe" });
    }
  } catch {
    // Best-effort cleanup only.
  }

  try {
    await execa("docker", ["network", "rm", `${project}_default`], { stdio: "pipe" });
  } catch {
    // Best-effort cleanup only.
  }
}

export async function scrubTenantRuntimeArtifacts(slug: string): Promise<void> {
  const project = composeProjectFromSlug(slug);
  await bestEffortDockerProjectCleanup(project);
  await bestEffortDockerProjectCleanup(`stockix-pos-${slug}`);
  await rm(`${apiConfig.tenantEnvRoot}/${slug}`, { recursive: true, force: true }).catch(() => undefined);
  await rm(`${apiConfig.traefikDynamicDir}/tenant-${slug}.yml`, { force: true }).catch(() => undefined);
  await rm(`${apiConfig.traefikDynamicDir}/tenant-pos-${slug}.yml`, { force: true }).catch(
    () => undefined,
  );
}

const stockixModuleZod = z.enum(["accounting", "pos", "pms", "chat"]);

export function registerTenantRoutes(app: Hono<ApiEnv>, db: Db | null): void {
app.get("/tenants", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

  const actorId = String(c.get("actorId") ?? "");
  const actorRole = String(c.get("actorRole") ?? "");
  const actorPermissions = (c.get("actorPermissions") as string[] | undefined) ?? [];

  const rawPage = c.req.query("page");
  const rawPageSize = c.req.query("pageSize");
  const search = c.req.query("search")?.trim() ?? "";
  const statusFilter = c.req.query("status")?.trim() ?? "";
  const sortRaw = c.req.query("sort")?.trim() ?? "newest";

  const page = Math.max(1, Number(rawPage ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(rawPageSize ?? 20) || 20));
  const offset = (page - 1) * pageSize;

  const childOrgFilter = notExists(
    db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.slug, tenants.slug), ne(organizations.tenantId, tenants.id))),
  );

  const conditions: SQL[] = [childOrgFilter];

  const scopedTenantIds = await getScopedTenantIdsForOwner(
    db,
    actorId,
    actorPermissions,
    actorRole,
  );
  if (scopedTenantIds !== null) {
    if (scopedTenantIds.length === 0) {
      return c.json({
        tenants: [],
        page,
        pageSize,
        total: 0,
        totalPages: 1,
        directoryTotals: {
          all: 0,
          active: 0,
          suspended: 0,
          provisioning: 0,
          failed: 0,
          partial: 0,
        },
      });
    }
    conditions.push(inArray(tenants.id, scopedTenantIds));
  }

  if (search) {
    const pat = `%${search}%`;
    conditions.push(
      or(
        ilike(tenants.name, pat),
        ilike(tenants.slug, pat),
        ilike(tenants.adminEmail, pat),
      )!,
    );
  }

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "provisioning") {
      conditions.push(
        or(eq(tenantDeployments.status, "provisioning"), eq(tenantDeployments.status, "pending"))!,
      );
    } else if (statusFilter === "partial") {
      conditions.push(eq(tenants.status, "partial"));
    } else {
      conditions.push(eq(tenantDeployments.status, statusFilter));
    }
  }

  const fullWhere = conditions.length === 1 ? conditions[0] : and(...conditions);

  const orderClause =
    sortRaw === "oldest"
      ? asc(tenants.createdAt)
      : sortRaw === "name_asc"
        ? asc(tenants.name)
        : sortRaw === "name_desc"
          ? desc(tenants.name)
          : desc(tenants.createdAt);

  const joinDeployments = eq(tenantDeployments.tenantId, tenants.id);

  const countQuery = db
    .select({ c: count() })
    .from(tenants)
    .leftJoin(tenantDeployments, joinDeployments)
    .where(fullWhere);

  const dataQuery = db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      adminEmail: tenants.adminEmail,
      planSlug: tenants.planSlug,
      modules: tenants.modules,
      tenantStatus: tenants.status,
      deploymentStatus: tenantDeployments.status,
      internalPort: tenantDeployments.internalPort,
      composeProject: tenantDeployments.composeProjectName,
      lastError: tenantDeployments.lastError,
      registrationCompletedAt: tenantDeployments.registrationCompletedAt,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, joinDeployments)
    .where(fullWhere)
    .orderBy(orderClause)
    .limit(pageSize)
    .offset(offset);

  const dirJoin = joinDeployments;

  const [
    countResult,
    rows,
    totalAllRow,
    activeRow,
    suspendedRow,
    provisioningRow,
    failedRow,
    partialRow,
  ] = await Promise.all([
      countQuery,
      dataQuery,
      db
        .select({ c: count() })
        .from(tenants)
        .leftJoin(tenantDeployments, dirJoin)
        .where(childOrgFilter),
      db
        .select({ c: count() })
        .from(tenants)
        .leftJoin(tenantDeployments, dirJoin)
        .where(and(childOrgFilter, eq(tenantDeployments.status, "active"))),
      db
        .select({ c: count() })
        .from(tenants)
        .leftJoin(tenantDeployments, dirJoin)
        .where(and(childOrgFilter, eq(tenantDeployments.status, "suspended"))),
      db
        .select({ c: count() })
        .from(tenants)
        .leftJoin(tenantDeployments, dirJoin)
        .where(
          and(
            childOrgFilter,
            or(eq(tenantDeployments.status, "provisioning"), eq(tenantDeployments.status, "pending"))!,
          ),
        ),
      db
        .select({ c: count() })
        .from(tenants)
        .leftJoin(tenantDeployments, dirJoin)
        .where(and(childOrgFilter, eq(tenantDeployments.status, "failed"))),
      db
        .select({ c: count() })
        .from(tenants)
        .leftJoin(tenantDeployments, dirJoin)
        .where(and(childOrgFilter, eq(tenants.status, "partial"))),
    ]);

  const total = Number(countResult[0]?.c ?? 0);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

  const tenantIds = rows.map((r) => r.tenantId);
  type LicenseSummary = {
    status: string;
    expiresAt: string | null;
    validFrom: string | null;
    isPerpetual: boolean;
  };
  const licenseByTenant = new Map<string, LicenseSummary>();
  if (tenantIds.length > 0) {
    const licRows = await db
      .select({
        tenantId: licenses.tenantId,
        status: licenses.status,
        expiresAt: licenses.expiresAt,
        validFrom: licenses.validFrom,
        isPerpetual: licenses.isPerpetual,
      })
      .from(licenses)
      .where(and(inArray(licenses.tenantId, tenantIds), ne(licenses.status, "unassigned")))
      .orderBy(desc(licenses.updatedAt));
    for (const lr of licRows) {
      if (lr.tenantId && !licenseByTenant.has(lr.tenantId)) {
        licenseByTenant.set(lr.tenantId, {
          status: lr.status,
          expiresAt: lr.expiresAt?.toISOString() ?? null,
          validFrom: lr.validFrom?.toISOString() ?? null,
          isPerpetual: lr.isPerpetual,
        });
      }
    }
  }

  const directoryTotals = {
    total: Number(totalAllRow[0]?.c ?? 0),
    active: Number(activeRow[0]?.c ?? 0),
    suspended: Number(suspendedRow[0]?.c ?? 0),
    provisioning: Number(provisioningRow[0]?.c ?? 0),
    failed: Number(failedRow[0]?.c ?? 0),
    partial: Number(partialRow[0]?.c ?? 0),
  };

  return c.json({
    tenants: rows.map((r) => {
      const lic = licenseByTenant.get(r.tenantId);
      return {
        ...r,
        createdAt: r.createdAt.toISOString(),
        registrationCompletedAt: r.registrationCompletedAt?.toISOString() ?? null,
        licenseStatus: lic?.status ?? null,
        licenseExpiresAt: lic?.expiresAt ?? null,
        licenseValidFrom: lic?.validFrom ?? null,
        licenseIsPerpetual: lic?.isPerpetual ?? null,
      };
    }),
    total,
    page,
    pageSize,
    totalPages,
    directoryTotals,
  });
});

function csvEscapeCell(value: string | number | boolean | null | undefined): string {
  const cell = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

app.get("/tenants/export.csv", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

  const search = c.req.query("search")?.trim() ?? "";
  const statusFilter = c.req.query("status")?.trim() ?? "";
  const sortRaw = c.req.query("sort")?.trim() ?? "newest";

  const childOrgFilter = notExists(
    db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.slug, tenants.slug), ne(organizations.tenantId, tenants.id))),
  );

  const conditions: SQL[] = [childOrgFilter];

  if (search) {
    const pat = `%${search}%`;
    conditions.push(
      or(
        ilike(tenants.name, pat),
        ilike(tenants.slug, pat),
        ilike(tenants.adminEmail, pat),
      )!,
    );
  }

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "provisioning") {
      conditions.push(
        or(eq(tenantDeployments.status, "provisioning"), eq(tenantDeployments.status, "pending"))!,
      );
    } else {
      conditions.push(eq(tenantDeployments.status, statusFilter));
    }
  }

  const fullWhere = conditions.length === 1 ? conditions[0] : and(...conditions);

  const orderClause =
    sortRaw === "oldest"
      ? asc(tenants.createdAt)
      : sortRaw === "name_asc"
        ? asc(tenants.name)
        : sortRaw === "name_desc"
          ? desc(tenants.name)
          : desc(tenants.createdAt);

  const joinDeployments = eq(tenantDeployments.tenantId, tenants.id);

  const rows = await db
    .select({
      name: tenants.name,
      slug: tenants.slug,
      adminEmail: tenants.adminEmail,
      adminFirstName: tenants.adminFirstName,
      adminLastName: tenants.adminLastName,
      planSlug: tenants.planSlug,
      deploymentStatus: tenantDeployments.status,
      internalPort: tenantDeployments.internalPort,
      registrationCompletedAt: tenantDeployments.registrationCompletedAt,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, joinDeployments)
    .where(fullWhere)
    .orderBy(orderClause);

  const headers = [
    "Name",
    "Slug",
    "Admin Email",
    "Admin First Name",
    "Admin Last Name",
    "Plan",
    "Status",
    "Internal Port",
    "Registration Completed",
    "Created At",
  ];

  const csvRows = rows.map((r) =>
    [
      r.name,
      r.slug,
      r.adminEmail,
      r.adminFirstName ?? "",
      r.adminLastName ?? "",
      r.planSlug ?? "",
      r.deploymentStatus ?? "",
      r.internalPort?.toString() ?? "",
      r.registrationCompletedAt?.toISOString() ?? "",
      r.createdAt.toISOString(),
    ].map(csvEscapeCell).join(","),
  );

  const csv = [headers.map(csvEscapeCell).join(","), ...csvRows].join("\n");
  const filename = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;

  return c.text(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

// ─── TENANT ROUTES — ALL REQUIRE assertTenantInOwnerScope ───────────────
// Scope check ensures operator can only access tenants in their org.
// Do not add new tenant routes without calling assertTenantInOwnerScope first.
// See: apps/api/src/org-access-scope.ts
app.delete("/tenants/:tenantId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const tenantId = c.req.param("tenantId");
  const parsed = z.string().uuid().safeParse(tenantId);
  if (!parsed.success) {
    return c.json({ error: "tenantId must be a UUID" }, 400);
  }
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }
  const removeVolumes = new URL(c.req.url).searchParams.get("volumes") === "true";
  const existing = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      tenantStatus: tenants.status,
      deploymentStatus: tenantDeployments.status,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, parsed.data))
    .limit(1);
  const target = existing[0];
  if (!target) {
    return c.json({
      accepted: true,
      deleted: true,
      alreadyDeleted: true,
      tenantId: parsed.data,
      message: "Tenant already deleted.",
    }, 200);
  }
  const isFailedTenant =
    target.tenantStatus === "failed" || target.deploymentStatus === "failed";
  const jobRows = await db
    .select({ correlationId: tenantLifecycleJobs.correlationId })
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.tenantId, parsed.data));
  const tenantCorrelationIds = jobRows
    .map((row) => row.correlationId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (isFailedTenant) {
    await scrubTenantRuntimeArtifacts(target.slug);
    await db.transaction(async (tx) => {
      await tx.delete(tenantProvisionEvents).where(eq(tenantProvisionEvents.tenantId, parsed.data));
      await tx.delete(adminAuditLog).where(eq(adminAuditLog.targetTenantId, parsed.data));
      await tx.delete(tenantDeployments).where(eq(tenantDeployments.tenantId, parsed.data));
      await tx.delete(tenants).where(eq(tenants.id, parsed.data));
      await tx
        .delete(tenantLifecycleJobs)
        .where(eq(tenantLifecycleJobs.tenantId, parsed.data));
    });
    purgeProvisionCaches(tenantCorrelationIds);
    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "tenant.delete",
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: {
        deletedTenantId: parsed.data,
        slug: target.slug,
        mode: "hard_delete_failed_tenant",
        previousTenantStatus: target.tenantStatus,
        previousDeploymentStatus: target.deploymentStatus,
      },
    });
    return c.json({
      accepted: true,
      deleted: true,
      slug: target.slug,
      hardDeleted: true,
      message: "Failed tenant fully deleted from database.",
    }, 200);
  }
  // Deprovision child org stacks (separate tenants rows, slug = org.slug) before parent.
  // Jobs are async; we only enqueue here — parent deprovision is still queued immediately after.
  const childOrgs = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(
      and(eq(organizations.tenantId, parsed.data), ne(organizations.status, "failed")),
    );

  const childSlugs = childOrgs.map((org) => org.slug);
  const childTenantRows =
    childSlugs.length > 0
      ? await db
          .select({ id: tenants.id, slug: tenants.slug })
          .from(tenants)
          .where(inArray(tenants.slug, childSlugs))
      : [];
  const childTenantBySlug = new Map(
    childTenantRows.map((row) => [row.slug, row] as const),
  );

  for (const org of childOrgs) {
    const childTenant = childTenantBySlug.get(org.slug);

    if (!childTenant || childTenant.id === parsed.data) {
      continue;
    }

    await db
      .update(tenantLifecycleJobs)
      .set({
        status: "dead",
        lastError: sql`'cancelled_by_parent_delete'`,
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantLifecycleJobs.tenantId, childTenant.id),
          eq(tenantLifecycleJobs.type, "tenant.provision"),
          or(
            eq(tenantLifecycleJobs.status, "pending"),
            eq(tenantLifecycleJobs.status, "running"),
          ),
        ),
      );

    await insertTenantJob(db, {
      type: "tenant.deprovision",
      tenantId: childTenant.id,
      payload: {
        tenantId: childTenant.id,
        removeVolumes: true,
        removeImages: false,
      },
    });

    await db
      .update(organizations)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(organizations.id, org.id));
  }

  // Always cancel in-flight tenant.provision jobs first so the worker can abort
  // any long-running compose pull/build and proceed to deprovision cleanup.
  await db
    .update(tenantLifecycleJobs)
    .set({
      status: "dead",
      lastError: sql`'cancelled_by_user'`,
      claimedAt: null,
      claimedBy: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tenantLifecycleJobs.tenantId, parsed.data),
        eq(tenantLifecycleJobs.type, "tenant.provision"),
        or(
          eq(tenantLifecycleJobs.status, "pending"),
          eq(tenantLifecycleJobs.status, "running"),
        ),
      ),
    );
  const job = await insertTenantJob(db, {
    type: "tenant.deprovision",
    tenantId: parsed.data,
    payload: {
      tenantId: parsed.data,
      removeVolumes,
      removeImages: removeVolumes,
    },
  });
  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.delete",
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: {
      deletedTenantId: parsed.data,
      slug: target.slug,
      mode: "queued",
      removeVolumes,
      previousTenantStatus: target.tenantStatus,
      previousDeploymentStatus: target.deploymentStatus,
    },
  });
  return c.json({
    accepted: true,
    deleted: true,
    slug: target.slug,
    jobId: job?.id ?? null,
    message: "Tenant deprovision queued for infra worker execution.",
  }, 202);
});

const provisionBody = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase DNS-like"),
  name: z.string().min(1),
  owner_id: z.string().uuid(),
  admin_email: z.string().email(),
  admin_first_name: z.string().min(1),
  admin_last_name: z.string().min(1),
  plan_slug: z.string().default("starter"),
  modules: z.array(stockixModuleZod).default(["accounting"]),
  assign_existing_license_id: z.string().uuid().optional(),
});

app.post("/tenants", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

  let body: z.infer<typeof provisionBody>;
  try {
    body = provisionBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      { error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) },
      400,
    );
  }

  const ownerOk = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.id, body.owner_id))
    .limit(1);
  if (ownerOk.length === 0) {
    return c.json({ error: "owner_id does not exist" }, 400);
  }

  const [planOk] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.slug, body.plan_slug), eq(plans.isActive, true)))
    .limit(1);
  if (!planOk) {
    return c.json({ error: "invalid_plan", message: `Unknown or inactive plan: ${body.plan_slug}` }, 400);
  }

  if (body.assign_existing_license_id) {
    const [existingLic] = await db
      .select({ id: licenses.id, status: licenses.status })
      .from(licenses)
      .where(eq(licenses.id, body.assign_existing_license_id))
      .limit(1);
    if (!existingLic) {
      return c.json({ error: "license_not_found", message: "assign_existing_license_id does not exist" }, 400);
    }
    if (existingLic.status !== "unassigned") {
      return c.json(
        { error: "license_not_unassigned", message: "License must be unassigned to attach at provision time." },
        409,
      );
    }
  }

  const slugRecord = await db
    .select({
      id: tenants.id,
      tenantStatus: tenants.status,
      deploymentStatus: tenantDeployments.status,
      slug: tenants.slug,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.slug, body.slug))
    .limit(1);

  const existing = slugRecord[0];
  if (existing) {
    const canRecoverSlug =
      existing.tenantStatus === "failed"
      || existing.tenantStatus === "provisioning"
      || existing.deploymentStatus === "failed"
      || existing.deploymentStatus === "provisioning";
    if (canRecoverSlug) {
      await scrubTenantRuntimeArtifacts(body.slug);
      const rows = await db
        .select({ correlationId: tenantLifecycleJobs.correlationId })
        .from(tenantLifecycleJobs)
        .where(eq(tenantLifecycleJobs.tenantId, existing.id));
      const correlationIds = rows
        .map((row) => row.correlationId)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      await db.transaction(async (tx) => {
        await tx.delete(tenantProvisionEvents).where(eq(tenantProvisionEvents.tenantId, existing.id));
        await tx.delete(adminAuditLog).where(eq(adminAuditLog.targetTenantId, existing.id));
        await tx.delete(tenantDeployments).where(eq(tenantDeployments.tenantId, existing.id));
        await tx.delete(tenantLifecycleJobs).where(eq(tenantLifecycleJobs.tenantId, existing.id));
        await tx.delete(tenants).where(eq(tenants.id, existing.id));
      });
      purgeProvisionCaches(correlationIds);
    } else {
      return c.json(
        { error: "slug_taken", message: `Tenant slug already exists: ${body.slug}` },
        409,
      );
    }
  } else {
    // Clean orphan runtime artifacts if DB has no tenant row for this slug.
    await scrubTenantRuntimeArtifacts(body.slug);
  }
  const stillTaken = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, body.slug))
    .limit(1);
  if (stillTaken.length > 0) {
    return c.json(
      { error: `Tenant slug already exists: ${body.slug}` },
      409,
    );
  }

  const correlationId = randomUUID();
  const log = (m: string) => {
    logger.info(m, { correlationId });
  };

  const acceptTrace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: body.slug }),
    log,
  );
  await acceptTrace.event(
    "api",
    "HTTP 202 — provisioning accepted; background worker will start",
  );

  const job = await insertTenantJob(db, {
    type: "tenant.provision",
    correlationId,
    payload: {
      slug: body.slug,
      name: body.name,
      ownerId: body.owner_id,
      adminEmail: body.admin_email,
      adminFirstName: body.admin_first_name,
      adminLastName: body.admin_last_name,
      planSlug: body.plan_slug,
      modules: body.modules,
      assignExistingLicenseId: body.assign_existing_license_id ?? null,
      provisionRequestedById: c.get("actorId") as string,
    },
  });

  return c.json(
    {
      accepted: true,
      jobId: job?.id ?? null,
      correlationId,
      admin_email: body.admin_email,
      poll: `/tenants/provision-status/${correlationId}`,
      stream: `/tenants/provision-stream/${correlationId}`,
      message:
        "Provisioning queued for infra worker execution. Poll provision-status until status is complete or failed.",
      note:
        "Save oneTimeAdminPassword from the status response when complete — it is not stored in Stockix.",
    },
    202,
  );
});

app.post("/tenants/provision-stop/:correlationId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const correlationId = c.req.param("correlationId");
  const [job] = await db
    .select({
      id: tenantLifecycleJobs.id,
      type: tenantLifecycleJobs.type,
      status: tenantLifecycleJobs.status,
      attempts: tenantLifecycleJobs.attempts,
      maxAttempts: tenantLifecycleJobs.maxAttempts,
      tenantId: tenantLifecycleJobs.tenantId,
    })
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.correlationId, correlationId))
    .orderBy(desc(tenantLifecycleJobs.createdAt))
    .limit(1);

  if (!job || job.type !== "tenant.provision") {
    return c.json({ error: "provision_job_not_found" }, 404);
  }

  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: "unknown" }),
    (m) => logger.info(m, { correlationId }),
  );

  if (job.status === "completed") {
    return c.json({ error: "job_already_completed" }, 409);
  }

  if (job.status === "dead") {
    await trace.event("cancel", "Provision stop requested after terminal state", {
      level: "warn",
      meta: { status: "dead" },
    }).catch((error) => {
      logger.error("provision-stop trace write failed", error);
    });
    return c.json({ ok: true, status: "already_stopped", correlationId });
  }

  if (job.status === "pending") {
    await db
      .update(tenantLifecycleJobs)
      .set({
        status: "dead",
        attempts: job.maxAttempts ?? Math.max(1, job.attempts ?? 0),
        lastError: sql`'cancelled_by_user'`,
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantLifecycleJobs.id, job.id), eq(tenantLifecycleJobs.status, "pending")));
    await trace.event("cancel", "Provision stopped before worker execution", {
      level: "warn",
      meta: { status: "pending" },
    }).catch((error) => {
      logger.error("provision-stop trace write failed", error);
    });
    return c.json({ ok: true, status: "cancelled", correlationId });
  }

  if (job.status === "running") {
    await db
      .update(tenantLifecycleJobs)
      .set({
        status: "dead",
        attempts: job.maxAttempts ?? Math.max(1, job.attempts ?? 0),
        lastError: sql`'cancelled_by_user'`,
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantLifecycleJobs.id, job.id), eq(tenantLifecycleJobs.status, "running")));
    await trace.event("cancel", "Provision stop requested; worker will abort at next checkpoint", {
      level: "warn",
      meta: { status: "running" },
    }).catch((error) => {
      logger.error("provision-stop trace write failed", error);
    });
    if (job.tenantId) {
      await db
        .update(tenantDeployments)
        .set({
          status: "failed",
          lastError: sql`'cancelled_by_user'`,
          updatedAt: new Date(),
        })
        .where(eq(tenantDeployments.tenantId, job.tenantId));
      await insertTenantJob(db, {
        type: "tenant.deprovision",
        tenantId: job.tenantId,
        payload: { tenantId: job.tenantId, removeVolumes: true, removeImages: true },
        priority: 10,
      });
    }
    purgeProvisionCaches([correlationId]);
    return c.json({ ok: true, status: "cancelled", correlationId });
  }

  return c.json({ ok: true, status: job.status, correlationId });
});

app.post("/tenants/:tenantId/provision-stop", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [job] = await db
    .select({
      id: tenantLifecycleJobs.id,
      type: tenantLifecycleJobs.type,
      status: tenantLifecycleJobs.status,
      attempts: tenantLifecycleJobs.attempts,
      maxAttempts: tenantLifecycleJobs.maxAttempts,
      correlationId: tenantLifecycleJobs.correlationId,
    })
    .from(tenantLifecycleJobs)
    .where(
      and(
        eq(tenantLifecycleJobs.tenantId, parsed.data),
        eq(tenantLifecycleJobs.type, "tenant.provision"),
      ),
    )
    .orderBy(desc(tenantLifecycleJobs.createdAt))
    .limit(1);

  if (!job) {
    await db
      .update(tenantDeployments)
      .set({
        status: "failed",
        lastError: sql`'cancelled_by_user'`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantDeployments.tenantId, parsed.data),
          or(
            eq(tenantDeployments.status, "provisioning"),
            eq(tenantDeployments.status, "pending"),
          ),
        ),
      );
    return c.json({
      ok: true,
      status: "no_active_provision_job",
      message: "No active tenant.provision job found for this tenant.",
    });
  }
  const correlationId = job.correlationId;
  if (!correlationId) {
    return c.json({ error: "provision_correlation_missing" }, 409);
  }

  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: "unknown" }),
    (m) => logger.info(m, { correlationId }),
  );

  if (job.status === "completed") {
    return c.json({ error: "job_already_completed", correlationId }, 409);
  }

  if (job.status === "dead") {
    await db
      .update(tenantDeployments)
      .set({
        status: "failed",
        lastError: sql`'cancelled_by_user'`,
        updatedAt: new Date(),
      })
      .where(eq(tenantDeployments.tenantId, parsed.data));
    await trace
      .event("cancel", "Provision stop requested after terminal state", {
        level: "warn",
        meta: { status: "dead", tenantId: parsed.data },
      })
      .catch((error) => {
        logger.error("tenant-provision-stop trace write failed", error);
      });
    return c.json({ ok: true, status: "already_stopped", correlationId });
  }

  if (job.status === "pending") {
    await db
      .update(tenantLifecycleJobs)
      .set({
        status: "dead",
        attempts: job.maxAttempts ?? Math.max(1, job.attempts ?? 0),
        lastError: sql`'cancelled_by_user'`,
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantLifecycleJobs.id, job.id), eq(tenantLifecycleJobs.status, "pending")));
    await trace
      .event("cancel", "Provision stopped before worker execution", {
        level: "warn",
        meta: { status: "pending", tenantId: parsed.data },
      })
      .catch((error) => {
        logger.error("tenant-provision-stop trace write failed", error);
      });
    await db
      .update(tenantDeployments)
      .set({
        status: "failed",
        lastError: sql`'cancelled_by_user'`,
        updatedAt: new Date(),
      })
      .where(eq(tenantDeployments.tenantId, parsed.data));
    return c.json({ ok: true, status: "cancelled", correlationId });
  }

  if (job.status === "running") {
    await db
      .update(tenantLifecycleJobs)
      .set({
        status: "dead",
        attempts: job.maxAttempts ?? Math.max(1, job.attempts ?? 0),
        lastError: sql`'cancelled_by_user'`,
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantLifecycleJobs.id, job.id), eq(tenantLifecycleJobs.status, "running")));
    await trace
      .event("cancel", "Provision stop requested; worker will abort at next checkpoint", {
        level: "warn",
        meta: { status: "running", tenantId: parsed.data },
      })
      .catch((error) => {
        logger.error("tenant-provision-stop trace write failed", error);
      });
    await db
      .update(tenantDeployments)
      .set({
        status: "failed",
        lastError: sql`'cancelled_by_user'`,
        updatedAt: new Date(),
      })
      .where(eq(tenantDeployments.tenantId, parsed.data));
    await insertTenantJob(db, {
      type: "tenant.deprovision",
      tenantId: parsed.data,
      payload: { tenantId: parsed.data, removeVolumes: true, removeImages: true },
      priority: 10,
    });
    purgeProvisionCaches([correlationId]);
    return c.json({ ok: true, status: "cancelled", correlationId });
  }

  return c.json({ ok: true, status: job.status, correlationId });
});

app.get("/tenants/provision-status/:correlationId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const correlationId = c.req.param("correlationId");
  const dbClient = db;
  const jobs = await listTenantJobs(dbClient, correlationId);
  const lastJob = jobs[jobs.length - 1] ?? null;
  const events = await loadProvisionEventsJson(db, correlationId);
  const readiness = await getTenantReadiness(db, correlationId);
  const ready = readiness.status === "READY";

  if (!lastJob) {
    if (events.length === 0) {
      return c.json(
        {
          error: "unknown_or_expired_job",
          message:
            "No job for this id (expired ~15m after completion, or the API process restarted).",
        },
        404,
      );
    }
    const last = events[events.length - 1]!;
    if (last.phase === "complete") {
      return c.json({
        status: "complete",
        ready,
        readiness,
        correlationId,
        events,
        oneTimeAdminPassword: null,
        note:
          "In-memory job expired — one-time password was only in the earlier status response. Check Stockix reset flows or reprovision. Trace is still available in `events`.",
      });
    }
    if (last.phase === "failed") {
      return c.json({
        status: "failed",
        ready,
        readiness,
        correlationId,
        error: last.message,
        cause:
          last.meta && typeof last.meta === "object" && "cause" in last.meta
            ? String((last.meta as { cause?: unknown }).cause)
            : undefined,
        events,
      });
    }
    return c.json({
      status: "running",
      ready,
      readiness,
      correlationId,
      message:
        "No lifecycle job record found; see `events` for persisted trace state.",
      events,
    });
  }

  if (lastJob.status === "pending" || lastJob.status === "running" || lastJob.status === "failed") {
    if (lastJob.status === "failed") {
      return c.json({
        status: "failed",
        ready,
        readiness,
        correlationId,
        jobId: lastJob.id,
        error: lastJob.lastError ?? "job_failed",
        cause: lastJob.lastError ?? undefined,
        events,
      });
    }
    return c.json({
      status: lastJob.status === "pending" ? "queued" : lastJob.status,
      ready,
      readiness,
      correlationId,
      jobId: lastJob.id,
      events,
    });
  }

  if (lastJob.status === "completed") {
    const completeEvent = [...events].reverse().find((event) => event.phase === "complete");
    const eventMeta =
      completeEvent?.meta && typeof completeEvent.meta === "object"
        ? (completeEvent.meta as Record<string, unknown>)
        : {};
    // Serve the one-time admin password from the in-memory cache only (CRIT-02).
    // It is never stored in tenantProvisionEvents.meta or any other DB column.
    // After the 15-minute TTL expires the cache entry is removed and null is returned.
    const cached = provisionPasswordCache.get(correlationId);
    let oneTimeAdminPassword = cached && cached.expiresAt > Date.now() ? cached.password : null;
    if (cached && cached.expiresAt <= Date.now()) {
      provisionPasswordCache.delete(correlationId);
    }
    const cachedPos = provisionPosCredentialsCache.get(correlationId);
    let posDefaultCredentials =
      cachedPos && cachedPos.expiresAt > Date.now() ? cachedPos.credentials : null;
    if (cachedPos && cachedPos.expiresAt <= Date.now()) {
      provisionPosCredentialsCache.delete(correlationId);
    }
    if (!oneTimeAdminPassword) {
      const consumedRows = await db
        .select({ id: tenantProvisionEvents.id })
        .from(tenantProvisionEvents)
        .where(
          and(
            eq(tenantProvisionEvents.correlationId, correlationId),
            eq(tenantProvisionEvents.phase, "secret_consumed"),
          ),
        )
        .limit(1);
      const alreadyConsumed = consumedRows.length > 0;
      if (!alreadyConsumed) {
      const secretEvents = await db
        .select({ meta: tenantProvisionEvents.meta })
        .from(tenantProvisionEvents)
        .where(
          and(
            eq(tenantProvisionEvents.correlationId, correlationId),
            eq(tenantProvisionEvents.phase, "secret"),
          ),
        )
        .orderBy(desc(tenantProvisionEvents.createdAt))
        .limit(5);
      for (const secretEvent of secretEvents) {
        const meta = secretEvent.meta ?? null;
        const cipher = meta && typeof meta === "object" ? (meta.cipher as string | undefined) : undefined;
        const secretType =
          meta && typeof meta === "object" && typeof meta.type === "string"
            ? meta.type
            : "";
        if (typeof cipher !== "string") continue;
        const decrypted = decryptProvisionSecret(cipher);
        if (!decrypted) continue;
        if (secretType === "pos_bootstrap_pins" && !posDefaultCredentials) {
          try {
            posDefaultCredentials = JSON.parse(decrypted) as PosDefaultCredentialsPayload;
          } catch {
            // ignore malformed payload
          }
          continue;
        }
        if (!oneTimeAdminPassword && secretType !== "pos_bootstrap_pins") {
          oneTimeAdminPassword = decrypted;
        }
      }
      }
    }
    if (!posDefaultCredentials) {
      const secretEvents = await db
        .select({ meta: tenantProvisionEvents.meta })
        .from(tenantProvisionEvents)
        .where(
          and(
            eq(tenantProvisionEvents.correlationId, correlationId),
            eq(tenantProvisionEvents.phase, "secret"),
          ),
        )
        .orderBy(desc(tenantProvisionEvents.createdAt))
        .limit(10);
      for (const secretEvent of secretEvents) {
        const meta = secretEvent.meta ?? null;
        if (!meta || typeof meta !== "object" || meta.type !== "pos_bootstrap_pins") continue;
        const cipher = meta.cipher as string | undefined;
        if (typeof cipher !== "string") continue;
        const decrypted = decryptProvisionSecret(cipher);
        if (!decrypted) continue;
        try {
          posDefaultCredentials = JSON.parse(decrypted) as PosDefaultCredentialsPayload;
          break;
        } catch {
          // ignore
        }
      }
    }
    if (oneTimeAdminPassword) {
      provisionPasswordCache.delete(correlationId);
      await appendProvisionEventSafe(db, {
        correlationId,
        phase: "secret_consumed",
        level: "info",
        message: "Bootstrap admin OTP consumed from status endpoint",
        meta: { consumedAt: new Date().toISOString() },
      });
    }
    const tenantIdForPos =
      lastJob.tenantId
      ?? (typeof eventMeta.tenantId === "string" ? eventMeta.tenantId : null);
    let posUrl: string | null =
      typeof eventMeta.posUrl === "string" ? eventMeta.posUrl : null;
    if (tenantIdForPos && !posUrl) {
      const [depRow] = await db
        .select({ posUrl: tenantDeployments.posUrl })
        .from(tenantDeployments)
        .where(eq(tenantDeployments.tenantId, tenantIdForPos))
        .limit(1);
      posUrl = depRow?.posUrl ?? null;
    }
    return c.json({
      status: "complete",
      ready,
      readiness,
      correlationId,
      jobId: lastJob.id,
      tenantId:
        (typeof lastJob.tenantId === "string" ? lastJob.tenantId : null)
        ?? (typeof eventMeta.tenantId === "string" ? eventMeta.tenantId : null),
      deploymentId: typeof eventMeta.deploymentId === "string" ? eventMeta.deploymentId : null,
      composeProjectName:
        typeof eventMeta.composeProjectName === "string" ? eventMeta.composeProjectName : null,
      internalPort: typeof eventMeta.internalPort === "number" ? eventMeta.internalPort : null,
      baseUrl: typeof eventMeta.baseUrl === "string" ? eventMeta.baseUrl : null,
      posUrl,
      oneTimeAdminPassword,
      posDefaultCredentials,
      events,
      note:
        "Stockix login API field is `crediential` (typo) if you call /api/auth/login.",
    });
  }

  return c.json({
    status: lastJob.status === "dead" ? "failed" : lastJob.status,
    ready,
    readiness,
    correlationId,
    jobId: lastJob.id,
    error: lastJob.lastError,
    cause: lastJob.lastError,
    events,
  });
});

app.get("/tenants/provision-stream/:correlationId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const correlationId = c.req.param("correlationId");
  const dbClient = db;
  const jobs = await listTenantJobs(dbClient, correlationId);
  const anyRow = await db
    .select({ id: tenantProvisionEvents.id })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .limit(1);

  if (jobs.length === 0 && anyRow.length === 0) {
    return c.json(
      {
        error: "unknown_or_expired_job",
        message:
          "No in-memory job and no provision trace for this correlation id.",
      },
      404,
    );
  }

  const TERMINAL_JOB_STATUSES = new Set(["completed", "dead", "failed"]);
  const STREAM_JOB_POLL_MS = 1500;
  const STREAM_PING_MS = 12_000;

  return streamSSE(c, async (stream) => {
    const sent = new Set<string>();
    const forward = async (payload: ProvisionEventPayload) => {
      if (sent.has(payload.id)) return;
      sent.add(payload.id);
      await stream.writeSSE({
        event: "provision",
        data: JSON.stringify(payload),
      });
    };
    let closed = false;
    stream.onAbort(() => {
      closed = true;
    });

    const replayRows = await dbClient
      .select()
      .from(tenantProvisionEvents)
      .where(eq(tenantProvisionEvents.correlationId, correlationId))
      .orderBy(asc(tenantProvisionEvents.createdAt), asc(tenantProvisionEvents.id));
    for (const row of replayRows) {
      await forward(rowToProvisionPayload(row));
    }

    let lastEventPhase = replayRows[replayRows.length - 1]?.phase;
    const unsubscribe = subscribeProvision(correlationId, (payload) => {
      lastEventPhase = payload.phase;
      void forward(payload);
    });

    let lastPingAt = 0;

    const writeDoneIfTerminal = async (): Promise<boolean> => {
      const streamJobs = await listTenantJobs(dbClient, correlationId);
      const lastJob = streamJobs[streamJobs.length - 1] ?? null;
      const terminalFromJob =
        lastJob !== null && TERMINAL_JOB_STATUSES.has(lastJob.status);
      const terminalFromEvent =
        lastEventPhase === "complete" || lastEventPhase === "failed";

      if (!terminalFromJob && !(terminalFromEvent && streamJobs.length === 0)) {
        return false;
      }

      const status =
        lastJob?.status === "completed" || lastEventPhase === "complete"
          ? "complete"
          : "failed";
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ status, correlationId }),
      });
      return true;
    };

    if (await writeDoneIfTerminal()) {
      unsubscribe();
      return;
    }

    while (!closed) {
      if (await writeDoneIfTerminal()) {
        break;
      }

      const now = Date.now();
      if (now - lastPingAt >= STREAM_PING_MS) {
        await stream.writeSSE({ event: "ping", data: String(now) });
        lastPingAt = now;
      }

      await new Promise((resolve) => setTimeout(resolve, STREAM_JOB_POLL_MS));
    }

    unsubscribe();
  });
});

app.get("/tenants/:tenantId/organizations", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, parsed.data))
    .limit(1);
  if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const limit = Math.min(
    500,
    Math.max(1, Number.parseInt(c.req.query("limit") ?? "100", 10) || 100),
  );
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.tenantId, parsed.data))
    .orderBy(desc(organizations.isPrimary), asc(organizations.createdAt))
    .limit(limit)
    .offset(offset);

  const actorId = String(c.get("actorId") ?? "");
  const actorRole = String(c.get("actorRole") ?? "");
  const actorPermissions = (c.get("actorPermissions") as string[] | undefined) ?? [];
  const scoped = await getSupportScopedOrgIdsForTenant(db, actorId, parsed.data);
  const visibleRows = filterOrganizationsForSupportAgent(
    actorRole,
    rows,
    scoped,
    actorPermissions,
  );

  const composeNames = visibleRows.map((r) => dockerComposeProjectForOrgSlug(r.slug));
  const portMap = await internalPortsByComposeProject(db, composeNames);

  return c.json({
    organizations: visibleRows.map((row) =>
      serializeOrganizationRow(row, portMap.get(dockerComposeProjectForOrgSlug(row.slug)) ?? null),
    ),
    meta: {
      page,
      limit,
      returned: visibleRows.length,
      hasMore: rows.length === limit,
    },
  });
});

app.post("/tenants/:tenantId/organizations", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, parsed.data))
    .limit(1);
  if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

  const actorId = String(c.get("actorId") ?? "");
  const actorRole = String(c.get("actorRole") ?? "");
  if (actorRole === "support_agent") {
    const scoped = await getSupportScopedOrgIdsForTenant(db, actorId, parsed.data);
    if (scoped !== null) {
      return c.json(
        {
          error: "organization_access_create_denied",
          message:
            "Your account is scoped to specific organizations on this tenant. Ask a super admin to create additional organizations or adjust your access scope.",
        },
        403,
      );
    }
  }

  let body: z.infer<typeof organizationCreateBody>;
  try {
    body = organizationCreateBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      { error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) },
      400,
    );
  }

  const elig = await getTenantLicenseEligibility(db, parsed.data);
  if (elig === "license_expired") {
    return c.json(
      {
        error: "LICENSE_EXPIRED",
        message: "This tenant's license has expired. Renew or assign a new license before adding organizations.",
      },
      402,
    );
  }
  if (elig === "no_active_license") {
    return c.json(
      {
        error: "NO_ACTIVE_LICENSE",
        message: "Assign an active license to this tenant before adding organizations.",
      },
      402,
    );
  }

  const allowed = await canCreateOrganization(db, parsed.data);
  if (!allowed) {
    return c.json(
      {
        error: "PLAN_LIMIT_REACHED",
        message: "Upgrade your plan to add more organizations",
      },
      402,
    );
  }

  const existingOrgCountRows = await db
    .select({ count: count() })
    .from(organizations)
    .where(eq(organizations.tenantId, parsed.data));
  const existingOrgCount = Number(existingOrgCountRows[0]?.count ?? 0);
  const isFirstOrg = existingOrgCount === 0;

  const slug = await pickUniqueOrganizationSlug(db, body.name);
  const root = rootDomainForOrganizationSubdomain();
  const subdomain = `${slug}.${root}`.slice(0, 255);

  const [inserted] = await db
    .insert(organizations)
    .values({
      tenantId: parsed.data,
      name: body.name,
      slug,
      subdomain,
      status: "provisioning",
      isPrimary: isFirstOrg,
    })
    .returning();

  if (!inserted) {
    return c.json({ error: "organization_create_failed" }, 500);
  }

  void enqueueOrgProvisioning(db, inserted.id, parsed.data).catch((err) => {
    logger.error("organizations enqueueOrgProvisioning failed", err);
  });

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "org.created",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { organizationId: inserted.id, slug: inserted.slug, name: inserted.name },
  });

  return c.json(serializeOrganizationRow(inserted), 201);
});

app.get("/tenants/:tenantId/organizations/:orgId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const tenantParsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!tenantParsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  const orgParsed = z.string().uuid().safeParse(c.req.param("orgId"));
  if (!orgParsed.success) return c.json({ error: "orgId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, tenantParsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantParsed.data))
    .limit(1);
  if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgParsed.data), eq(organizations.tenantId, tenantParsed.data)))
    .limit(1);
  if (!row) return c.json({ error: "organization_not_found" }, 404);

  const actorId = String(c.get("actorId") ?? "");
  const actorRole = String(c.get("actorRole") ?? "");
  const scoped = await getSupportScopedOrgIdsForTenant(db, actorId, tenantParsed.data);
  if (!assertOrgInSupportScope(actorRole, orgParsed.data, scoped)) {
    return c.json(
      {
        error: "organization_access_denied",
        message: "You are not assigned to manage this organization for this tenant.",
      },
      403,
    );
  }

  const portMap = await internalPortsByComposeProject(db, [dockerComposeProjectForOrgSlug(row.slug)]);
  return c.json({
    organization: serializeOrganizationRow(
      row,
      portMap.get(dockerComposeProjectForOrgSlug(row.slug)) ?? null,
    ),
  });
});

app.patch("/tenants/:tenantId/organizations/:orgId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const tenantParsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!tenantParsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  const orgParsed = z.string().uuid().safeParse(c.req.param("orgId"));
  if (!orgParsed.success) return c.json({ error: "orgId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, tenantParsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantParsed.data))
    .limit(1);
  if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

  let body: z.infer<typeof organizationPatchBody>;
  try {
    body = organizationPatchBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      { error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) },
      400,
    );
  }

  if (body.name === undefined && body.status === undefined) {
    return c.json({ error: "no_fields_to_update" }, 400);
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(
      and(eq(organizations.id, orgParsed.data), eq(organizations.tenantId, tenantParsed.data)),
    )
    .limit(1);
  if (!org) return c.json({ error: "organization_not_found" }, 404);

  const actorId = String(c.get("actorId") ?? "");
  const actorRole = String(c.get("actorRole") ?? "");
  const scoped = await getSupportScopedOrgIdsForTenant(db, actorId, tenantParsed.data);
  if (!assertOrgInSupportScope(actorRole, orgParsed.data, scoped)) {
    return c.json(
      {
        error: "organization_access_denied",
        message: "You are not assigned to manage this organization for this tenant.",
      },
      403,
    );
  }

  if (body.status === "suspended" && org.isPrimary) {
    return c.json(
      {
        error: "CANNOT_SUSPEND_PRIMARY",
        message: "Cannot suspend the primary organization.",
      },
      400,
    );
  }

  const setVals: { name?: string; status?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (body.name !== undefined) setVals.name = body.name;
  if (body.status !== undefined) setVals.status = body.status;

  const [updated] = await db
    .update(organizations)
    .set(setVals)
    .where(and(eq(organizations.id, orgParsed.data), eq(organizations.tenantId, tenantParsed.data)))
    .returning();

  if (!updated) return c.json({ error: "organization_not_found" }, 404);

  if (body.status === "suspended") {
    const [childTenant] = await db
      .select({ id: tenants.id, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.slug, updated.slug))
      .limit(1);
    if (childTenant && childTenant.id !== tenantParsed.data) {
      await insertTenantJob(db, {
        type: "tenant.lifecycle",
        tenantId: childTenant.id,
        payload: {
          tenantId: childTenant.id,
          slug: childTenant.slug,
          command: "stop",
          status: "suspended",
        },
      });
    }
    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "org.suspended",
      targetTenantId: tenantParsed.data,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { organizationId: orgParsed.data, slug: updated.slug },
    });
  } else if (body.name !== undefined) {
    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "org.renamed",
      targetTenantId: tenantParsed.data,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { organizationId: orgParsed.data, name: updated.name, slug: updated.slug },
    });
  }

  const portMap = await internalPortsByComposeProject(db, [dockerComposeProjectForOrgSlug(updated.slug)]);
  return c.json({
    organization: serializeOrganizationRow(
      updated,
      portMap.get(dockerComposeProjectForOrgSlug(updated.slug)) ?? null,
    ),
  });
});

app.delete("/tenants/:tenantId/organizations/:orgId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const tenantParsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!tenantParsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  const orgParsed = z.string().uuid().safeParse(c.req.param("orgId"));
  if (!orgParsed.success) return c.json({ error: "orgId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, tenantParsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantParsed.data))
    .limit(1);
  if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

  const [org] = await db
    .select()
    .from(organizations)
    .where(
      and(eq(organizations.id, orgParsed.data), eq(organizations.tenantId, tenantParsed.data)),
    )
    .limit(1);
  if (!org) return c.json({ error: "organization_not_found" }, 404);

  const actorId = String(c.get("actorId") ?? "");
  const actorRole = String(c.get("actorRole") ?? "");
  const scopedDel = await getSupportScopedOrgIdsForTenant(db, actorId, tenantParsed.data);
  if (!assertOrgInSupportScope(actorRole, orgParsed.data, scopedDel)) {
    return c.json(
      {
        error: "organization_access_denied",
        message: "You are not assigned to manage this organization for this tenant.",
      },
      403,
    );
  }

  if (org.isPrimary) {
    return c.json(
      {
        error: "CANNOT_DELETE_PRIMARY",
        message: "Cannot delete the primary organization. Delete the tenant instead.",
      },
      400,
    );
  }

  const [childTenant] = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, org.slug))
    .limit(1);

  if (childTenant) {
    await db
      .update(tenantLifecycleJobs)
      .set({
        status: "dead",
        lastError: sql`'cancelled_by_user'`,
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantLifecycleJobs.tenantId, childTenant.id),
          eq(tenantLifecycleJobs.type, "tenant.provision"),
          or(
            eq(tenantLifecycleJobs.status, "pending"),
            eq(tenantLifecycleJobs.status, "running"),
          ),
        ),
      );

    const removeVolumes = true;
    await insertTenantJob(db, {
      type: "tenant.deprovision",
      tenantId: childTenant.id,
      payload: {
        tenantId: childTenant.id,
        removeVolumes,
        removeImages: false,
      },
    });
  }

  await db.delete(organizations).where(eq(organizations.id, orgParsed.data));

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "org.deleted",
    targetTenantId: tenantParsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { orgId: orgParsed.data, orgSlug: org.slug },
  });

  return c.json({ ok: true, deprovisioning: childTenant !== undefined });
});

app.get("/tenants/:tenantId/organization-access", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const tenantParsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!tenantParsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, tenantParsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantParsed.data))
    .limit(1);
  if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

  const grants = await db
    .select({
      id: ownerOrganizationAccess.id,
      ownerId: ownerOrganizationAccess.ownerId,
      organizationId: ownerOrganizationAccess.organizationId,
      createdAt: ownerOrganizationAccess.createdAt,
      ownerEmail: owners.email,
      ownerName: owners.name,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
    })
    .from(ownerOrganizationAccess)
    .innerJoin(owners, eq(owners.id, ownerOrganizationAccess.ownerId))
    .innerJoin(organizations, eq(organizations.id, ownerOrganizationAccess.organizationId))
    .where(
      and(
        eq(ownerOrganizationAccess.tenantId, tenantParsed.data),
        eq(organizations.tenantId, tenantParsed.data),
      ),
    );

  return c.json({
    grants: grants.map((g) => ({
      id: g.id,
      ownerId: g.ownerId,
      organizationId: g.organizationId,
      createdAt: g.createdAt.toISOString(),
      ownerEmail: g.ownerEmail,
      ownerName: g.ownerName,
      organizationName: g.organizationName,
      organizationSlug: g.organizationSlug,
    })),
  });
});

app.post("/tenants/:tenantId/organization-access", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const tenantParsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!tenantParsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, tenantParsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantParsed.data))
    .limit(1);
  if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

  let body: z.infer<typeof organizationAccessPostBody>;
  try {
    body = organizationAccessPostBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      { error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) },
      400,
    );
  }

  const [ownerRow] = await db
    .select({ id: owners.id, role: owners.role })
    .from(owners)
    .where(eq(owners.id, body.ownerId))
    .limit(1);
  if (!ownerRow) return c.json({ error: "owner_not_found" }, 404);
  if (ownerRow.role !== "support_agent") {
    return c.json(
      {
        error: "owner_must_be_support_agent",
        message: "Only support_agent accounts can be scoped to specific organizations.",
      },
      400,
    );
  }

  const [orgRow] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(eq(organizations.id, body.organizationId), eq(organizations.tenantId, tenantParsed.data)),
    )
    .limit(1);
  if (!orgRow) return c.json({ error: "organization_not_found" }, 404);

  const [dup] = await db
    .select({ id: ownerOrganizationAccess.id })
    .from(ownerOrganizationAccess)
    .where(
      and(
        eq(ownerOrganizationAccess.ownerId, body.ownerId),
        eq(ownerOrganizationAccess.organizationId, body.organizationId),
      ),
    )
    .limit(1);
  if (dup) {
    return c.json({ error: "organization_access_exists", message: "This grant already exists." }, 409);
  }

  const [inserted] = await db
    .insert(ownerOrganizationAccess)
    .values({
      ownerId: body.ownerId,
      tenantId: tenantParsed.data,
      organizationId: body.organizationId,
    })
    .returning();

  if (!inserted) return c.json({ error: "organization_access_create_failed" }, 500);

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "org.access_granted",
    targetTenantId: tenantParsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: {
      accessId: inserted.id,
      targetOwnerId: body.ownerId,
      organizationId: body.organizationId,
    },
  });

  return c.json(
    {
      grant: {
        id: inserted.id,
        ownerId: inserted.ownerId,
        organizationId: inserted.organizationId,
        createdAt: inserted.createdAt.toISOString(),
      },
    },
    201,
  );
});

app.delete("/tenants/:tenantId/organization-access/:accessId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const tenantParsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!tenantParsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  const accessParsed = z.string().uuid().safeParse(c.req.param("accessId"));
  if (!accessParsed.success) return c.json({ error: "accessId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, tenantParsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [row] = await db
    .select({ id: ownerOrganizationAccess.id })
    .from(ownerOrganizationAccess)
    .where(
      and(
        eq(ownerOrganizationAccess.id, accessParsed.data),
        eq(ownerOrganizationAccess.tenantId, tenantParsed.data),
      ),
    )
    .limit(1);
  if (!row) return c.json({ error: "organization_access_not_found" }, 404);

  await db
    .delete(ownerOrganizationAccess)
    .where(
      and(
        eq(ownerOrganizationAccess.id, accessParsed.data),
        eq(ownerOrganizationAccess.tenantId, tenantParsed.data),
      ),
    );

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "org.access_revoked",
    targetTenantId: tenantParsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { accessId: accessParsed.data },
  });

  return c.json({ ok: true });
});

app.delete("/tenants/:tenantId/finance-password", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const actorRole = c.get("actorRole");
  if (!canViewFinanceAdminPassword(actorRole)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, parsed.data))
    .limit(1);
  if (!row) return c.json({ error: "tenant_not_found" }, 404);

  await db
    .update(tenantDeployments)
    .set({ financeAdminPassword: null, updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, parsed.data));

  return c.json({ ok: true });
});

app.get("/tenants/:tenantId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const actorRole = String(c.get("actorRole") ?? "");

  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      adminEmail: tenants.adminEmail,
      adminFirstName: tenants.adminFirstName,
      adminLastName: tenants.adminLastName,
      ownerId: tenants.ownerId,
      planSlug: tenants.planSlug,
      modules: tenants.modules,
      createdAt: tenants.createdAt,
      deploymentStatus: tenantDeployments.status,
      composeProjectName: tenantDeployments.composeProjectName,
      internalPort: tenantDeployments.internalPort,
      posUrl: tenantDeployments.posUrl,
      posOrganizationId: tenantDeployments.posOrganizationId,
      financeTenantId: tenantDeployments.financeTenantId,
      financeDefaultWarehouseId: tenantDeployments.financeDefaultWarehouseId,
      financeWalkInCustomerId: tenantDeployments.financeWalkInCustomerId,
      financeCashAccountId: tenantDeployments.financeCashAccountId,
      financeCardAccountId: tenantDeployments.financeCardAccountId,
      financeAdminPasswordStored: tenantDeployments.financeAdminPassword,
      financeOrganizationId: organizations.financeOrganizationId,
      deploymentLastError: tenantDeployments.lastError,
      partialFailureKind: tenantDeployments.partialFailureKind,
      registrationCompletedAt: tenantDeployments.registrationCompletedAt,
      deploymentCreatedAt: tenantDeployments.createdAt,
      deploymentUpdatedAt: tenantDeployments.updatedAt,
      appName: tenantConfig.appName,
      logoUrl: tenantConfig.logoUrl,
      primaryColor: tenantConfig.primaryColor,
      branding: tenantConfig.branding,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .leftJoin(
      organizations,
      and(eq(organizations.tenantId, tenants.id), eq(organizations.isPrimary, true)),
    )
    .leftJoin(tenantConfig, eq(tenantConfig.tenantId, tenants.id))
    .where(eq(tenants.id, parsed.data))
    .limit(1);

  const row = rows[0];
  if (!row) return c.json({ error: "tenant_not_found" }, 404);

  const rawPosCredentials = await loadLatestPosBootstrapCredentials(db, row.id);
  const posBootstrapCredentials = rawPosCredentials
    ? {
        adminPinMasked: maskPinForDisplay(rawPosCredentials.adminPin),
        allRoles: rawPosCredentials.allRoles.map((roleRow) => ({
          role: roleRow.role,
          username: roleRow.username,
          pinMasked: maskPinForDisplay(roleRow.pin),
        })),
      }
    : null;

  const [latestProvisionJob] = await db
    .select({
      correlationId: tenantLifecycleJobs.correlationId,
      jobStatus: tenantLifecycleJobs.status,
    })
    .from(tenantLifecycleJobs)
    .where(
      and(
        eq(tenantLifecycleJobs.tenantId, parsed.data),
        eq(tenantLifecycleJobs.type, "tenant.provision"),
      ),
    )
    .orderBy(desc(tenantLifecycleJobs.createdAt))
    .limit(1);

  const root = rootDomainForOrganizationSubdomain();
  const publicUrl =
    root && row.slug
      ? `${apiConfig.publicBaseUrlScheme}://${row.slug}.${root}`
      : null;

  let financeAdminPassword: string | null = null;
  if (canViewFinanceAdminPassword(actorRole)) {
    financeAdminPassword = await resolveFinanceAdminPasswordForTenant(
      db,
      parsed.data,
      row.financeAdminPasswordStored,
    );
  }

  let resolvedPosUrl = row.posUrl;
  if (row.slug && row.posUrl) {
    const effective = await effectivePosUrl(row.slug, row.posUrl);
    if (effective && effective !== row.posUrl) {
      resolvedPosUrl = effective;
      await db
        .update(tenantDeployments)
        .set({ posUrl: effective, updatedAt: new Date() })
        .where(eq(tenantDeployments.tenantId, parsed.data));
    } else if (effective) {
      resolvedPosUrl = effective;
    }
  }

  return c.json({
    tenant: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      adminEmail: row.adminEmail,
      adminFirstName: row.adminFirstName,
      adminLastName: row.adminLastName,
      ownerId: row.ownerId,
      planSlug: row.planSlug,
      modules: parseTenantModules(row.modules),
      posOrganizationId: row.posOrganizationId,
      posBootstrapCredentials,
      latestProvision:
        latestProvisionJob?.correlationId
          ? {
              correlationId: latestProvisionJob.correlationId,
              jobStatus: latestProvisionJob.jobStatus,
            }
          : null,
      createdAt: row.createdAt.toISOString(),
      deployment:
        row.deploymentStatus === null
          ? null
          : {
              status: row.deploymentStatus,
              composeProjectName: row.composeProjectName,
              internalPort: row.internalPort,
              posUrl: resolvedPosUrl,
              publicUrl,
              financeTenantId: row.financeTenantId,
              financeOrganizationId: row.financeOrganizationId,
              financeDefaultWarehouseId: row.financeDefaultWarehouseId,
              financeWalkInCustomerId: row.financeWalkInCustomerId,
              financeCashAccountId: row.financeCashAccountId,
              financeCardAccountId: row.financeCardAccountId,
              financeAdminPassword,
              lastError: row.deploymentLastError,
              partialFailureKind: row.partialFailureKind,
              registrationCompletedAt: row.registrationCompletedAt
                ? row.registrationCompletedAt.toISOString()
                : null,
              createdAt: row.deploymentCreatedAt?.toISOString(),
              updatedAt: row.deploymentUpdatedAt?.toISOString(),
            },
      config:
        row.appName === null &&
        row.logoUrl === null &&
        row.primaryColor === null &&
        row.branding === null
          ? null
          : {
              appName: row.appName,
              logoUrl: row.logoUrl,
              primaryColor: row.primaryColor,
              branding: row.branding ?? null,
            },
    },
  });
});

app.post("/tenants/:tenantId/retry-provision", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [row] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      ownerId: tenants.ownerId,
      adminEmail: tenants.adminEmail,
      adminFirstName: tenants.adminFirstName,
      adminLastName: tenants.adminLastName,
      planSlug: tenants.planSlug,
      modules: tenants.modules,
      deploymentStatus: tenantDeployments.status,
      partialFailureKind: tenantDeployments.partialFailureKind,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, parsed.data))
    .limit(1);

  if (!row) return c.json({ error: "tenant_not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const retryModulesRaw = (body as { retryModules?: unknown }).retryModules;
  const retryModulesArr = Array.isArray(retryModulesRaw)
    ? retryModulesRaw.filter((m): m is string => typeof m === "string")
    : [];
  const retryPosOnly =
    (body as { retryPosOnly?: unknown }).retryPosOnly === true
    || (retryModulesArr.includes("pos") && retryModulesArr.length === 1);
  const retryWireOnly =
    (body as { retryWireOnly?: unknown }).retryWireOnly === true
    || (retryModulesArr.includes("wire") && retryModulesArr.length === 1);

  const failed =
    row.status === "failed" || row.deploymentStatus === "failed" || row.deploymentStatus === null;
  const partial = row.status === "partial";
  const stuckProvisioning = row.status === "provisioning";

  if (retryPosOnly) {
    if (!partial) {
      return c.json(
        {
          error: "tenant_not_partial",
          message: "POS-only retry is available when tenant status is partial (Finance active, POS failed).",
        },
        409,
      );
    }
  } else if (retryWireOnly) {
    if (!partial) {
      return c.json(
        {
          error: "tenant_not_partial",
          message: "Wire-only retry is available when tenant status is partial.",
        },
        409,
      );
    }
    if (row.partialFailureKind === "pos_failed") {
      return c.json(
        {
          error: "tenant_pos_failed",
          message: "Use POS-only retry when POS provisioning failed.",
        },
        409,
      );
    }
  } else if (stuckProvisioning) {
    const [runningJob] = await db
      .select({ id: tenantLifecycleJobs.id })
      .from(tenantLifecycleJobs)
      .where(
        and(
          eq(tenantLifecycleJobs.tenantId, row.id),
          eq(tenantLifecycleJobs.type, "tenant.provision"),
          eq(tenantLifecycleJobs.status, "running"),
        ),
      )
      .limit(1);
    if (runningJob) {
      return c.json(
        {
          error: "provision_job_running",
          message: "Provisioning is still running for this tenant.",
        },
        409,
      );
    }
  } else if (!failed) {
    return c.json(
      {
        error: "tenant_not_failed",
        message: "Retry is only available when provisioning failed or deployment is missing.",
      },
      409,
    );
  }

  const [latestProvisionJob] = await db
    .select({
      correlationId: tenantLifecycleJobs.correlationId,
      status: tenantLifecycleJobs.status,
    })
    .from(tenantLifecycleJobs)
    .where(
      and(
        eq(tenantLifecycleJobs.tenantId, row.id),
        eq(tenantLifecycleJobs.type, "tenant.provision"),
      ),
    )
    .orderBy(desc(tenantLifecycleJobs.createdAt))
    .limit(1);

  const correlationId =
    stuckProvisioning
    && latestProvisionJob?.correlationId
    && latestProvisionJob.status !== "completed"
      ? latestProvisionJob.correlationId
      : randomUUID();
  const log = (m: string) => {
    logger.info(m, { correlationId });
  };
  const acceptTrace = createProvisionTracer(db, correlationId, () => ({ slug: row.slug }), log);
  await acceptTrace.event("api", "HTTP 202 — retry provisioning accepted");

  await db
    .update(tenants)
    .set({ status: "provisioning" })
    .where(eq(tenants.id, row.id));
  await db
    .update(tenantDeployments)
    .set({
      status: "provisioning",
      lastError: null,
      partialFailureKind: null,
      updatedAt: new Date(),
    })
    .where(eq(tenantDeployments.tenantId, row.id));

  const job = await insertTenantJob(db, {
    type: "tenant.provision",
    tenantId: row.id,
    correlationId,
    payload: {
      slug: row.slug,
      name: row.name,
      ownerId: row.ownerId,
      adminEmail: row.adminEmail,
      adminFirstName: row.adminFirstName,
      adminLastName: row.adminLastName,
      planSlug: row.planSlug,
      modules: parseTenantModules(row.modules),
      stockixTenantId: row.id,
      provisionRequestedById: c.get("actorId") as string,
      ...(retryPosOnly ? { retryModules: ["pos"] as const } : {}),
      ...(retryWireOnly ? { retryModules: ["wire"] as const } : {}),
    },
  });

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.retry_provision",
    targetTenantId: row.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { correlationId, jobId: job?.id ?? null },
  });

  return c.json(
    {
      accepted: true,
      jobId: job?.id ?? null,
      correlationId,
      poll: `/tenants/provision-status/${correlationId}`,
      stream: `/tenants/provision-stream/${correlationId}`,
    },
    202,
  );
});

const tenantPatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    adminEmail: z.string().email().optional(),
    adminFirstName: z.string().min(1).max(100).optional(),
    adminLastName: z.string().min(1).max(100).optional(),
  })
  .strip();

app.patch("/tenants/:tenantId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  let body: z.infer<typeof tenantPatchBody>;
  try {
    body = tenantPatchBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      {
        error: "invalid_body",
        detail: e instanceof z.ZodError ? e.flatten() : String(e),
      },
      400,
    );
  }

  if (Object.keys(body).length === 0) {
    return c.json({ error: "no_fields_to_update" }, 400);
  }

  const [updated] = await db
    .update(tenants)
    .set(body)
    .where(eq(tenants.id, parsed.data))
    .returning();

  if (!updated) return c.json({ error: "tenant_not_found" }, 404);

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.update",
    targetTenantId: updated.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  const deployment = await db
    .select({
      status: tenantDeployments.status,
      composeProjectName: tenantDeployments.composeProjectName,
      internalPort: tenantDeployments.internalPort,
      lastError: tenantDeployments.lastError,
      registrationCompletedAt: tenantDeployments.registrationCompletedAt,
      createdAt: tenantDeployments.createdAt,
      updatedAt: tenantDeployments.updatedAt,
    })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, updated.id))
    .limit(1);

  const config = await db
    .select({
      appName: tenantConfig.appName,
      logoUrl: tenantConfig.logoUrl,
      primaryColor: tenantConfig.primaryColor,
      branding: tenantConfig.branding,
    })
    .from(tenantConfig)
    .where(eq(tenantConfig.tenantId, updated.id))
    .limit(1);

  return c.json({
    tenant: {
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      status: updated.status,
      adminEmail: updated.adminEmail,
      adminFirstName: updated.adminFirstName,
      adminLastName: updated.adminLastName,
      ownerId: updated.ownerId,
      planSlug: updated.planSlug,
      createdAt: updated.createdAt.toISOString(),
      deployment: deployment[0]
        ? {
            ...deployment[0],
            registrationCompletedAt: deployment[0].registrationCompletedAt
              ? deployment[0].registrationCompletedAt.toISOString()
              : null,
            createdAt: deployment[0].createdAt.toISOString(),
            updatedAt: deployment[0].updatedAt.toISOString(),
          }
        : null,
      config: config[0] ? { ...config[0], branding: config[0].branding ?? null } : null,
    },
  });
});

async function loadTenantForLifecycle(tenantId: string) {
  if (!db) return null;
  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      tenantStatus: tenants.status,
      deploymentStatus: tenantDeployments.status,
      composeProjectName: tenantDeployments.composeProjectName,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

/** Running stacks: full active or partial (Finance up, POS incomplete). */
function tenantCanStopOrSuspend(tenantStatus: string | null | undefined): boolean {
  return tenantStatus === "active" || tenantStatus === "partial";
}

app.post("/tenants/:tenantId/suspend", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const row = await loadTenantForLifecycle(parsed.data);
  if (!row) return c.json({ error: "tenant_not_found" }, 404);
  if (row.tenantStatus === "suspended" || row.deploymentStatus === "suspended") {
    return c.json({
      accepted: true,
      suspended: true,
      slug: row.slug,
      composeProject: row.composeProjectName,
      alreadySuspended: true,
    }, 200);
  }
  if (!tenantCanStopOrSuspend(row.tenantStatus)) {
    return c.json(
      {
        error: "tenant_not_active",
        message: `Tenant cannot be suspended (status=${row.tenantStatus ?? "unknown"}). Only active or partial tenants can be suspended.`,
        tenantStatus: row.tenantStatus ?? null,
        deploymentStatus: row.deploymentStatus ?? null,
      },
      409,
    );
  }
  const job = await insertTenantJob(db, {
    type: "tenant.lifecycle",
    tenantId: parsed.data,
    payload: { tenantId: parsed.data, slug: row.slug, command: "stop", status: "suspended" },
  });

  const childOrgs = await db
    .select({
      orgId: organizations.id,
      orgSlug: organizations.slug,
    })
    .from(organizations)
    .where(and(eq(organizations.tenantId, parsed.data), eq(organizations.status, "active")));

  for (const org of childOrgs) {
    const [childTenant] = await db
      .select({ id: tenants.id, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.slug, org.orgSlug))
      .limit(1);

    if (childTenant && childTenant.id !== parsed.data) {
      await insertTenantJob(db, {
        type: "tenant.lifecycle",
        tenantId: childTenant.id,
        payload: {
          tenantId: childTenant.id,
          slug: childTenant.slug,
          command: "stop",
          status: "suspended",
        },
      });
    }

    await db
      .update(organizations)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(organizations.id, org.orgId));
  }

  await applyTenantLicenseSuspend(
    db,
    parsed.data,
    "tenant_suspended",
    (message) => logger.info(message, { type: "tenant.suspend" }),
  );

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.suspend",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({
    accepted: true,
    suspended: true,
    slug: row.slug,
    composeProject: row.composeProjectName,
    jobId: job?.id ?? null,
  }, 202);
});

app.post("/tenants/:tenantId/impersonate", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) {
    return c.json({ error: "tenantId must be a UUID" }, 400);
  }
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const [row] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      adminEmail: tenants.adminEmail,
      tenantStatus: tenants.status,
      internalPort: tenantDeployments.internalPort,
      deploymentStatus: tenantDeployments.status,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, parsed.data))
    .limit(1);

  if (!row) return c.json({ error: "tenant_not_found" }, 404);
  if (row.tenantStatus !== "active") {
    return c.json(
      { error: "tenant_not_active", message: "Tenant must be active to impersonate" },
      409,
    );
  }
  if (row.deploymentStatus !== "active") {
    return c.json(
      { error: "tenant_not_active", message: "Tenant must be active to impersonate" },
      409,
    );
  }

  const port = row.internalPort == null ? null : Number(row.internalPort);
  if (port == null || Number.isNaN(port)) {
    return c.json({ error: "tenant_no_port" }, 503);
  }

  let adminPassword: string;
  try {
    adminPassword = bootstrapAdminPasswordFromTenantSlug(row.slug);
  } catch {
    return c.json(
      {
        error: "impersonate_bootstrap_failed",
        message: "Invalid deployment secret configuration",
      },
      500,
    );
  }

  const internalBase = `http://${apiConfig.tenantInternalHost}:${port}`;
  const signinRes = await fetch(`${internalBase}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      email: row.adminEmail,
      password: adminPassword,
    }),
  });

  let signinJson: unknown;
  try {
    signinJson = (await signinRes.json()) as unknown;
  } catch {
    return c.json(
      {
        error: "impersonate_signin_failed",
        message: "Could not authenticate to tenant Finance instance",
      },
      502,
    );
  }

  if (!signinRes.ok) {
    return c.json(
      {
        error: "impersonate_signin_failed",
        message: "Could not authenticate to tenant Finance instance",
      },
      502,
    );
  }

  const accessToken = parseSigninAccessToken(signinJson);
  if (!accessToken) {
    return c.json({ error: "impersonate_no_token" }, 502);
  }

  const origin = tenantFinanceBrowserOrigin(row.slug, port);
  if (!origin) {
    return c.json(
      {
        error: "tenant_no_public_url",
        message: "No public tenant URL is configured for this environment",
      },
      503,
    );
  }

  const impersonatePostUrl = `${origin}/api/auth/impersonate`;

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.impersonate",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { tenantSlug: row.slug, adminEmail: row.adminEmail },
  });

  return c.json({ impersonatePostUrl, token: accessToken });
});

app.post("/tenants/:tenantId/stop", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const row = await loadTenantForLifecycle(parsed.data);
  if (!row) return c.json({ error: "tenant_not_found" }, 404);
  if (!tenantCanStopOrSuspend(row.tenantStatus)) {
    return c.json(
      {
        error: "tenant_not_active",
        message: `Tenant cannot be stopped (status=${row.tenantStatus ?? "unknown"}). Only active or partial tenants can be stopped.`,
        tenantStatus: row.tenantStatus ?? null,
        deploymentStatus: row.deploymentStatus ?? null,
      },
      409,
    );
  }
  const job = await insertTenantJob(db, {
    type: "tenant.lifecycle",
    tenantId: parsed.data,
    payload: { tenantId: parsed.data, slug: row.slug, command: "stop", status: "stopped" },
  });

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.stop",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({
    accepted: true,
    stopped: true,
    slug: row.slug,
    composeProject: row.composeProjectName,
    jobId: job?.id ?? null,
  }, 202);
});

app.post("/tenants/:tenantId/reactivate", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const row = await loadTenantForLifecycle(parsed.data);
  if (!row) return c.json({ error: "tenant_not_found" }, 404);
  if (row.tenantStatus !== "suspended") {
    return c.json({ error: "tenant_not_suspended" }, 409);
  }
  const job = await insertTenantJob(db, {
    type: "tenant.lifecycle",
    tenantId: parsed.data,
    payload: { tenantId: parsed.data, slug: row.slug, command: "start", status: "active" },
  });

  const suspendedOrgs = await db
    .select({
      orgId: organizations.id,
      orgSlug: organizations.slug,
    })
    .from(organizations)
    .where(and(eq(organizations.tenantId, parsed.data), eq(organizations.status, "suspended")));

  for (const org of suspendedOrgs) {
    const [childTenant] = await db
      .select({ id: tenants.id, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.slug, org.orgSlug))
      .limit(1);

    if (childTenant && childTenant.id !== parsed.data) {
      await insertTenantJob(db, {
        type: "tenant.lifecycle",
        tenantId: childTenant.id,
        payload: {
          tenantId: childTenant.id,
          slug: childTenant.slug,
          command: "start",
          status: "active",
        },
      });
    }

    await db
      .update(organizations)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(organizations.id, org.orgId));
  }

  await applyTenantLicenseReactivate(
    db,
    parsed.data,
    (message) => logger.info(message, { type: "tenant.reactivate" }),
  );

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.reactivate",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({
    accepted: true,
    reactivated: true,
    slug: row.slug,
    composeProject: row.composeProjectName,
    jobId: job?.id ?? null,
  }, 202);
});

app.get("/tenants/:tenantId/events", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!(await tenantWithinOwnerScope(db, c, parsed.data))) {
    return c.json({ error: "tenant_not_found" }, 404);
  }
  const correlationId = c.req.query("correlationId");
  const tenantMatch = or(
    eq(tenantProvisionEvents.tenantId, parsed.data),
    eq(tenantProvisionEvents.parentTenantId, parsed.data),
  );
  const whereClause = correlationId
    ? and(tenantMatch, eq(tenantProvisionEvents.correlationId, correlationId))
    : tenantMatch;
  const rows = await db
    .select({
      id: tenantProvisionEvents.id,
      phase: tenantProvisionEvents.phase,
      level: tenantProvisionEvents.level,
      message: tenantProvisionEvents.message,
      meta: tenantProvisionEvents.meta,
      slug: tenantProvisionEvents.slug,
      parentTenantId: tenantProvisionEvents.parentTenantId,
      createdAt: tenantProvisionEvents.createdAt,
    })
    .from(tenantProvisionEvents)
    .where(whereClause)
    .orderBy(asc(tenantProvisionEvents.createdAt), asc(tenantProvisionEvents.id));

  return c.json({
    events: rows.map((row) => ({
      ...row,
      meta: row.meta ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

app.get("/search", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

  const query = c.req.query("q")?.trim() ?? "";
  if (query.length < 2) {
    return c.json({ tenants: [], licenses: [], owners: [] });
  }

  const pattern = `%${query}%`;
  const LIMIT = 5;

  const childOrgFilter = notExists(
    db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.slug, tenants.slug), ne(organizations.tenantId, tenants.id))),
  );

  const joinDeployments = eq(tenantDeployments.tenantId, tenants.id);

  const [tenantResults, licenseResults, ownerResults] = await Promise.all([
    db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        adminEmail: tenants.adminEmail,
        status: tenantDeployments.status,
      })
      .from(tenants)
      .leftJoin(tenantDeployments, joinDeployments)
      .where(
        and(
          childOrgFilter,
          or(
            ilike(tenants.name, pattern),
            ilike(tenants.slug, pattern),
            ilike(tenants.adminEmail, pattern),
          )!,
        ),
      )
      .orderBy(desc(tenants.createdAt))
      .limit(LIMIT),

    db
      .select({
        id: licenses.id,
        licenseKey: licenses.licenseKey,
        planSlug: licenses.planSlug,
        status: licenses.status,
        tenantSlug: tenants.slug,
      })
      .from(licenses)
      .leftJoin(tenants, eq(tenants.id, licenses.tenantId))
      .where(
        or(
          ilike(licenses.licenseKey, pattern),
          ilike(licenses.planSlug, pattern),
          ilike(tenants.slug, pattern),
        )!,
      )
      .orderBy(desc(licenses.createdAt))
      .limit(LIMIT),

    db
      .select({
        id: owners.id,
        name: owners.name,
        email: owners.email,
        role: owners.role,
      })
      .from(owners)
      .where(or(ilike(owners.name, pattern), ilike(owners.email, pattern))!)
      .limit(LIMIT),
  ]);

  return c.json({
    tenants: tenantResults.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      adminEmail: t.adminEmail,
      status: t.status ?? null,
    })),
    licenses: licenseResults.map((l) => ({
      id: l.id,
      licenseKey: l.licenseKey,
      planSlug: l.planSlug,
      status: l.status,
      tenantSlug: l.tenantSlug ?? null,
    })),
    owners: ownerResults.map((o) => ({
      id: o.id,
      name: o.name,
      email: o.email,
      role: o.role,
    })),
  });
});
}
