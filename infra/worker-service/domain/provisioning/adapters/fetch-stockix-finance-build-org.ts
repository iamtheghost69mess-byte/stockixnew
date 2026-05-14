import type { OrgBuildSettings } from "./fetch-stockix-finance-org-settings.js";

export interface BuildOrgInput {
  internalBaseUrl: string;
  adminEmail: string;
  adminPassword: string;
  settings: OrgBuildSettings;
  correlationId: string;
}

export interface BuildOrgResult {
  ok: boolean;
  alreadyBuilt?: boolean;
  /** Finance-internal organization id from sign-in (control-plane mapping). */
  financeOrganizationId?: string;
  error?: string;
}

const POLL_MS = 3000;
const TIMEOUT_MS = 120_000;

function financeApiBase(internalBaseUrl: string): string {
  return internalBaseUrl.replace(/\/+$/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseSigninToken(body: unknown): { accessToken: string; organizationId: string } | null {
  if (!isRecord(body)) return null;
  const accessToken =
    readString(body.accessToken) ?? readString(body.access_token) ?? readString(body.token);
  const organizationId =
    readString(body.organizationId) ?? readString(body.organization_id);
  if (!accessToken || !organizationId) return null;
  return { accessToken, organizationId };
}

function isTenantAlreadyBuilt(rawText: string, json: unknown): boolean {
  if (rawText.includes("TENANT_ALREADY_BUILT")) return true;
  if (!isRecord(json)) return false;
  const errors = json.errors;
  if (!Array.isArray(errors)) return false;
  const first = errors[0];
  if (!isRecord(first)) return false;
  return first.type === "TENANT_ALREADY_BUILT";
}

function parseBuildJobId(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const data = json.data;
  if (!isRecord(data)) return null;
  const id = data.jobId ?? data.job_id;
  if (typeof id === "string") return id;
  if (typeof id === "number") return String(id);
  return null;
}

function jobFinished(body: unknown): "completed" | "failed" | "running" {
  if (!isRecord(body)) return "running";
  if (body.isFailed === true || body.is_failed === true) return "failed";
  if (body.isCompleted === true || body.is_completed === true) return "completed";
  const state = readString(body.state);
  if (state === "failed") return "failed";
  if (state === "completed") return "completed";
  return "running";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function signin(
  base: string,
  email: string,
  password: string,
  correlationId: string,
): Promise<{ accessToken: string; organizationId: string } | null> {
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
  let json: unknown;
  try {
    json = (await res.json()) as unknown;
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return parseSigninToken(json);
}

async function currentHasBuiltAt(
  base: string,
  accessToken: string,
  organizationId: string,
  correlationId: string,
): Promise<boolean> {
  const res = await fetch(`${base}/api/organization/current`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "organization-id": organizationId,
      "x-request-id": correlationId,
      "x-correlation-id": correlationId,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return false;
  let json: unknown;
  try {
    json = (await res.json()) as unknown;
  } catch {
    return false;
  }
  if (!isRecord(json)) return false;
  const builtAt = json.builtAt ?? json.built_at;
  return builtAt !== null && builtAt !== undefined && builtAt !== "";
}

export async function fetchBuildOrganization(
  input: BuildOrgInput,
  log: (m: string) => void,
): Promise<BuildOrgResult> {
  const base = financeApiBase(input.internalBaseUrl);

  const creds = await signin(base, input.adminEmail, input.adminPassword, input.correlationId);
  if (!creds) {
    return { ok: false, error: "signin_failed" };
  }

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${creds.accessToken}`,
    "organization-id": creds.organizationId,
    "x-request-id": input.correlationId,
    "x-correlation-id": input.correlationId,
  };

  if (await currentHasBuiltAt(base, creds.accessToken, creds.organizationId, input.correlationId)) {
    log("Organization already built, skipping");
    return { ok: true, alreadyBuilt: true, financeOrganizationId: creds.organizationId };
  }

  const buildBody = {
    name: input.settings.name,
    location: input.settings.location,
    baseCurrency: input.settings.baseCurrency,
    timezone: input.settings.timezone,
    fiscalYear: input.settings.fiscalYear,
    language: input.settings.language,
    ...(input.settings.dateFormat ? { dateFormat: input.settings.dateFormat } : {}),
  };

  const buildRes = await fetch(`${base}/api/organization/build`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(buildBody),
    signal: AbortSignal.timeout(10_000),
  });

  const buildText = await buildRes.text();
  let buildJson: unknown;
  try {
    buildJson = buildText ? (JSON.parse(buildText) as unknown) : {};
  } catch {
    buildJson = { raw: buildText };
  }

  if (!buildRes.ok) {
    if (isTenantAlreadyBuilt(buildText, buildJson)) {
      log("Organization already built (TENANT_ALREADY_BUILT), treating as success");
      return { ok: true, alreadyBuilt: true, financeOrganizationId: creds.organizationId };
    }
    return {
      ok: false,
      error: `organization_build_http_${buildRes.status}: ${buildText.slice(0, 500)}`,
    };
  }

  const jobId = parseBuildJobId(buildJson);
  const deadline = Date.now() + TIMEOUT_MS;

  if (jobId) {
    log(`[build] polling organization build job id=${jobId}`);
    while (Date.now() < deadline) {
      const jobRes = await fetch(`${base}/api/organization/build/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: authHeaders,
        signal: AbortSignal.timeout(10_000),
      });
      let jobJson: unknown;
      try {
        jobJson = (await jobRes.json()) as unknown;
      } catch {
        jobJson = {};
      }
      if (!jobRes.ok) {
        return { ok: false, error: `build_job_poll_http_${jobRes.status}` };
      }
      const done = jobFinished(jobJson);
      if (done === "failed") {
        return { ok: false, error: "organization_build_job_failed" };
      }
      if (done === "completed") {
        break;
      }
      await sleep(POLL_MS);
    }
  } else {
    log("[build] no job id in response; polling /organization/current for builtAt");
    while (Date.now() < deadline) {
      if (await currentHasBuiltAt(base, creds.accessToken, creds.organizationId, input.correlationId)) {
        break;
      }
      await sleep(POLL_MS);
    }
  }

  if (!(await currentHasBuiltAt(base, creds.accessToken, creds.organizationId, input.correlationId))) {
    throw new Error("organization_build_timeout: builtAt not set within 120s");
  }

  return { ok: true, financeOrganizationId: creds.organizationId };
}
