import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { rm } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { apiConfig } from "@repo/config";
import { publicConfig } from "@repo/config/public";
import {
  createDb,
} from "@repo/db";
import { ROLES } from "@repo/shared/roles";
import { ROLE_RANK, type Role } from "@repo/shared/roles";

import {
  adminAuditLog,
  apiIdempotencyKeys,
  apiKeys,
  blacklistedFingerprints,
  licenseActivations,
  licenses,
  organizations,
  owners,
  ownerOrganizationAccess,
  plans,
  tenantConfig,
  tenantDeployments,
  tenantLifecycleJobs,
  tenants,
  tenantProvisionEvents,
} from "@repo/db/schema";
import {
  asc,
  desc,
  eq,
  and,
  or,
  isNotNull,
  sql,
  count,
  gte,
  lte,
  ilike,
  inArray,
  isNull,
  ne,
  notExists,
  type SQL,
} from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { execa } from "execa";
import { z } from "zod";
import { requiredApiRole } from "./middleware/rbac.js";
import { logAudit } from "./audit.js";
import { handleAuditLogList } from "./routes/audit-log.js";
import { registerNotificationsApi } from "./routes/notifications.js";
import {
  notifyJobLifecycle,
  notifyModuleAdded,
  notifyProvisionOutcome,
} from "./notification-helpers.js";
import { generateLicenseKey, getActiveLicenseForTenant, getPlanLimits } from "./license-utils.js";
import { DEFAULT_GRACE_PERIOD_DAYS } from "./license-constants.js";
import { registerLicenseApi } from "./license-http.js";
import { registerTenantFinanceUsersApi } from "./finance-users-http.js";
import {
  readFinanceTenantIdFromProvisionEvents,
  resolveAndPersistFinanceTenantId,
} from "./finance-tenant-resolve.js";
import { registerPosProxyRoutes } from "./routes/pos-proxy-http.js";
import { registerPosCredentialsRoutes } from "./pos-credentials-http.js";
import { effectivePosUrl } from "./pos-public-url.js";
import { registerTenantModulesRoutes } from "./tenant-modules-http.js";
import { registerPmsProxyRoutes } from "./routes/pms-proxy-http.js";
import { syncFinanceLicenseForStockixTenant } from "./finance-license.client.js";
import { sendOwnerInviteEmail, sendTenantWelcomeEmail } from "./mail/send.js";

import {
  createProvisionTracer,
  type ProvisionEventPayload,
} from "./provision-trace.js";
import { buildAuthRoutes } from "./routes/auth/index.js";
import { enqueueOrgProvisioning } from "./org-provision.js";
import {
  assertOrgInSupportScope,
  filterOrganizationsForSupportAgent,
  getSupportScopedOrgIdsForTenant,
} from "./org-access-scope.js";
import { canCreateOrganization, getTenantLicenseEligibility } from "./plan-limits.js";
import { insertTenantJob, listTenantJobs } from "./services/tenant-jobs.js";
import {
  parseTenantModules,
  serializeTenantModules,
  type StockixModule,
} from "./services/auth/stockix-product-token.js";

const stockixModuleZod = z.enum(["accounting", "pos", "pms", "chat"]);
import { validateOwnerSession } from "./services/auth/session-validation.js";
import { verifySessionToken } from "./services/auth/tokens.js";
import {
  findActiveApiKeyByRaw,
  generateApiKeyMaterial,
  scheduleApiKeyLastUsedTouch,
} from "./services/api-keys.js";
import {
  getTenantReadiness,
  invalidateTenantReadinessCache,
} from "./provisioning/readiness-engine.js";
import { securityHeadersMiddleware } from "./middleware/security-headers.js";

const databaseUrl = apiConfig.databaseUrl;
const db = databaseUrl ? createDb(databaseUrl) : null;

type DbClient = NonNullable<typeof db>;

const organizationCreateBody = z.object({
  name: z.string().min(1).max(100),
});

const organizationPatchBody = z
  .object({
    name: z.string().min(1).max(100).optional(),
    status: z.enum(["suspended"]).optional(),
  })
  .strip();

