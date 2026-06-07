import { posConfig } from "@repo/config";
import { buildPosEntitlementsForProvision } from "@repo/shared/pos-entitlements-from-modules";

export type PosRoleCredential = {
  role: string;
  username: string;
  pin: string;
};

export type PosDefaultCredentials = {
  adminPin: string;
  allRoles: PosRoleCredential[];
};

export type BootstrapPosOrgForControlPlaneInput = BootstrapPosOrgInput & {
  /** Control-plane organization UUID (idempotency + slug source). */
  controlPlaneOrganizationId: string;
  /** POS org slug (unique per control-plane org). */
  organizationSlug: string;
};

export type BootstrapPosOrgInput = {
  slug: string;
  tenantName: string;
  tenantId: string;
  adminEmail: string;
  log: (message: string) => void;
  /** Stockix license expiry (defaults to +1 year when omitted). */
  licenseExpiresAt?: Date | string | number | null;
  /** Stockix tenant modules (drives POS entitlements.modules). */
  tenantModules?: string[] | null;
  maxUsers?: number | null;
  maxLocations?: number | null;
  maxOrdersPerMonth?: number | null;
  /** Override base URL (default: posConfig.platformBaseUrl). */
  posBaseUrl?: string;
  posHostPort?: number;
};

export type BootstrapPosOrgResult = {
  posOrganizationId: string;
  posDefaultCredentials: PosDefaultCredentials;
  bootstrapMode?: string;
};

const BOOTSTRAP_POLL_TIMEOUT_MS = Number(process.env.BOOTSTRAP_POLL_TIMEOUT_MS ?? 60_000);
/** Extra time when readyForPinLogin is true but one-time credentials are not in the reveal store yet. */
const BOOTSTRAP_CREDENTIALS_WAIT_MS = Number(
  process.env.BOOTSTRAP_CREDENTIALS_WAIT_MS ?? 120_000,
);
const BOOTSTRAP_POLL_INTERVAL_MS = Number(process.env.BOOTSTRAP_POLL_INTERVAL_MS ?? 1_500);
const POS_HEALTH_TIMEOUT_MS = 90_000;
const POS_HEALTH_INTERVAL_MS = 2_000;
const PLATFORM_AUTH_TIMEOUT_MS = 30_000;
const PLATFORM_AUTH_INTERVAL_MS = 1_000;

function posApiBase(input: BootstrapPosOrgInput): string {
  const port = input.posHostPort ?? Number(process.env.POS_HOST_PORT ?? 8010);
  const fromEnv = input.posBaseUrl ?? posConfig.platformBaseUrl;
  if (fromEnv && !fromEnv.includes("localhost:8010")) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `http://127.0.0.1:${port}`;
}

