import { posConfig } from "@repo/config";

function apiKeyOrThrow(): string {
  const key = posConfig.platformApiKey.trim();
  if (key.length < 10) {
    throw new Error("POS_PLATFORM_API_KEY is required for integration verify");
  }
  return key;
}

function posApiBase(posHostPort: number, posBaseUrl?: string): string {
  const fromEnv = posBaseUrl ?? posConfig.platformBaseUrl;
  if (fromEnv && !fromEnv.includes("localhost:8010")) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `http://127.0.0.1:${posHostPort}`;
}

/**
 * Confirms POS org has Bigcapital integration enabled after wire PUT.
 */
export async function verifyPosBigcapitalIntegration(params: {
  posOrganizationId: string;
  posHostPort: number;
  financeTenantId: number;
  posBaseUrl?: string;
  log: (message: string) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = apiKeyOrThrow();
  const base = posApiBase(params.posHostPort, params.posBaseUrl);
  const url = `${base}/api/platform/v1/organizations/${params.posOrganizationId}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
        "X-Forwarded-Proto": "https",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `integration_verify_http_${res.status}:${text.slice(0, 200)}`,
      };
    }
    const body = JSON.parse(text) as {
      success?: boolean;
      data?: {
        financeTenantId?: number;
        bigcapitalIntegrationEnabled?: boolean;
        integration?: { bigcapital?: { financeTenantId?: number } };
      };
    };
    const data = body?.data;
    const enabled = data?.bigcapitalIntegrationEnabled === true;
    const linkedId = Number(
      data?.integration?.bigcapital?.financeTenantId ?? data?.financeTenantId ?? 0,
    );
    if (!enabled) {
      return { ok: false, error: "integration_verify_not_enabled" };
    }
    if (linkedId > 0 && linkedId !== params.financeTenantId) {
      return {
        ok: false,
        error: `integration_verify_tenant_mismatch:expected=${params.financeTenantId}:got=${linkedId}`,
      };
    }
    params.log("[provision][pos] integration verify OK");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `integration_verify_failed:${msg}` };
  }
}