const organizationAccessPostBody = z.object({
  ownerId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

function rootDomainForOrganizationSubdomain(): string {
  const fromEnv = process.env.NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  const fromApi = apiConfig.rootDomain;
  if (typeof fromApi === "string" && fromApi.trim().length > 0) {
    return fromApi.trim();
  }
  return "localhost";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/** Same derivation as `CryptoTenantSecretGenerator.bootstrapAdminPassword(tenantKey)`. */
function bootstrapAdminPasswordFromTenantSlug(slug: string): string {
  const key = slug.trim();
  if (key.length === 0) {
    throw new Error("bootstrapAdminPassword requires non-empty tenant slug");
  }
  const secretHex = apiConfig.deploymentSecretKey;
  const hmacKey = Buffer.from(secretHex, "hex");
  return createHmac("sha256", hmacKey).update(`bootstrap:${key}`, "utf8").digest("base64url");
}

function parseSigninAccessToken(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const accessToken =
    readNonEmptyString(body.accessToken) ??
    readNonEmptyString(body.access_token) ??
    readNonEmptyString(body.token);
  return accessToken ?? null;
}

/** Mirrors `apps/dashboard/lib/tenant-url.ts` for the browser origin of a tenant Finance stack. */
function tenantFinanceBrowserOrigin(slug: string, internalPort: number | null): string | null {
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

async function pickUniqueOrganizationSlug(dbClient: DbClient, name: string): Promise<string> {
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
function dockerComposeProjectForOrgSlug(slug: string): string {
  return `stockix-${slug.replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}`;
}

async function internalPortsByComposeProject(
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

function serializeOrganizationRow(
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
    provisioningError: row.provisioningError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publicUrl,
  };
}

function rowToProvisionPayload(
  row: typeof tenantProvisionEvents.$inferSelect,
): ProvisionEventPayload {
  return {
    id: row.id,
    correlationId: row.correlationId,
    slug: row.slug ?? null,
    tenantId: row.tenantId ?? null,
    parentTenantId: row.parentTenantId ?? null,
    deploymentId: row.deploymentId ?? null,
    phase: row.phase,
    level: row.level,
    message: row.message,
    meta: row.meta ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadProvisionEventsJson(correlationId: string) {
  if (!db) return [];
  const rows = await db
    .select({
      id: tenantProvisionEvents.id,
      phase: tenantProvisionEvents.phase,
      level: tenantProvisionEvents.level,
      message: tenantProvisionEvents.message,
      meta: tenantProvisionEvents.meta,
      createdAt: tenantProvisionEvents.createdAt,
    })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .orderBy(
      asc(tenantProvisionEvents.createdAt),
      asc(tenantProvisionEvents.id),
    )
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    phase: r.phase,
    level: r.level,
    message: r.message,
    meta: r.meta ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    /** When set, RBAC uses this rank instead of the owner's DB role (API key auth → read_only). */
    actorEffectiveRole?: string;
    apiKeyId?: string;
    requestId: string;
    requestStartMs: number;
  };
};

const app = new Hono<ApiEnv>();
const platformApiSecret = apiConfig.platformApiSecret;
const workerSecret = apiConfig.workerSecret;
apiConfig.validateRequiredEnv();

// In-memory cache for one-time admin passwords (fast path during provisioning).
// Passwords are also persisted encrypted on tenant_deployments.finance_admin_password.
// Cache TTL is 15 minutes; GET /tenants/:id reads the DB column when authorized.
const PROVISION_PASSWORD_TTL_MS = 15 * 60 * 1000;
const provisionPasswordCache = new Map<string, { password: string; expiresAt: number }>();
type PosDefaultCredentialsPayload = {
  adminPin: string;
  allRoles: { role: string; username: string; pin: string }[];
};
const provisionPosCredentialsCache = new Map<
  string,
  { credentials: PosDefaultCredentialsPayload; expiresAt: number }
>();
const PROVISION_STUCK_AFTER_MS = 10 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 30 * 1000;

function encryptProvisionSecret(plaintext: string): string {
  const key = Buffer.from(apiConfig.deploymentSecretKey, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptProvisionSecret(ciphertext: string): string | null {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") return null;
    const key = Buffer.from(apiConfig.deploymentSecretKey, "hex");
    const iv = Buffer.from(parts[2]!, "base64url");
    const tag = Buffer.from(parts[3]!, "base64url");
    const data = Buffer.from(parts[4]!, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function maskPinForDisplay(pin: string): string {
  const trimmed = pin.trim();
  if (trimmed.length <= 2) return "••••";
  return `${trimmed.slice(0, 2)}${"•".repeat(Math.min(trimmed.length - 2, 8))}`;
}

async function loadLatestPosBootstrapCredentials(
  tenantId: string,
): Promise<PosDefaultCredentialsPayload | null> {
  if (!db) return null;
  const secretRows = await db
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
    const decrypted = decryptProvisionSecret(cipher);
    if (!decrypted) continue;
    try {
      return JSON.parse(decrypted) as PosDefaultCredentialsPayload;
    } catch {
      continue;
    }
  }
  return null;
}

async function loadLatestFinanceAdminPasswordFromEvents(
  tenantId: string,
): Promise<string | null> {
  if (!db) return null;
  const secretRows = await db
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
    const decrypted = decryptProvisionSecret(cipher);
    if (decrypted) return decrypted;
  }
  return null;
}

function decryptFinanceAdminPasswordStored(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const decrypted = decryptProvisionSecret(stored);
  if (decrypted) return decrypted;
  if (!stored.startsWith("enc:")) return stored;
  return null;
}

async function resolveFinanceAdminPasswordForTenant(
  tenantId: string,
  stored: string | null | undefined,
): Promise<string | null> {
  const fromDb = decryptFinanceAdminPasswordStored(stored);
  if (fromDb) return fromDb;
  return loadLatestFinanceAdminPasswordFromEvents(tenantId);
}

function canViewFinanceAdminPassword(actorRole: string): boolean {
  const rank = ROLE_RANK[actorRole as Role];
  return Number.isFinite(rank) && rank >= ROLE_RANK.support_agent;
}

function composeProjectFromSlug(slug: string): string {
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

async function scrubTenantRuntimeArtifacts(slug: string): Promise<void> {
  const project = composeProjectFromSlug(slug);
  await bestEffortDockerProjectCleanup(project);
  await bestEffortDockerProjectCleanup(`stockix-pos-${slug}`);
  await rm(`${apiConfig.tenantEnvRoot}/${slug}`, { recursive: true, force: true }).catch(() => undefined);
  await rm(`${apiConfig.traefikDynamicDir}/tenant-${slug}.yml`, { force: true }).catch(() => undefined);
  await rm(`${apiConfig.traefikDynamicDir}/tenant-pos-${slug}.yml`, { force: true }).catch(
    () => undefined,
  );
}

function purgeProvisionCaches(correlationIds: string[]): void {
  for (const correlationId of correlationIds) {
    provisionPasswordCache.delete(correlationId);
    provisionPosCredentialsCache.delete(correlationId);
    invalidateTenantReadinessCache(correlationId);
  }
}

async function appendProvisionEventSafe(args: {
  correlationId: string;
  phase: string;
  level?: "info" | "warn" | "error";
  message: string;
  slug?: string | null;
  tenantId?: string | null;
  meta?: Record<string, unknown>;
}) {
  if (!db) return;
  await db.insert(tenantProvisionEvents).values({
    correlationId: args.correlationId,
    phase: args.phase,
    level: args.level ?? "info",
    message: args.message,
    slug: args.slug ?? null,
    tenantId: args.tenantId ?? null,
    meta: args.meta ?? null,
  });
  invalidateTenantReadinessCache(args.correlationId);
}

async function emitMetric(name: string, value: number, tags: Record<string, string | number>) {
  const endpoint = apiConfig.metricsEndpoint;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiConfig.metricsAuthToken ? { Authorization: `Bearer ${apiConfig.metricsAuthToken}` } : {}),
    },
    body: JSON.stringify({
      source: "api",
      name,
      value,
      tags,
      ts: new Date().toISOString(),
    }),
  }).catch((error) => {
    console.error("[metrics] failed to emit API metric", error instanceof Error ? error.message : String(error));
  });
}

function emitInternalJobAudit(c: { get: (key: "requestId") => string }, action: string, details: Record<string, unknown>) {
  const requestId = c.get("requestId");
  console.log(
    JSON.stringify({
      level: "info",
      type: "internal_job_audit",
      action,
      requestId,
      ...details,
      ts: new Date().toISOString(),
    }),
  );
}

function readCookie(req: Request, name: string): string {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const segments = cookieHeader.split(";").map((segment) => segment.trim());
  const pair = segments.find((segment) => segment.startsWith(`${name}=`));
  if (!pair) return "";
  return decodeURIComponent(pair.slice(name.length + 1));
}

if (db) {
  app.route("/auth", buildAuthRoutes(db));
}

function isTransientDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lowered = message.toLowerCase();
  return (
    lowered.includes("too many clients") ||
    lowered.includes("connection terminated") ||
    lowered.includes("timeout") ||
    lowered.includes("econnreset") ||
    lowered.includes("remaining connection slots are reserved")
  );
}

app.onError((err, c) => {
  console.error("[api]", err);
  if (isTransientDbError(err)) {
    return c.json(
      { error: "service_unavailable", message: "Database temporarily unavailable. Retry shortly." },
      503,
    );
  }
  return c.json({ error: "internal_error", message: "An unexpected error occurred." }, 500);
});

const rootDomain = apiConfig.rootDomain;

app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      const allowed = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        ...(rootDomain
          ? [`https://${rootDomain}`, `http://${rootDomain}`, `https://www.${rootDomain}`]
          : []),
        ...(apiConfig.corsOrigins ?? []),
      ];
      if (allowed.includes(origin)) return origin;
      if (!rootDomain) return null;
      const isSubdomain =
        origin.endsWith(`.${rootDomain}`) ||
        origin === `https://${rootDomain}` ||
        origin === `http://${rootDomain}`;
      return isSubdomain ? origin : null;
    },
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }),
);

app.use("/*", securityHeadersMiddleware);