function apiKeyOrThrow(): string {
  const key = posConfig.platformApiKey.trim();
  if (key.length < 10) {
    throw new Error(
      "POS_PLATFORM_API_KEY is required for POS org bootstrap (min 10 characters)",
    );
  }
  return key;
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readOrgId(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const data = body.data;
  if (!isRecord(data)) return null;
  const id = data._id ?? data.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function isPlaintextCredentialPin(pin: string): boolean {
  const p = pin.trim();
  if (p.length < 4) return false;
  if (p.includes("•") || p.includes("*")) return false;
  if (/^[*•]+$/.test(p)) return false;
  return /^\d{4,6}$/.test(p);
}

function normalizeCredentials(raw: unknown): PosRoleCredential[] {
  if (!Array.isArray(raw)) return [];
  const out: PosRoleCredential[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const role = typeof row.role === "string" ? row.role : "";
    const username =
      typeof row.username === "string"
        ? row.username
        : typeof row.name === "string"
          ? row.name
          : role;
    const pin = typeof row.pin === "string" ? row.pin : "";
    if (!role || !pin || !isPlaintextCredentialPin(pin)) continue;
    out.push({ role, username, pin });
  }
  return out;
}

function readFullCredentialsFromJson(body: unknown): PosRoleCredential[] {
  if (!isRecord(body)) return [];
  if (Array.isArray(body.fullCredentials)) {
    const fromTop = normalizeCredentials(body.fullCredentials);
    if (fromTop.length > 0) return fromTop;
  }
  const data = body.data;
  if (isRecord(data) && Array.isArray(data.fullCredentials)) {
    return normalizeCredentials(data.fullCredentials);
  }
  return [];
}

function readDefaultCredentialsFromOrgJson(body: unknown): PosRoleCredential[] {
  if (!isRecord(body)) return [];
  const data = body.data;
  if (isRecord(data) && Array.isArray(data.defaultCredentials)) {
    return normalizeCredentials(data.defaultCredentials);
  }
  return [];
}

/** Legacy POS images store plaintext PINs on the org until one-time reveal is available. */
async function fetchCredentialsFromOrg(
  base: string,
  orgId: string,
  apiKey: string,
): Promise<PosRoleCredential[]> {
  const orgRes = await platformFetch(base, `/api/platform/v1/organizations/${orgId}`, {
    method: "GET",
    apiKey,
  });
  if (!orgRes.ok) return [];
  return readDefaultCredentialsFromOrgJson(orgRes.json);
}

function toPosDefaultCredentials(creds: PosRoleCredential[]): PosDefaultCredentials {
  const admin = creds.find((c) => c.role === "admin");
  return {
    adminPin: admin?.pin ?? "",
    allRoles: creds,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function waitForPosBackend(base: string, log: BootstrapPosOrgInput["log"]): Promise<void> {
  const started = Date.now();
  // /health and /ready are exempt from production HTTPS enforcement (see pos-backend app.js).
  const paths = ["/health", "/ready"];
  while (Date.now() - started < POS_HEALTH_TIMEOUT_MS) {
    for (const path of paths) {
      try {
        const res = await fetch(`${base}${path}`, {
          signal: AbortSignal.timeout(4_000),
        });
        if (res.ok) {
          log(`[provision][pos] backend ready (${path})`);
          return;
        }
      } catch {
        // retry
      }
    }
    await sleep(POS_HEALTH_INTERVAL_MS);
  }
  throw new Error(`POS backend not ready within ${POS_HEALTH_TIMEOUT_MS}ms (${base})`);
}

/** Wait until provision API key is synced into the tenant stack Mongo (runs after DB connect). */
async function waitForPlatformApiAuth(
  base: string,
  apiKey: string,
  log: BootstrapPosOrgInput["log"],
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < PLATFORM_AUTH_TIMEOUT_MS) {
    const probe = await platformFetch(base, "/api/platform/v1/organizations/health-summary", {
      method: "GET",
      apiKey,
    });
    if (probe.ok) {
      log("[provision][pos] platform API key accepted");
      return;
    }
    if (probe.status !== 401) {
      throw new Error(
        `POS platform auth probe failed (${probe.status}): ${probe.text.slice(0, 200)}`,
      );
    }
    await sleep(PLATFORM_AUTH_INTERVAL_MS);
  }
  throw new Error(
    `POS platform API key not accepted within ${PLATFORM_AUTH_TIMEOUT_MS}ms (${base})`,
  );
}

async function platformFetch(
  base: string,
  path: string,
  init: RequestInit & { apiKey: string },
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": init.apiKey,
      // Per-tenant stack is reached over loopback HTTP; Traefik terminates TLS in production.
      "X-Forwarded-Proto": "https",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, json: parseJson(text), text };
}

/**
 * Creates a POS organization via platform API and waits for org_bootstrap to finish.
 */
export async function bootstrapPosOrganization(
  input: BootstrapPosOrgInput,
): Promise<BootstrapPosOrgResult> {
  const apiKey = apiKeyOrThrow();
  const base = posApiBase(input);
  const log = input.log;

  await waitForPosBackend(base, log);
  await waitForPlatformApiAuth(base, apiKey, log);

  const licenseStartsAt = new Date().toISOString();
  const licenseEndsAt = new Date(
    input.licenseExpiresAt != null
      ? new Date(input.licenseExpiresAt).getTime()
      : Date.now() + 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const idempotencyKey = `stockix-provision-${input.tenantId}`;
  const entitlements = buildPosEntitlementsForProvision({
    modules: input.tenantModules,
    maxUsers: input.maxUsers,
    maxLocations: input.maxLocations,
    maxOrdersPerMonth: input.maxOrdersPerMonth,
  });
  log(`[provision][pos] creating organization slug=${input.slug}`);
  const createRes = await platformFetch(base, "/api/platform/v1/organizations", {
    method: "POST",
    apiKey,
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      name: input.tenantName,
      slug: input.slug,
      stockixTenantId: input.tenantId,
      ownerEmail: input.adminEmail,
      timezone: "UTC",
      licenseStartsAt,
      licenseEndsAt,
      entitlements,
    }),
  });

  if (!createRes.ok) {
    throw new Error(
      `POS org create failed (${createRes.status}): ${createRes.text.slice(0, 500)}`,
    );
  }

  const orgId = readOrgId(createRes.json);
  if (!orgId) {
    throw new Error("POS org create response missing organization id");
  }

  const bootstrapMode =
    isRecord(createRes.json) && typeof createRes.json.bootstrapMode === "string"
      ? createRes.json.bootstrapMode
      : undefined;

  let credentials = normalizeCredentials(
    isRecord(createRes.json) && isRecord(createRes.json.data)
      ? createRes.json.data.defaultCredentials
      : null,
  );
  if (credentials.length === 0) {
    credentials = readFullCredentialsFromJson(createRes.json);
  }

  if (bootstrapMode !== "sync_fallback") {
    const pollStarted = Date.now();
    let bootstrapReady = false;
    let readySince: number | null = null;
    log(`[provision][pos] waiting for org bootstrap orgId=${orgId}`);
    while (Date.now() - pollStarted < BOOTSTRAP_POLL_TIMEOUT_MS) {
      const statusRes = await platformFetch(
        base,
        `/api/platform/v1/organizations/${orgId}/provisioning-status`,
        { method: "GET", apiKey },
      );
      if (!statusRes.ok) {
        throw new Error(
          `POS provisioning-status failed (${statusRes.status}): ${statusRes.text.slice(0, 300)}`,
        );
      }
      const data =
        isRecord(statusRes.json) && isRecord(statusRes.json.data)
          ? statusRes.json.data
          : null;
      const readyForPinLogin = data?.readyForPinLogin === true;
      // lifecycle is "active" on create before org_bootstrap finishes — wait for PIN readiness only.
      if (readyForPinLogin) {
        if (readySince == null) readySince = Date.now();
        const fromStatus = readFullCredentialsFromJson(statusRes.json);
        if (fromStatus.length > 0) {
          credentials = fromStatus;
          bootstrapReady = true;
          log(`[provision][pos] org bootstrap ready orgId=${orgId}`);
          break;
        }
        const fromOrg = await fetchCredentialsFromOrg(base, orgId, apiKey);
        if (fromOrg.length > 0) {
          credentials = fromOrg;
          bootstrapReady = true;
          log(
            `[provision][pos] org bootstrap ready (legacy plaintext defaultCredentials) orgId=${orgId}`,
          );
          break;
        }
        if (readySince != null && Date.now() - readySince >= BOOTSTRAP_CREDENTIALS_WAIT_MS) {
          break;
        }
        // readyForPinLogin without one-time credentials yet — keep polling (peek does not consume).
      } else {
        readySince = null;
      }
      await sleep(BOOTSTRAP_POLL_INTERVAL_MS);
    }
    if (!bootstrapReady) {
      throw new Error(
        `POS org bootstrap timed out after ${BOOTSTRAP_POLL_TIMEOUT_MS}ms (orgId=${orgId})`,
      );
    }
  }

  if (credentials.length === 0) {
    throw new Error(
      `POS org bootstrap finished but fullCredentials missing for orgId=${orgId}`,
    );
  }

  const consumeRes = await platformFetch(
    base,
    `/api/platform/v1/organizations/${orgId}/provisioning-credentials/consume`,
    { method: "POST", apiKey },
  );
  if (consumeRes.status !== 204 && consumeRes.status !== 200) {
    log(
      `[provision][pos] warning: provisioning-credentials/consume returned ${consumeRes.status} orgId=${orgId}`,
    );
  }

  return {
    posOrganizationId: orgId,
    posDefaultCredentials: toPosDefaultCredentials(credentials),
    bootstrapMode,
  };
}

/**
 * Creates a dedicated POS organization for a control-plane org (combined multi-org).
 */
export async function bootstrapPosOrganizationForControlPlane(
  input: BootstrapPosOrgForControlPlaneInput,
): Promise<BootstrapPosOrgResult> {
  const apiKey = apiKeyOrThrow();
  const base = posApiBase(input);
  const log = input.log;

  await waitForPosBackend(base, log);
  await waitForPlatformApiAuth(base, apiKey, log);

  const licenseStartsAt = new Date().toISOString();
  const licenseEndsAt = new Date(
    input.licenseExpiresAt != null
      ? new Date(input.licenseExpiresAt).getTime()
      : Date.now() + 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const idempotencyKey = `stockix-org-provision-${input.controlPlaneOrganizationId}`;
  const entitlements = buildPosEntitlementsForProvision({
    modules: input.tenantModules,
    maxUsers: input.maxUsers,
    maxLocations: input.maxLocations,
    maxOrdersPerMonth: input.maxOrdersPerMonth,
  });

  log(
    `[provision][pos] creating control-plane org slug=${input.organizationSlug} cpOrg=${input.controlPlaneOrganizationId}`,
  );
  const createRes = await platformFetch(base, "/api/platform/v1/organizations", {
    method: "POST",
    apiKey,
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      name: input.tenantName,
      slug: input.organizationSlug,
      stockixTenantId: input.tenantId,
      ownerEmail: input.adminEmail,
      timezone: "UTC",
      licenseStartsAt,
      licenseEndsAt,
      entitlements,
    }),
  });

  if (!createRes.ok) {
    throw new Error(
      `POS org create failed (${createRes.status}): ${createRes.text.slice(0, 500)}`,
    );
  }

  const orgId = readOrgId(createRes.json);
  if (!orgId) {
    throw new Error("POS org create response missing organization id");
  }

  const bootstrapMode =
    isRecord(createRes.json) && typeof createRes.json.bootstrapMode === "string"
      ? createRes.json.bootstrapMode
      : undefined;

  let credentials = normalizeCredentials(
    isRecord(createRes.json) && isRecord(createRes.json.data)
      ? createRes.json.data.defaultCredentials
      : null,
  );
  if (credentials.length === 0) {
    credentials = readFullCredentialsFromJson(createRes.json);
  }

  if (bootstrapMode !== "sync_fallback") {
    const pollStarted = Date.now();
    log(`[provision][pos] waiting for org bootstrap orgId=${orgId}`);
    while (Date.now() - pollStarted < BOOTSTRAP_POLL_TIMEOUT_MS) {
      const statusRes = await platformFetch(
        base,
        `/api/platform/v1/organizations/${orgId}/provisioning-status`,
        { method: "GET", apiKey },
      );
      if (!statusRes.ok) {
        throw new Error(
          `POS provisioning-status failed (${statusRes.status}): ${statusRes.text.slice(0, 300)}`,
        );
      }
      const ready = isRecord(statusRes.json) && statusRes.json.readyForPinLogin === true;
      if (ready) break;
      await sleep(BOOTSTRAP_POLL_INTERVAL_MS);
    }
  }

  if (credentials.length === 0) {
    credentials = await fetchCredentialsFromOrg(base, orgId, apiKey);
  }

  return {
    posOrganizationId: orgId,
    posDefaultCredentials: toPosDefaultCredentials(credentials),
    bootstrapMode,
  };
}
