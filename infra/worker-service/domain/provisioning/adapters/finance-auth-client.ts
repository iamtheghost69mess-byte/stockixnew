import { normalizeFinanceApiJson } from "@repo/shared/finance-api";

export type FinanceAuthSession = {
  accessToken: string;
  organizationId: string;
  tenantId: number | null;
};

export type FinanceSigninError = {
  ok: false;
  code: string;
  detail: string;
};

export type FinanceSigninResult = ({ ok: true } & FinanceAuthSession) | FinanceSigninError;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function parseAuthSession(body: unknown): FinanceAuthSession | null {
  if (!isRecord(body)) return null;
  const accessToken =
    readString(body.accessToken) ?? readString(body.access_token) ?? readString(body.token);
  const organizationId =
    readString(body.organizationId) ?? readString(body.organization_id);
  const tenantIdRaw = body.tenantId ?? body.tenant_id;
  const tenantId = Number(tenantIdRaw);
  if (!accessToken || !organizationId) return null;
  return {
    accessToken,
    organizationId,
    tenantId: Number.isFinite(tenantId) && tenantId > 0 ? tenantId : null,
  };
}

function financeApiBase(internalBaseUrl: string): string {
  return internalBaseUrl.replace(/\/+$/, "");
}

function classifySigninHttpError(status: number, bodyText: string): FinanceSigninError {
  const detail = bodyText.slice(0, 500);
  if (status === 401 && detail.includes("No organization found")) {
    return { ok: false, code: "signin_no_organization", detail };
  }
  if (status === 401) {
    return { ok: false, code: "signin_invalid_credentials", detail };
  }
  return { ok: false, code: `signin_http_${status}`, detail };
}

export function formatSigninError(error: FinanceSigninError): string {
  return `${error.code}: ${error.detail}`;
}

export async function signinToFinanceSession(
  internalBaseUrl: string,
  email: string,
  password: string,
  correlationId: string,
): Promise<FinanceSigninResult> {
  const base = financeApiBase(internalBaseUrl);
  try {
    const res = await fetch(`${base}/api/auth/signin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": correlationId,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({ credential: email, password }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return classifySigninHttpError(res.status, text);
    }
    let json: unknown;
    try {
      json = text ? normalizeFinanceApiJson(JSON.parse(text) as unknown) : {};
    } catch {
      return {
        ok: false,
        code: "signin_parse_failed",
        detail: text.slice(0, 500) || "invalid JSON",
      };
    }
    const session = parseAuthSession(json);
    if (!session) {
      return {
        ok: false,
        code: "signin_parse_failed",
        detail: text.slice(0, 500) || "missing token or organizationId",
      };
    }
    return { ok: true, ...session };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "signin_network_error", detail };
  }
}

const DEFAULT_SIGNIN_RETRY_ATTEMPTS = 5;
const DEFAULT_SIGNIN_RETRY_DELAY_MS = 2_000;

export async function signinWithRetry(
  internalBaseUrl: string,
  email: string,
  password: string,
  correlationId: string,
  options?: {
    maxAttempts?: number;
    delayMs?: number;
    expectedOrganizationId?: string;
    log?: (message: string) => void;
  },
): Promise<FinanceSigninResult> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_SIGNIN_RETRY_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_SIGNIN_RETRY_DELAY_MS;
  let lastError: FinanceSigninError = {
    ok: false,
    code: "signin_network_error",
    detail: "no attempts made",
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await signinToFinanceSession(
      internalBaseUrl,
      email,
      password,
      correlationId,
    );
    if (result.ok) {
      if (
        options?.expectedOrganizationId
        && result.organizationId !== options.expectedOrganizationId
      ) {
        lastError = {
          ok: false,
          code: "signin_org_mismatch",
          detail: `expected ${options.expectedOrganizationId}, got ${result.organizationId}`,
        };
        options.log?.(
          `[signin] attempt ${attempt}/${maxAttempts} org mismatch: ${lastError.detail}`,
        );
      } else {
        return result;
      }
    } else {
      lastError = result;
      options?.log?.(
        `[signin] attempt ${attempt}/${maxAttempts} failed: ${formatSigninError(result)}`,
      );
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return lastError;
}

/** Throws with structured message (for org-provision-runtime). */
export async function signinToFinanceSessionOrThrow(
  internalBaseUrl: string,
  email: string,
  password: string,
  correlationId: string,
): Promise<FinanceAuthSession> {
  const result = await signinToFinanceSession(internalBaseUrl, email, password, correlationId);
  if (!result.ok) {
    throw new Error(formatSigninError(result));
  }
  return result;
}
