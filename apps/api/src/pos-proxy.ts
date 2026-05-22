const POS_PLATFORM_BASE =
  process.env.POS_PLATFORM_BASE_URL ?? "http://localhost:8010";
const POS_PLATFORM_KEY = process.env.POS_PLATFORM_API_KEY ?? "";

export async function posProxy(
  path: string,
  method: string,
  body?: unknown,
  query?: Record<string, string | undefined>,
): Promise<Response> {
  const url = new URL(`${POS_PLATFORM_BASE}/api/platform/v1${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  return fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(POS_PLATFORM_KEY ? { "X-Api-Key": POS_PLATFORM_KEY } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function posProxyJson(
  path: string,
  method: string,
  body?: unknown,
  query?: Record<string, string | undefined>,
): Promise<{ data: unknown; status: number }> {
  const res = await posProxy(path, method, body, query);
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
  return POS_PLATFORM_BASE.length > 0;
}

export function getPosPlatformBaseUrl(): string {
  return POS_PLATFORM_BASE;
}
