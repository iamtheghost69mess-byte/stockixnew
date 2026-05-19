import { apiConfig } from "@repo/config";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";

import { CryptoTenantSecretGenerator } from "../domain/provisioning/adapters/crypto-tenant-secret-generator.js";
import { fetchBuildOrganization } from "../domain/provisioning/adapters/fetch-stockix-finance-build-org.js";
import {
  MENA_DEFAULTS,
  type OrgBuildSettings,
  fetchOrgSettingsFromMainInstance,
} from "../domain/provisioning/adapters/fetch-stockix-finance-org-settings.js";

export interface OrgProvisionInput {
  organizationId: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  orgName: string;
  mainTenantInternalBaseUrl: string;
  parentTenantSlug: string;
  stockixTenantId: string;
  correlationId: string;
}

function financeApiBase(internalBaseUrl: string): string {
  return internalBaseUrl.replace(/\/+$/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseAuthSession(
  body: unknown,
): { accessToken: string; organizationId: string; tenantId: number | null } | null {
  if (!isRecord(body)) return null;
  const accessToken =
    readString(body.accessToken) ?? readString(body.access_token) ?? readString(body.token);
  const organizationId =
    readString(body.organizationId) ?? readString(body.organization_id);
  const tenantIdRaw = isRecord(body) ? (body.tenantId ?? body.tenant_id) : null;
  const tenantId = Number(tenantIdRaw);
  if (!accessToken || !organizationId) return null;
  return {
    accessToken,
    organizationId,
    tenantId: Number.isFinite(tenantId) && tenantId > 0 ? tenantId : null,
  };
}

function parseSignupOrganizationId(body: unknown): string | null {
  if (!isRecord(body)) return null;
  return readString(body.organizationId) ?? readString(body.organization_id) ?? null;
}

async function registerNewFinanceOrg(
  base: string,
  params: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    correlationId: string;
    internalApiSecret: string;
  },
): Promise<{ organizationId: string; tenantId: number }> {
  const res = await fetch(`${base}/api/internal/provision-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": params.internalApiSecret,
      "x-request-id": params.correlationId,
      "x-correlation-id": params.correlationId,
    },
    body: JSON.stringify({
      first_name: params.firstName,
      last_name: params.lastName,
      email: params.email,
      password: params.password,
      role: "admin",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`register_failed_http_${res.status}: ${text.slice(0, 500)}`);
  }
  const organizationId = parseSignupOrganizationId(json);
  const tenantId = Number(
    isRecord(json) ? (json.tenantId ?? json.tenant_id) : NaN,
  );
  if (!organizationId || !tenantId) {
    throw new Error("register_missing_organization_or_tenant_id");
  }
  return { organizationId, tenantId };
}

async function signin(
  base: string,
  email: string,
  password: string,
  correlationId: string,
): Promise<{ accessToken: string; organizationId: string; tenantId: number | null }> {
  const res = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": correlationId,
      "x-correlation-id": correlationId,
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`signin_failed_http_${res.status}: ${text.slice(0, 500)}`);
  }
  const session = parseAuthSession(json);
  if (!session) {
    throw new Error("signin_missing_token");
  }
  return session;
}

async function switchTenant(
  base: string,
  accessToken: string,
  organizationId: string,
  correlationId: string,
): Promise<{ accessToken: string; organizationId: string }> {
  const res = await fetch(`${base}/api/auth/switch-tenant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "x-request-id": correlationId,
      "x-correlation-id": correlationId,
    },
    body: JSON.stringify({ organizationId }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`switch_tenant_failed_http_${res.status}: ${text.slice(0, 500)}`);
  }
  const session = parseAuthSession(json);
  if (!session) {
    throw new Error("switch_tenant_missing_token");
  }
  return session;
}

async function saveFinanceOrganizationId(
  controlPlaneOrgId: string,
  financeOrganizationId: string,
  log: (m: string) => void,
): Promise<void> {
  const apiBase = `http://localhost:${apiConfig.port}`;
  const saveUrl = `${apiBase}/internal/organizations/${controlPlaneOrgId}`;
  const secret = apiConfig.workerSecret;
  const saveRes = await fetch(saveUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ financeOrganizationId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!saveRes.ok) {
    throw new Error(`save_finance_organization_id_http_${saveRes.status}`);
  }
  log("[org-provision] Saved financeOrganizationId mapping");
}

async function attachAdminToOrg(
  mainBase: string,
  adminEmail: string,
  financeOrganizationId: string,
  log: (m: string) => void,
): Promise<void> {
  const internalSecret = apiConfig.internalApiSecret;
  if (!internalSecret) {
    log("[org-provision] Warning: INTERNAL_API_SECRET not configured; skipping attach-user");
    return;
  }
  const attachUrl = `${mainBase}/api/internal/attach-user-to-tenant`;
  const attachRes = await fetch(attachUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      email: adminEmail,
      organization_id: financeOrganizationId,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!attachRes.ok) {
    log(`[org-provision] Warning: attach-user failed ${attachRes.status}`);
    return;
  }
  log("[org-provision] Admin user attached to org");
}

