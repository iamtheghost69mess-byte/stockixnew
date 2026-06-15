import { formatApiError } from "@/lib/api-errors";

export type ClientFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function normalizePath(path: string): string {
  if (path.startsWith("/api")) return path;
  return path.startsWith("/") ? `/api${path}` : `/api/${path}`;
}

export async function clientFetch<T = unknown>(
  path: string,
  options: ClientFetchOptions = {},
): Promise<T> {
  const { body, ...rest } = options;
  const response = await fetch(normalizePath(path), {
    ...rest,
    cache: rest.cache ?? "no-store",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : formatApiError(data, `Request failed with status ${response.status}`);
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export const clientGet = <T = unknown>(path: string, options?: Omit<ClientFetchOptions, "method" | "body">) =>
  clientFetch<T>(path, { ...options, method: "GET" });

export const clientPost = <T = unknown>(
  path: string,
  body?: unknown,
  options?: Omit<ClientFetchOptions, "method" | "body">,
) => clientFetch<T>(path, { ...options, method: "POST", body });

export const clientPatch = <T = unknown>(
  path: string,
  body?: unknown,
  options?: Omit<ClientFetchOptions, "method" | "body">,
) => clientFetch<T>(path, { ...options, method: "PATCH", body });

export const clientDelete = <T = unknown>(path: string, options?: Omit<ClientFetchOptions, "method" | "body">) =>
  clientFetch<T>(path, { ...options, method: "DELETE" });
