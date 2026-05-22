const PMS_BASE = process.env.PMS_BASE_URL ?? "http://localhost:3003";

export async function pmsProxy(
  path: string,
  method: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string | undefined>;
  },
): Promise<Response> {
  const url = new URL(`${PMS_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  return fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export async function pmsProxyJson(
  path: string,
  method: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string | undefined>;
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
