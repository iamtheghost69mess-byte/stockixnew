import { requireEnv } from "./lib/require-env.js";

const PMS_PROXY_TIMEOUT_MS = 15_000;

function getPmsBase(): string {
  return requireEnv("PMS_BASE_URL", "http://localhost:3003");
}

export async function pmsProxy(
  path: string,
  method: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string | undefined>;
    requestId?: string;
  },
): Promise<Response> {
  const url = new URL(`${getPmsBase()}${path.startsWith("/") ? path : `/${path}`}`);
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PMS_PROXY_TIMEOUT_MS);

  try {
    return await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options?.requestId ? { "x-request-id": options.requestId } : {}),
        ...options?.headers,
      },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`PMS proxy timeout after ${PMS_PROXY_TIMEOUT_MS}ms: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function pmsProxyJson(
  path: string,
  method: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string | undefined>;
    requestId?: string;
  },
): Promise<{ data: unknown; status: number }> {
  const res = await pmsProxy(path, method, options);
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
