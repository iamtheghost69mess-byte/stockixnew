import { posConfig } from "@repo/config";

function getPosPlatformBase(override?: string): string {
  const url = override?.trim() || posConfig.platformBaseUrl?.trim();
  if (!url) {
    throw new Error(
      "POS_PLATFORM_BASE_URL is required. In production this is constructed from tenant slug via buildTenantServiceUrl.",
    );
  }
  return url;
}

export async function posProxy(
  path: string,
  method: string,
  body?: unknown,
  query?: Record<string, string | undefined>,
  baseUrl?: string,
  requestId?: string,
): Promise<Response> {
  const url = new URL(`${getPosPlatformBase(baseUrl)}/api/platform/v1${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  const platformApiKey = posConfig.platformApiKey;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    return await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Proto": "https",
        ...(platformApiKey ? { "X-Api-Key": platformApiKey } : {}),
        ...(requestId ? { "x-request-id": requestId, "x-correlation-id": requestId } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`POS proxy timeout after 15000ms: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function posProxyJson(
  path: string,
  method: string,
  body?: unknown,
  query?: Record<string, string | undefined>,
  baseUrl?: string,
  requestId?: string,
): Promise<{ data: unknown; status: number }> {
  let res: Response;
  try {
    res = await posProxy(path, method, body, query, baseUrl, requestId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "POS platform unreachable";
    const posBase = posConfig.platformBaseUrl?.trim() ?? "(not set)";
    const posUi = posConfig.frontendUrl?.trim() ?? "(not set)";
    return {
      data: {
        error: "pos_unavailable",
        message,
        hint: `Set POS_PLATFORM_BASE_URL and POS_FRONTEND_URL in .env, then run pnpm dev (POS API ${posBase}, UI ${posUi}). First time: pnpm dev:pos:install.`,
      },
      status: 503,
    };
  }
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { raw: text };
    }
  }
  return { data, status: res.status };
}

/** Whether POS platform proxy is configured (for dashboard nav visibility). */
export function isPosProxyConfigured(): boolean {
  return Boolean(posConfig.platformBaseUrl?.trim());
}

export function getPosPlatformBaseUrl(): string {
  return getPosPlatformBase();
}

/** Resolve POS organization for a Stockix control-plane tenant UUID. */
export async function getPosOrgByStockixTenantId(
  stockixTenantId: string,
  requestId?: string,
): Promise<{ data: unknown; status: number }> {
  const id = stockixTenantId.trim();
  return posProxyJson(
    `/organizations/by-stockix-tenant/${encodeURIComponent(id)}`,
    "GET",
    undefined,
    undefined,
    undefined,
    requestId,
  );
}