export async function executeOrgProvisionRuntime(
  _db: PostgresJsDatabase<typeof dbSchema>,
  input: OrgProvisionInput,
  log: (m: string) => void,
  assertNotCancelled?: () => Promise<void>,
): Promise<void> {
  const secrets = new CryptoTenantSecretGenerator();
  const mainBase = financeApiBase(input.mainTenantInternalBaseUrl);
  const adminPassword = secrets.bootstrapAdminPassword(input.parentTenantSlug.trim());
  const correlationId = input.correlationId;

  const check = async () => {
    if (assertNotCancelled) await assertNotCancelled();
  };

  const internalApiSecret = apiConfig.internalApiSecret;
  if (!internalApiSecret) {
    throw new Error(
      "INTERNAL_API_SECRET is required for org provisioning user creation",
    );
  }

  await check();
  log("[org-provision] Registering new Finance org on parent stack");
  const registered = await registerNewFinanceOrg(mainBase, {
    firstName: input.adminFirstName,
    lastName: input.adminLastName,
    email: input.adminEmail,
    password: adminPassword,
    correlationId,
    internalApiSecret,
  });

  await check();
  log("[org-provision] Signing in and switching to new org");
  const newFinanceOrganizationId = registered.organizationId;
  const newFinanceTenantId = registered.tenantId;

  const signinSession = await signin(mainBase, input.adminEmail, adminPassword, correlationId);
  const buildSession = await switchTenant(
    mainBase,
    signinSession.accessToken,
    newFinanceOrganizationId,
    correlationId,
  );

  let inheritedSettings: OrgBuildSettings = {
    ...MENA_DEFAULTS,
    name: input.orgName,
  };
  try {
    const fetched = await fetchOrgSettingsFromMainInstance({
      mainInternalBaseUrl: mainBase,
      adminEmail: input.adminEmail,
      adminPassword,
      correlationId,
    });
    if (fetched) {
      inheritedSettings = { ...fetched, name: input.orgName };
      log("[org-provision] Using inherited settings from main org");
    }
  } catch (err) {
    log(
      `[org-provision] Settings fetch failed, using defaults: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  await check();
  log("[org-provision] Building organization database");
  const buildResult = await fetchBuildOrganization(
    {
      internalBaseUrl: mainBase,
      adminEmail: input.adminEmail,
      adminPassword,
      settings: inheritedSettings,
      correlationId,
      session: buildSession,
    },
    log,
  );
  if (!buildResult.ok) {
    throw new Error(buildResult.error ?? "organization_build_failed");
  }

  const financeOrganizationId = buildResult.financeOrganizationId ?? buildSession.organizationId;

  await check();
  await attachAdminToOrg(mainBase, input.adminEmail, financeOrganizationId, log);

  await check();
  await saveFinanceOrganizationId(input.organizationId, financeOrganizationId, log);

  const parentFinanceTenantId =
    signinSession.tenantId ??
    (await resolveParentFinanceTenantId(
      mainBase,
      signinSession.organizationId,
      correlationId,
    ));

  if (parentFinanceTenantId && apiConfig.internalApiSecret) {
    try {
      const copyUrl = `${mainBase}/api/internal/tenants/${newFinanceTenantId}/copy-from/${parentFinanceTenantId}`;
      const copyRes = await fetch(copyUrl, {
        method: "POST",
        headers: {
          "x-internal-secret": apiConfig.internalApiSecret,
          "x-request-id": correlationId,
        },
        signal: AbortSignal.timeout(60_000),
      });
      const copyText = await copyRes.text();
      log(
        `[org-provision] COA copy ${copyRes.ok ? "ok" : "failed"}: ${copyText.slice(0, 200)}`,
      );

      const parentUrl = `${mainBase}/api/internal/tenants/${newFinanceTenantId}/set-parent`;
      await fetch(parentUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": apiConfig.internalApiSecret,
        },
        body: JSON.stringify({ parentTenantId: parentFinanceTenantId }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      log(
        `[org-provision] COA copy error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

async function resolveParentFinanceTenantId(
  mainBase: string,
  organizationId: string,
  correlationId: string,
): Promise<number | null> {
  // Parent tenant is the one used before switch-tenant during sign-in.
  const signinRes = await fetch(`${mainBase}/api/organization/current`, {
    headers: {
      "organization-id": organizationId,
      "x-request-id": correlationId,
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!signinRes?.ok) return 1;

  const body = (await signinRes.json().catch(() => ({}))) as Record<string, unknown>;
  const tenantId = Number(body.id ?? body.tenant_id);
  return Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
}