app.use("/*", async (c, next) => {
  const requestId = c.req.header("x-request-id")
    ?? c.req.header("x-correlation-id")
    ?? randomUUID();
  c.set("requestId", requestId);
  c.set("requestStartMs", Date.now());
  c.header("x-request-id", requestId);
  const startedAt = Date.now();
  await next();
  const latencyMs = Date.now() - startedAt;
  const isClaimPoll = c.req.method === "POST" && c.req.path === "/internal/jobs/claim";
  if (!isClaimPoll) {
    console.log(
      JSON.stringify({
        level: "info",
        type: "http_request",
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        latencyMs,
      }),
    );
  }
  await emitMetric("api.request.latency_ms", latencyMs, {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
  });
});

app.use("/*", async (c, next) => {
  const pubPath = c.req.path;
  const pubMethod = c.req.method.toUpperCase();
  if (pubPath === "/health") {
    await next();
    return;
  }
  if (pubMethod === "GET" && pubPath.startsWith("/public/tenant-orgs/")) {
    await next();
    return;
  }
  if (
    pubMethod === "POST"
    && (pubPath === "/licenses/activate" || pubPath === "/licenses/verify-offline")
  ) {
    await next();
    return;
  }
  // Internal job routes are protected by WORKER_SECRET, not PLATFORM_API_SECRET.
  // A dashboard operator must not be able to reach these endpoints (CRIT-01).
  if (
    c.req.path.startsWith("/internal/jobs")
    || c.req.path.startsWith("/internal/organizations")
  ) {
    const auth = c.req.header("Authorization") ?? "";
    if (!workerSecret || auth !== `Bearer ${workerSecret}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
    return;
  }
  if (!platformApiSecret) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const auth = c.req.header("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  if (auth === `Bearer ${platformApiSecret}`) {
    await next();
    return;
  }
  if (bearer.startsWith("sk_live_")) {
    await next();
    return;
  }
  // Allow valid owner session cookie as fallback for dashboard-origin requests.
  const cookieToken = readCookie(c.req.raw, "stockix-session");
  if (cookieToken) {
    const session = await verifySessionToken(cookieToken);
    if (session) {
      await next();
      return;
    }
  }
  return c.json({ error: "unauthorized" }, 401);
});

app.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;
  if (
    path === "/health"
    || path.startsWith("/auth")
    || path.startsWith("/internal/jobs")
    || path.startsWith("/internal/organizations")
  ) {
    await next();
    return;
  }
  if (method === "GET" && path.startsWith("/public/tenant-orgs/")) {
    await next();
    return;
  }
  if (method === "POST" && (path === "/licenses/activate" || path === "/licenses/verify-offline")) {
    await next();
    return;
  }
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

  const cookieToken = readCookie(c.req.raw, "stockix-session");
  const headerToken = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  if (cookieToken) {
    const session = await verifySessionToken(cookieToken);
    if (!session) return c.json({ error: "unauthorized_actor" }, 401);
    const sessionCheck = await validateOwnerSession(db, {
      ownerId: session.sub,
      role: session.role,
      sessionVersion: session.sessionVersion,
    });
    if (!sessionCheck.success) {
      return c.json({ error: "forbidden_actor" }, 403);
    }
    c.set("actorId", session.sub);
    c.set("actorRole", session.role);
    await next();
    return;
  }

  if (headerToken.startsWith("sk_live_")) {
    const resolved = await findActiveApiKeyByRaw(db, headerToken);
    if (!resolved) {
      return c.json({ error: "unauthorized_actor" }, 401);
    }
    const [ownerRow] = await db
      .select({ id: owners.id, status: owners.status })
      .from(owners)
      .where(eq(owners.id, resolved.ownerId))
      .limit(1);
    if (!ownerRow || ownerRow.status !== "active") {
      return c.json({ error: "forbidden_actor" }, 403);
    }
    c.set("actorId", resolved.ownerId);
    c.set("actorRole", "read_only");
    c.set("actorEffectiveRole", "read_only");
    c.set("apiKeyId", resolved.keyId);
    scheduleApiKeyLastUsedTouch(db, resolved.keyId);
    await next();
    return;
  }

  // Platform secret: same gate as first middleware, but actor must be a real owners.id
  // (RBAC loads owners by actorId; logAudit requires UUID and FK references owners).
  if (platformApiSecret && headerToken === platformApiSecret) {
    const [platformActor] = await db
      .select({ id: owners.id })
      .from(owners)
      .where(and(eq(owners.role, ROLES[0]), eq(owners.status, "active")))
      .orderBy(asc(owners.createdAt))
      .limit(1);
    if (!platformActor) {
      return c.json(
        {
          error: "platform_actor_unresolved",
          message: "No active super_admin owner for platform API secret auth",
        },
        503,
      );
    }
    c.set("actorId", platformActor.id);
    c.set("actorRole", "super_admin");
    await next();
    return;
  }

  if (!headerToken) {
    return c.json({ error: "unauthorized_actor" }, 401);
  }

  const session = await verifySessionToken(headerToken);
  if (!session) return c.json({ error: "unauthorized_actor" }, 401);
  const sessionCheck = await validateOwnerSession(db, {
    ownerId: session.sub,
    role: session.role,
    sessionVersion: session.sessionVersion,
  });
  if (!sessionCheck.success) {
    return c.json({ error: "forbidden_actor" }, 403);
  }
  c.set("actorId", session.sub);
  c.set("actorRole", session.role);
  await next();
});

const IDEMPOTENCY_TTL_HOURS = 24;
app.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;
  const isPrivilegedWrite =
    ["POST", "PATCH", "DELETE"].includes(method) &&
    (path.startsWith("/owners") || path.startsWith("/tenants"));
  if (!isPrivilegedWrite) return next();
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

  const actorId = c.get("actorId") as string | undefined;
  if (!actorId) {
    return c.json({ error: "unauthorized_actor" }, 401);
  }
  const idempotencyKey = c.req.header("Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey) {
    return c.json(
      { error: "idempotency_key_required", message: "Missing Idempotency-Key header" },
      400,
    );
  }

  const requestBody = await c.req.raw.clone().text();
  const requestHash = createHash("sha256")
    .update(`${method}:${path}:${requestBody}`)
    .digest("hex");

  await db
    .delete(apiIdempotencyKeys)
    .where(sql`${apiIdempotencyKeys.expiresAt} < now()`)
    .catch((error) => {
      console.error("[idempotency] prune failed", error instanceof Error ? error.message : String(error));
    });

  const existingRows = await db
    .select({
      id: apiIdempotencyKeys.id,
      requestHash: apiIdempotencyKeys.requestHash,
      statusCode: apiIdempotencyKeys.statusCode,
      responseBody: apiIdempotencyKeys.responseBody,
    })
    .from(apiIdempotencyKeys)
    .where(and(eq(apiIdempotencyKeys.actorId, actorId), eq(apiIdempotencyKeys.key, idempotencyKey)))
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return c.json(
        {
          error: "idempotency_key_conflict",
          message: "Idempotency-Key was already used with a different request payload",
        },
        409,
      );
    }
    const body =
      existing.responseBody && typeof existing.responseBody === "object"
        ? existing.responseBody
        : { ok: true };
    return c.body(JSON.stringify(body), existing.statusCode as never, {
      "content-type": "application/json",
    });
  }

  await next();

  let responseText = "";
  try {
    responseText = await c.res.clone().text();
  } catch {
    responseText = "";
  }
  let parsedResponse: Record<string, unknown> = {};
  try {
    parsedResponse = responseText
      ? (JSON.parse(responseText) as Record<string, unknown>)
      : {};
  } catch {
    parsedResponse = { raw: responseText };
  }

  await db
    .insert(apiIdempotencyKeys)
    .values({
      key: idempotencyKey,
      actorId,
      method,
      path,
      requestHash,
      statusCode: c.res.status,
      responseBody: parsedResponse,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
    })
    .catch((error) => {
      console.error("[idempotency] persist response failed", error instanceof Error ? error.message : String(error));
    });
});

app.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;
  const minRole = requiredApiRole(path, method);
  if (!minRole) return next();
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

  const actorId = c.get("actorId") as string | undefined;
  if (!actorId) return c.json({ error: "unauthorized_actor" }, 401);

  const rows = await db
    .select({
      id: owners.id,
      role: owners.role,
      status: owners.status,
      sessionVersion: owners.sessionVersion,
    })
    .from(owners)
    .where(eq(owners.id, actorId))
    .limit(1);
  const actor = rows[0];
  if (!actor || actor.status !== "active") {
    return c.json({ error: "forbidden_actor" }, 403);
  }
  if (!(actor.role in ROLE_RANK)) {
    return c.json({ error: "forbidden_role" }, 403);
  }
  const effectiveRole = (c.get("actorEffectiveRole") as Role | undefined) ?? (actor.role as Role);
  if (!(effectiveRole in ROLE_RANK)) {
    return c.json({ error: "forbidden_role" }, 403);
  }
  const actorRank = ROLE_RANK[effectiveRole];
  if (actorRank < ROLE_RANK[minRole]) {
    return c.json({ error: "forbidden_role" }, 403);
  }
  await next();
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/public/tenant-orgs/:tenantId", async (c) => {
  const tenantIdParsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!tenantIdParsed.success) {
    return c.json({ error: "INVALID_TENANT_ID" }, 400);
  }
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const tenantId = tenantIdParsed.data;
  const rows = await db
    .select()
    .from(organizations)
    .where(
      and(eq(organizations.tenantId, tenantId), eq(organizations.status, "active")),
    )
    .orderBy(desc(organizations.isPrimary), asc(organizations.createdAt));
  const composeNames = rows.map((r) => dockerComposeProjectForOrgSlug(r.slug));
  const portMap = await internalPortsByComposeProject(db, composeNames);
  return c.json({
    organizations: rows.map((row) => {
      const full = serializeOrganizationRow(
        row,
        portMap.get(dockerComposeProjectForOrgSlug(row.slug)) ?? null,
      );
      return {
        id: full.id,
        name: full.name,
        slug: full.slug,
        subdomain: full.subdomain,
        status: full.status,
        isPrimary: full.isPrimary,
        financeOrganizationId: full.financeOrganizationId,
        createdAt: full.createdAt,
        publicUrl: full.publicUrl,
      };
    }),
  });
});

app.post("/internal/jobs/claim", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
  if (!workerId) {
    return c.json({ error: "worker_id_required" }, 400);
  }
  const staleLeaseMs = 5 * 60 * 1000;
  const staleBefore = new Date(Date.now() - staleLeaseMs);
  const staleBeforeIso = staleBefore.toISOString();
  const staleProvisionAlerts: Array<{
    tenantId: string;
    exhausted: boolean;
    correlationId: string | null;
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
                completedAt: new Date(),
                updatedAt: new Date(),
              }
            : {
                status: nextStatus,
                attempts: nextAttempts,
                lastError: sql`'worker_stale_lease_reclaimed'`,
                claimedAt: null,
                claimedBy: null,
                runAt: new Date(),
                completedAt: null,
                updatedAt: new Date(),
              },
        )
        .where(eq(tenantLifecycleJobs.id, staleJob.id));
      if (staleJob.type === "tenant.provision" && staleJob.tenantId) {
        await tx
          .update(tenants)
          .set({
            status: "failed",
          })
          .where(eq(tenants.id, staleJob.tenantId));
        await tx
          .update(tenantDeployments)
          .set({
            status: "failed",
            lastError: "worker_stale_lease_reclaimed",
            updatedAt: new Date(),
          })
          .where(eq(tenantDeployments.tenantId, staleJob.tenantId));
        staleProvisionAlerts.push({
          tenantId: staleJob.tenantId,
          exhausted,
          correlationId: staleJob.correlationId ?? null,
        });
      }
    }

    const [pending] = await tx
      .select({ id: tenantLifecycleJobs.id })
      .from(tenantLifecycleJobs)
      .where(
        and(
          eq(tenantLifecycleJobs.status, "pending"),
          sql`${tenantLifecycleJobs.attempts} < ${tenantLifecycleJobs.maxAttempts}`,
          sql`${tenantLifecycleJobs.runAt} <= now()`,
        ),
      )
      .orderBy(sql`${tenantLifecycleJobs.priority} DESC`, asc(tenantLifecycleJobs.createdAt))
      .limit(1);
    if (!pending?.id) return null;

    const [updated] = await tx
      .update(tenantLifecycleJobs)
      .set({
        status: "running",
        claimedAt: new Date(),
        claimedBy: workerId,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantLifecycleJobs.id, pending.id), eq(tenantLifecycleJobs.status, "pending")))
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
      notifyProvisionOutcome(db, {
        tenantId: alert.tenantId,
        finalStatus: "failed",
        correlationId: alert.correlationId,
        lastError: "worker_stale_lease_reclaimed",
      });
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
    })
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.id, jobId))
    .limit(1);
  if (!job) {
    return c.json({ cancelled: true, reason: "job_not_found" });
  }
  if (job.status !== "running") {
    return c.json({ cancelled: true, reason: `status=${job.status}` });
  }
  const lastErrorMessage =
    typeof job.lastError === "string"
      ? job.lastError
      : (job.lastError &&
          typeof job.lastError === "object" &&
          "message" in job.lastError &&
          typeof (job.lastError as { message?: unknown }).message === "string")
        ? String((job.lastError as { message: string }).message)
        : "";
  if (lastErrorMessage === "cancel_requested_by_user") {
    return c.json({ cancelled: true, reason: "cancel_requested_by_user" });
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
      financeOrganizationId: z.string().min(1).max(255),
    })
    .safeParse(body);

  if (!bodyParsed.success) {
    return c.json(
      { error: "VALIDATION_ERROR", detail: bodyParsed.error.flatten() },
      400,
    );
  }

  const [updated] = await db
    .update(organizations)
    .set({
      financeOrganizationId: bodyParsed.data.financeOrganizationId,
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
  if (workerId && currentJob.claimedBy && currentJob.claimedBy !== workerId) {
    return c.json({ error: "job_claim_mismatch" }, 409);
  }
  const [updated] = await db
    .update(tenantLifecycleJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      lastError: null,
      claimedAt: null,
      claimedBy: null,
      updatedAt: new Date(),
    })
    .where(and(eq(tenantLifecycleJobs.id, jobId), eq(tenantLifecycleJobs.status, "running")))
    .returning();
  if (!updated) return c.json({ error: "job_not_running" }, 409);
  // Store the one-time admin password in memory as a fast path.
  if (currentJob?.type === "tenant.provision" && currentJob.correlationId && oneTimeAdminPassword) {
    provisionPasswordCache.set(currentJob.correlationId, {
      password: oneTimeAdminPassword,
      expiresAt: Date.now() + PROVISION_PASSWORD_TTL_MS,
    });
    await appendProvisionEventSafe({
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
    await appendProvisionEventSafe({
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
    await appendProvisionEventSafe({
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

      await db
        .update(tenants)
        .set({ status: finalTenantStatus })
        .where(eq(tenants.id, targetTenantId));
      await db
        .update(tenantDeployments)
        .set({
          status: deploymentStatus,
          lastError: deploymentLastError,
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
            await db.insert(licenses).values({
              licenseKey,
              product: "platform",
              modules: modulesSerialized,
              planSlug,
              tenantId: targetTenantId,
              status: "active",
              activatedAt: new Date(),
              validFrom: new Date(),
              isPerpetual: true,
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
        console.error(
          "[provision] license assignment failed (non-fatal)",
          licenseErr instanceof Error ? licenseErr.message : String(licenseErr),
        );
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

        void syncFinanceLicenseForStockixTenant(db, {
          stockixTenantId: targetTenantId,
          financeTenantId: financeTenantIdFromResult,
        }).catch((err) => {
          console.error(
            "[provision] finance license sync failed (non-fatal)",
            err instanceof Error ? err.message : String(err),
          );
        });
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
            })
            .from(tenants)
            .where(eq(tenants.id, targetTenantId))
            .limit(1);
          if (!tenant?.adminEmail) return;

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

          if (oneTimeAdminPassword && provisionModules.includes("accounting")) {
            const { sendFinanceWelcomeEmail } = await import("./mail/send.js");
            await sendFinanceWelcomeEmail({
              to: tenant.adminEmail,
              tenantName: tenant.name,
              financeUrl,
              adminEmail: tenant.adminEmail,
              oneTimePassword: oneTimeAdminPassword,
              modules: provisionModules,
            });
          } else {
            await sendTenantWelcomeEmail({
              to: tenant.adminEmail,
              tenantName: tenant.name,
              organizationNumber:
                tenant.organizationNumber ??
                financeOrganizationIdFromResult ??
                "—",
              loginUrl: financeUrl,
            });
          }
        } catch (welcomeErr) {
          console.error(
            "[provision] welcome email failed (non-fatal)",
            welcomeErr instanceof Error ? welcomeErr.message : String(welcomeErr),
          );
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
      await appendProvisionEventSafe({
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
      await appendProvisionEventSafe({
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
      notifyModuleAdded(db, {
        tenantId: currentJob.tenantId,
        module: moduleFromPayload,
        correlationId: currentJob.correlationId,
      });
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
  const errorMessage = String((body as { error?: unknown }).error ?? "job_failed").slice(0, 4000);
  const noRetry = (body as { noRetry?: unknown }).noRetry === true;
  const requestId = c.get("requestId");
  const [updated] = await db.transaction(async (tx) => {
    const [job] = await tx
      .select({
        id: tenantLifecycleJobs.id,
        status: tenantLifecycleJobs.status,
        attempts: tenantLifecycleJobs.attempts,
        maxAttempts: tenantLifecycleJobs.maxAttempts,
        claimedBy: tenantLifecycleJobs.claimedBy,
      })
      .from(tenantLifecycleJobs)
      .where(eq(tenantLifecycleJobs.id, jobId))
      .limit(1);
    if (!job) return [];
    if (workerId && job.claimedBy && job.claimedBy !== workerId) {
      return [];
    }
    const nextAttempts = (job.attempts ?? 0) + 1;
    const maxAttempts = job.maxAttempts ?? 5;
    const exhausted = noRetry || nextAttempts >= maxAttempts;
    const retryDelayMs = Math.min(60_000, 2 ** Math.max(0, nextAttempts - 1) * 1000);
    const [next] = await tx
      .update(tenantLifecycleJobs)
      .set({
        status: exhausted ? "dead" : "pending",
        attempts: nextAttempts,
        lastError: sql`${errorMessage}`,
        runAt: exhausted ? new Date() : new Date(Date.now() + retryDelayMs),
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantLifecycleJobs.id, jobId), eq(tenantLifecycleJobs.status, "running")))
      .returning();
    return next ? [next] : [];
  });
  if (updated) {
    const attempts = Number(updated.attempts ?? 0);
    const maxAttempts = Number(updated.maxAttempts ?? 0);
    const exhausted = updated.status === "dead";
    await emitMetric(exhausted ? "worker.job.dead" : "worker.job.retry", 1, {
      requestId,
      jobId: updated.id,
      jobType: updated.type,
      attempts,
      maxAttempts,
      noRetry: noRetry ? 1 : 0,
    });
    emitInternalJobAudit(c, exhausted ? "job.dead" : "job.retry_scheduled", {
      jobId: updated.id,
      status: updated.status,
      attempts,
      maxAttempts,
      noRetry,
      workerId: workerId || null,
    });

    if (
      updated.status === "dead"
      && updated.type === "add_module"
      && updated.tenantId
    ) {
      await db
        .update(tenants)
        .set({ status: "active" })
        .where(eq(tenants.id, updated.tenantId));
    }

    if (
      updated.status === "dead"
      && (updated.type === "tenant.provision" || updated.type === "organization.provision")
      && updated.payload
      && typeof updated.payload === "object"
    ) {
      const p = updated.payload as Record<string, unknown>;
      const organizationIdForFail =
        typeof p.organizationId === "string" && z.string().uuid().safeParse(p.organizationId).success
          ? p.organizationId
          : null;
      if (organizationIdForFail) {
        await db
          .update(organizations)
          .set({
            status: "failed",
            provisioningError: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, organizationIdForFail));
      }
    }

    if (updated.status === "dead" && updated.type === "tenant.provision" && updated.tenantId) {
      notifyProvisionOutcome(db, {
        tenantId: updated.tenantId,
        finalStatus: "failed",
        correlationId: updated.correlationId,
        lastError: errorMessage,
      });
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

app.get("/owners", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const rows = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      status: owners.status,
      hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      mfaEnabled: owners.mfaEnabled,
      createdAt: owners.createdAt,
    })
    .from(owners);
  return c.json({ owners: rows });
});

const ownerBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
});
const ownerRoleSchema = z.enum(ROLES);

async function countSuperAdmins() {
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(owners)
    .where(
      and(
        eq(owners.role, "super_admin"),
        eq(owners.status, "active"),
        isNotNull(owners.passwordHash),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

function isActivatedSuperAdmin(owner: {
  role: string;
  status?: string | null;
  hasPassword?: boolean;
}): boolean {
  return (
    owner.role === "super_admin" &&
    owner.status === "active" &&
    Boolean(owner.hasPassword)
  );
}

app.post("/owners", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  let body: z.infer<typeof ownerBody>;
  try {
    body = ownerBody.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
  }
  const [row] = await db
    .insert(owners)
    .values({ email: body.email, name: body.name })
    .onConflictDoNothing()
    .returning({ id: owners.id, email: owners.email, name: owners.name, createdAt: owners.createdAt });
  if (!row) return c.json({ error: "email_already_exists" }, 409);
  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "owner.invite",
    targetOwnerId: row.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json({ owner: row }, 201);
});

const inviteBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: ownerRoleSchema,
});

app.post("/owners/invite", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  let body: z.infer<typeof inviteBody>;
  try {
    body = inviteBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      {
        error: "invalid_body",
        detail: e instanceof z.ZodError ? e.flatten() : String(e),
      },
      400,
    );
  }
  const existing = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.email, body.email))
    .limit(1);
  if (existing.length > 0) return c.json({ error: "email_already_exists" }, 409);

  const inviteToken = randomUUID();
  const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const [owner] = await db
    .insert(owners)
    .values({
      email: body.email,
      name: body.name,
      role: body.role,
      inviteToken,
      inviteTokenExpiresAt,
      invitedById: (c.get("actorId") as string | undefined) ?? null,
    })
    .returning({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
    });
  if (!owner) return c.json({ error: "failed_to_create_invite" }, 500);
  const dashboardUrl = apiConfig.dashboardUrl?.replace(/\/+$/, "");
  const inviteUrl = `${dashboardUrl ?? "http://localhost:3000"}/accept-invite?token=${inviteToken}`;
  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "owner.invite",
    targetOwnerId: owner.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { role: owner.role, email: owner.email },
  });
  void sendOwnerInviteEmail({
    to: owner.email,
    name: owner.name,
    role: owner.role,
    inviteUrl,
  }).catch((err) => {
    console.error(
      "[owners] invite email failed (non-fatal)",
      err instanceof Error ? err.message : String(err),
    );
  });
  return c.json({ inviteToken, inviteUrl, owner }, 201);
});

app.delete("/owners/:ownerId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("ownerId"));
  if (!parsed.success) return c.json({ error: "ownerId must be a UUID" }, 400);
  try {
    const target = await db
      .select({
        id: owners.id,
        role: owners.role,
        status: owners.status,
        hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      })
      .from(owners)
      .where(eq(owners.id, parsed.data))
      .limit(1);
    const targetOwner = target[0];
    if (!targetOwner) return c.json({ error: "not_found" }, 404);
    if (isActivatedSuperAdmin(targetOwner)) {
      const superAdminCount = await countSuperAdmins();
      if (superAdminCount <= 1) {
        return c.json(
          {
            error: "last_super_admin",
            message: "Cannot delete the last Super Admin account.",
          },
          409,
        );
      }
    }

    await db
      .delete(adminAuditLog)
      .where(eq(adminAuditLog.targetOwnerId, parsed.data));

    const [deleted] = await db
      .delete(owners)
      .where(eq(owners.id, parsed.data))
      .returning({ id: owners.id, email: owners.email });
    if (!deleted) return c.json({ error: "not_found" }, 404);
    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "owner.delete",
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { deletedOwnerId: deleted.id, email: deleted.email },
    });
    return c.json({ deleted: true, id: deleted.id, email: deleted.email });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("foreign key") || msg.includes("violates")) {
      return c.json({ error: "owner_has_tenants", detail: "Reassign or delete the owner's tenants first." }, 409);
    }
    throw e;
  }
});

const ownerPatchBody = z
  .object({
    role: ownerRoleSchema.optional(),
    name: z.string().min(1).max(120).optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .strip();

app.patch("/owners/:ownerId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("ownerId"));
  if (!parsed.success) return c.json({ error: "ownerId must be a UUID" }, 400);

  const existingRows = await db
    .select({
      id: owners.id,
      role: owners.role,
      status: owners.status,
      hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      sessionVersion: owners.sessionVersion,
      name: owners.name,
      email: owners.email,
      createdAt: owners.createdAt,
    })
    .from(owners)
    .where(eq(owners.id, parsed.data))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return c.json({ error: "not_found" }, 404);

  let body: z.infer<typeof ownerPatchBody>;
  try {
    body = ownerPatchBody.parse(await c.req.json());
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

  const actorId = (c.get("actorId") as string | undefined) ?? "";
  if (body.role && actorId === parsed.data) {
    return c.json({ error: "cannot_change_own_role" }, 403);
  }
  if (body.status && body.status !== "active" && actorId === parsed.data) {
    return c.json({ error: "cannot_suspend_self" }, 403);
  }

  if (body.role && existing.role === "super_admin" && body.role !== "super_admin") {
    const existingIsActivatedSuperAdmin = isActivatedSuperAdmin({
      role: existing.role,
      status: existing.status,
      hasPassword: existing.hasPassword,
    });
    if (existingIsActivatedSuperAdmin) {
      const superAdminCount = await countSuperAdmins();
      if (superAdminCount <= 1) {
        return c.json(
          {
            error: "last_super_admin",
            message: "Cannot demote the last Super Admin account.",
          },
          409,
        );
      }
    }
  }

  const updateData: {
    role?: (typeof ROLES)[number];
    name?: string;
    status?: "active" | "suspended";
    sessionVersion?: number;
  } = {};
  if (body.role) updateData.role = body.role;
  if (body.name) updateData.name = body.name;
  if (body.status) updateData.status = body.status;
  if (body.role || body.status) {
    updateData.sessionVersion = (existing.sessionVersion ?? 1) + 1;
  }

  const [updated] = await db
    .update(owners)
    .set(updateData)
    .where(eq(owners.id, parsed.data))
    .returning({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      status: owners.status,
      hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      createdAt: owners.createdAt,
    });

  if (!updated) return c.json({ error: "not_found" }, 404);

  const auditIp = c.req.header("x-forwarded-for") ?? null;
  const auditUa = c.req.header("user-agent") ?? null;
  if (body.role && body.role !== existing.role) {
    await logAudit(db, {
      actorId,
      action: "owner.role_changed",
      targetOwnerId: updated.id,
      ipAddress: auditIp,
      userAgent: auditUa,
      metadata: { from: existing.role, to: body.role },
    });
  }
  if (body.status && body.status !== existing.status) {
    await logAudit(db, {
      actorId,
      action: "owner.status_changed",
      targetOwnerId: updated.id,
      ipAddress: auditIp,
      userAgent: auditUa,
      metadata: { from: existing.status, to: body.status },
    });
  }
  if (body.name && body.name !== existing.name) {
    await logAudit(db, {
      actorId,
      action: "owner.profile_updated",
      targetOwnerId: updated.id,
      ipAddress: auditIp,
      userAgent: auditUa,
      metadata: { field: "name" },
    });
  }

  return c.json({ updated: true, owner: updated });
});

app.get("/admin/orphan-check", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

  const orphans = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(
      and(
        notExists(
          db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.slug, tenants.slug)),
        ),
        notExists(
          db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.tenantId, tenants.id)),
        ),
        notExists(
          db
            .select({ id: tenantDeployments.id })
            .from(tenantDeployments)
            .where(eq(tenantDeployments.tenantId, tenants.id)),
        ),
      ),
    );

  const count = orphans.length;
  return c.json({
    orphans: orphans.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    count,
    message:
      count === 0
        ? "No orphaned child tenant rows detected."
        : `${count} potential orphan(s) found. Review before cleanup.`,
  });
});

app.get("/audit-log", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  return handleAuditLogList(c, db);
});

const apiKeyCreateBody = z.object({
  name: z.string().min(1).max(255),
});

app.get("/api-keys", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  if (c.get("apiKeyId")) {
    return c.json(
      { error: "forbidden", message: "API keys cannot be listed using an API key." },
      403,
    );
  }
  const actorId = String(c.get("actorId") ?? "");
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.ownerId, actorId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  return c.json({
    keys: rows.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

app.post("/api-keys", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  if (c.get("apiKeyId")) {
    return c.json(
      { error: "forbidden", message: "API keys cannot be created using an API key." },
      403,
    );
  }
  const actorId = String(c.get("actorId") ?? "");
  let body: z.infer<typeof apiKeyCreateBody>;
  try {
    body = apiKeyCreateBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      { error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) },
      400,
    );
  }
  const { rawKey, keyPrefix, keyHash } = generateApiKeyMaterial();
  const now = new Date();
  const [inserted] = await db
    .insert(apiKeys)
    .values({
      ownerId: actorId,
      name: body.name.trim(),
      keyPrefix,
      keyHash,
      updatedAt: now,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
    });
  if (!inserted) {
    return c.json({ error: "api_key_create_failed" }, 500);
  }
  await logAudit(db, {
    actorId,
    action: "api_key.created",
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { keyId: inserted.id, name: inserted.name },
  });
  return c.json(
    {
      id: inserted.id,
      name: inserted.name,
      keyPrefix: inserted.keyPrefix,
      createdAt: inserted.createdAt.toISOString(),
      rawKey,
    },
    201,
  );
});

app.delete("/api-keys/:keyId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  if (c.get("apiKeyId")) {
    return c.json(
      { error: "forbidden", message: "API keys cannot be revoked using an API key." },
      403,
    );
  }
  const parsedId = z.string().uuid().safeParse(c.req.param("keyId"));
  if (!parsedId.success) {
    return c.json({ error: "keyId must be a UUID" }, 400);
  }
  const actorId = String(c.get("actorId") ?? "");
  const now = new Date();
  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(apiKeys.id, parsedId.data),
        eq(apiKeys.ownerId, actorId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  if (!updated) {
    return c.json({ error: "api_key_not_found" }, 404);
  }
  await logAudit(db, {
    actorId,
    action: "api_key.revoked",
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { keyId: updated.id },
  });
  return c.json({ ok: true });
});

app.get("/tenants", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

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
    })
    .from(tenants)
    .leftJoin(tenantDeployments, joinDeployments)
    .where(fullWhere)
    .orderBy(orderClause)
    .limit(pageSize)
    .offset(offset);

  const dirJoin = joinDeployments;

  const [countResult, rows, totalAllRow, activeRow, suspendedRow, provisioningRow, failedRow] =
    await Promise.all([
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
    ]);

  const total = Number(countResult[0]?.c ?? 0);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

  const tenantIds = rows.map((r) => r.tenantId);
  const licenseStatusByTenant = new Map<string, string>();
  if (tenantIds.length > 0) {
    const licRows = await db
      .select({
        tenantId: licenses.tenantId,
        status: licenses.status,
      })
      .from(licenses)
      .where(and(inArray(licenses.tenantId, tenantIds), ne(licenses.status, "unassigned")))
      .orderBy(desc(licenses.updatedAt));
    for (const lr of licRows) {
      if (lr.tenantId && !licenseStatusByTenant.has(lr.tenantId)) {
        licenseStatusByTenant.set(lr.tenantId, lr.status);
      }
    }
  }

  const directoryTotals = {
    total: Number(totalAllRow[0]?.c ?? 0),
    active: Number(activeRow[0]?.c ?? 0),
    suspended: Number(suspendedRow[0]?.c ?? 0),
    provisioning: Number(provisioningRow[0]?.c ?? 0),
    failed: Number(failedRow[0]?.c ?? 0),
  };

  return c.json({
    tenants: rows.map((r) => ({
      ...r,
      licenseStatus: licenseStatusByTenant.get(r.tenantId) ?? null,
    })),
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

app.delete("/tenants/:tenantId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const tenantId = c.req.param("tenantId");
  const parsed = z.string().uuid().safeParse(tenantId);
  if (!parsed.success) {
    return c.json({ error: "tenantId must be a UUID" }, 400);
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

  for (const org of childOrgs) {
    const [childTenant] = await db
      .select({ id: tenants.id, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.slug, org.slug))
      .limit(1);

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
    console.log(JSON.stringify({ level: "info", correlationId, message: m }));
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
    (m) => console.log(JSON.stringify({ level: "info", correlationId, message: m })),
  );

  if (job.status === "completed") {
    return c.json({ error: "job_already_completed" }, 409);
  }

  if (job.status === "dead") {
    await trace.event("cancel", "Provision stop requested after terminal state", {
      level: "warn",
      meta: { status: "dead" },
    }).catch((error) => {
      console.error("[provision-stop] trace write failed", error instanceof Error ? error.message : String(error));
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
      console.error("[provision-stop] trace write failed", error instanceof Error ? error.message : String(error));
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
      console.error("[provision-stop] trace write failed", error instanceof Error ? error.message : String(error));
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
    (m) => console.log(JSON.stringify({ level: "info", correlationId, message: m })),
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
        console.error(
          "[tenant-provision-stop] trace write failed",
          error instanceof Error ? error.message : String(error),
        );
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
        console.error(
          "[tenant-provision-stop] trace write failed",
          error instanceof Error ? error.message : String(error),
        );
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
        console.error(
          "[tenant-provision-stop] trace write failed",
          error instanceof Error ? error.message : String(error),
        );
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
  const jobs = await listTenantJobs(db, correlationId);
  const lastJob = jobs[jobs.length - 1] ?? null;
  const events = await loadProvisionEventsJson(correlationId);
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
      await appendProvisionEventSafe({
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
  const jobs = await listTenantJobs(db, correlationId);
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
  const STREAM_POLL_MS = 1500;
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
    let lastPingAt = 0;

    while (!closed) {
      const rows = await db
        .select()
        .from(tenantProvisionEvents)
        .where(eq(tenantProvisionEvents.correlationId, correlationId))
        .orderBy(asc(tenantProvisionEvents.createdAt), asc(tenantProvisionEvents.id));

      for (const row of rows) {
        await forward(rowToProvisionPayload(row));
      }

      const streamJobs = await listTenantJobs(db, correlationId);
      const lastJob = streamJobs[streamJobs.length - 1] ?? null;
      const lastEvent = rows[rows.length - 1];
      const terminalFromJob =
        lastJob !== null && TERMINAL_JOB_STATUSES.has(lastJob.status);
      const terminalFromEvent =
        lastEvent?.phase === "complete" || lastEvent?.phase === "failed";

      if (terminalFromJob || (terminalFromEvent && streamJobs.length === 0)) {
        const status =
          lastJob?.status === "completed" || lastEvent?.phase === "complete"
            ? "complete"
            : "failed";
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({ status, correlationId }),
        });
        break;
      }

      const now = Date.now();
      if (now - lastPingAt >= STREAM_PING_MS) {
        await stream.writeSSE({ event: "ping", data: String(now) });
        lastPingAt = now;
      }

      await new Promise((resolve) => setTimeout(resolve, STREAM_POLL_MS));
    }
  });
});

app.get("/tenants/:tenantId/organizations", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, parsed.data))
    .limit(1);
  if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.tenantId, parsed.data))
    .orderBy(desc(organizations.isPrimary), asc(organizations.createdAt));

  const actorId = String(c.get("actorId") ?? "");
  const actorRole = String(c.get("actorRole") ?? "");
  const scoped = await getSupportScopedOrgIdsForTenant(db, actorId, parsed.data);
  const visibleRows = filterOrganizationsForSupportAgent(actorRole, rows, scoped);

  const composeNames = visibleRows.map((r) => dockerComposeProjectForOrgSlug(r.slug));
  const portMap = await internalPortsByComposeProject(db, composeNames);

  return c.json({
    organizations: visibleRows.map((row) =>
      serializeOrganizationRow(row, portMap.get(dockerComposeProjectForOrgSlug(row.slug)) ?? null),
    ),
  });
});

app.post("/tenants/:tenantId/organizations", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

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
    console.error(
      "[organizations] enqueueOrgProvisioning failed",
      err instanceof Error ? err.message : String(err),
    );
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

  const actorRole = c.get("actorRole");

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

  const rawPosCredentials = await loadLatestPosBootstrapCredentials(row.id);
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
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, parsed.data))
    .limit(1);

  if (!row) return c.json({ error: "tenant_not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const retryPosOnly =
    (body as { retryPosOnly?: unknown }).retryPosOnly === true
    || (Array.isArray((body as { retryModules?: unknown }).retryModules)
      && (body as { retryModules: string[] }).retryModules.includes("pos")
      && (body as { retryModules: string[] }).retryModules.length === 1);

  const failed =
    row.status === "failed" || row.deploymentStatus === "failed" || row.deploymentStatus === null;
  const partial = row.status === "partial";
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
  } else if (!failed) {
    return c.json(
      {
        error: "tenant_not_failed",
        message: "Retry is only available when provisioning failed or deployment is missing.",
      },
      409,
    );
  }

  const correlationId = randomUUID();
  const log = (m: string) => {
    console.log(JSON.stringify({ level: "info", correlationId, message: m }));
  };
  const acceptTrace = createProvisionTracer(db, correlationId, () => ({ slug: row.slug }), log);
  await acceptTrace.event("api", "HTTP 202 — retry provisioning accepted");

  await db
    .update(tenants)
    .set({ status: "provisioning" })
    .where(eq(tenants.id, row.id));
  await db
    .update(tenantDeployments)
    .set({ status: "provisioning", lastError: null, updatedAt: new Date() })
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

  const impersonateUrl = `${origin}/api/auth/impersonate?t=${encodeURIComponent(accessToken)}`;

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.impersonate",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { tenantSlug: row.slug, adminEmail: row.adminEmail },
  });

  return c.json({ impersonateUrl });
});

app.post("/tenants/:tenantId/stop", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

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

function startReadinessReconciler() {
  if (!db) return;
  let running = false;
  const lastObservedAt = new Map<string, number>();
  const lastSignature = new Map<string, string>();
  const READINESS_OBSERVE_COOLDOWN_MS = 45_000;
  const tick = async () => {
    if (!db || running) return;
    running = true;
    try {
      const rows = await db
        .select({
          id: tenantLifecycleJobs.id,
          correlationId: tenantLifecycleJobs.correlationId,
          completedAt: tenantLifecycleJobs.completedAt,
          payload: tenantLifecycleJobs.payload,
        })
        .from(tenantLifecycleJobs)
        .where(
          and(
            eq(tenantLifecycleJobs.type, "tenant.provision"),
            eq(tenantLifecycleJobs.status, "completed"),
          ),
        )
        .orderBy(desc(tenantLifecycleJobs.completedAt))
        .limit(100);

      for (const row of rows) {
        const correlationId = row.correlationId;
        if (!correlationId) continue;
        const now = Date.now();
        const previous = lastObservedAt.get(correlationId) ?? 0;
        if (now - previous < READINESS_OBSERVE_COOLDOWN_MS) continue;
        lastObservedAt.set(correlationId, now);
        invalidateTenantReadinessCache(correlationId);
        const readiness = await getTenantReadiness(db, correlationId);
        const slug =
          row.payload && typeof row.payload.slug === "string" ? String(row.payload.slug) : null;
        const signature = `${readiness.status}:${readiness.reasons.join("|")}`;
        if (lastSignature.get(correlationId) === signature) {
          continue;
        }
        lastSignature.set(correlationId, signature);
        if (readiness.status === "READY") {
          await appendProvisionEventSafe({
            correlationId,
            slug,
            phase: "readiness.observed",
            level: "info",
            message: "Readiness observed as READY",
            meta: { checks: readiness.checks, status: readiness.status },
          });
        } else {
          await appendProvisionEventSafe({
            correlationId,
            slug,
            phase: "readiness.observed",
            level: readiness.status === "DEGRADED" ? "warn" : "error",
            message: "Readiness observed as non-ready",
            meta: { checks: readiness.checks, status: readiness.status, reasons: readiness.reasons },
          });
          const completedAtMs = row.completedAt ? row.completedAt.getTime() : null;
          if (completedAtMs && Date.now() - completedAtMs >= PROVISION_STUCK_AFTER_MS) {
            await appendProvisionEventSafe({
              correlationId,
              slug,
              phase: readiness.status === "DEGRADED" ? "readiness.degraded_detected" : "readiness.inconsistent",
              level: "error",
              message: "Completed provisioning is still not converged to ready",
              meta: { ageMs: Date.now() - completedAtMs, readiness },
            });
          }
        }
      }
    } catch (error) {
      console.error(
        "[reconciler] readiness tick failed:",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      running = false;
    }
  };
  setInterval(() => {
    void tick();
  }, RECONCILE_INTERVAL_MS);
  void tick();
}

registerLicenseApi(app, db);
registerNotificationsApi(app, db);
registerTenantFinanceUsersApi(app, db);
registerPosCredentialsRoutes(app, db);
registerTenantModulesRoutes(app, db);
registerPosProxyRoutes(app);
registerPmsProxyRoutes(app);

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    JSON.stringify({
      level: "error",
      type: "unhandled_rejection",
      reason: reason instanceof Error ? reason.message : String(reason),
      promise: String(promise),
    }),
  );
});

process.on("uncaughtException", (error) => {
  console.error(
    JSON.stringify({
      level: "error",
      type: "uncaught_exception",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  process.exit(1);
});

const port = apiConfig.port;
startReadinessReconciler();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
