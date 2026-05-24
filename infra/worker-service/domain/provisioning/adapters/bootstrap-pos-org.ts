import { posConfig } from "@repo/config";

export type PosRoleCredential = {
  role: string;
  username: string;
  pin: string;
};

export type PosDefaultCredentials = {
  adminPin: string;
  allRoles: PosRoleCredential[];
};

export type BootstrapPosOrgInput = {
  slug: string;
  tenantName: string;
  tenantId: string;
  adminEmail: string;
  log: (message: string) => void;
  /** Override base URL (default: posConfig.platformBaseUrl). */
  posBaseUrl?: string;
  posHostPort?: number;
};

export type BootstrapPosOrgResult = {
  posOrganizationId: string;
  posDefaultCredentials: PosDefaultCredentials;
  bootstrapMode?: string;
};

const BOOTSTRAP_POLL_TIMEOUT_MS = 60_000;
const BOOTSTRAP_POLL_INTERVAL_MS = 1_500;
const POS_HEALTH_TIMEOUT_MS = 90_000;
const POS_HEALTH_INTERVAL_MS = 2_000;

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
    if (!role || !pin) continue;
    out.push({ role, username, pin });
  }
  return out;
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

async function waitForPosBackend(base: string, log: BootstrapPosOrgInput["log"]): Promise<void> {
  const started = Date.now();
  const paths = ["/api/ping", "/api/health"];
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

  const licenseStartsAt = new Date().toISOString();
  const licenseEndsAt = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const idempotencyKey = `stockix-provision-${input.tenantId}`;
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

  if (bootstrapMode !== "sync_fallback") {
    const pollStarted = Date.now();
    let bootstrapReady = false;
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
      const lifecycle =
        data && typeof data.lifecycle === "string" ? data.lifecycle : "";
      const readyForPinLogin = data?.readyForPinLogin === true;
      if (lifecycle === "active" || readyForPinLogin) {
        bootstrapReady = true;
        log(`[provision][pos] org bootstrap ready orgId=${orgId}`);
        break;
      }
      await sleep(BOOTSTRAP_POLL_INTERVAL_MS);
    }
    if (!bootstrapReady) {
      throw new Error(
        `POS org bootstrap timed out after ${BOOTSTRAP_POLL_TIMEOUT_MS}ms (orgId=${orgId})`,
      );
    }
  }

  const getRes = await platformFetch(base, `/api/platform/v1/organizations/${orgId}`, {
    method: "GET",
    apiKey,
  });
  if (!getRes.ok) {
    throw new Error(
      `POS org fetch failed (${getRes.status}): ${getRes.text.slice(0, 300)}`,
    );
  }
  const orgData =
    isRecord(getRes.json) && isRecord(getRes.json.data) ? getRes.json.data : null;
  if (orgData?.defaultCredentials) {
    credentials = normalizeCredentials(orgData.defaultCredentials);
  }

  if (credentials.length === 0) {
    throw new Error(
      `POS org bootstrap finished but defaultCredentials missing for orgId=${orgId}`,
    );
  }

  return {
    posOrganizationId: orgId,
    posDefaultCredentials: toPosDefaultCredentials(credentials),
    bootstrapMode,
  };
}
