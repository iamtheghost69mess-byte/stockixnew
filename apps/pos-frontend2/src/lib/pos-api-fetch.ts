import { getPosApiOrigin } from "@/config/pos-api";
import { sanitizePosApiErrorMessage } from "@/lib/format-pos-api-error";

const LOCATION_HEADER = "X-Location-Id";
export const POS_ACCESS_TOKEN_STORAGE_KEY = "pos_access_token";
export const POS_REFRESH_TOKEN_STORAGE_KEY = "pos_refresh_token";

interface StoredToken {
  token: string;
  expiresAt: number;
}

/** Dev-only: Persist token to localStorage as a fallback. Access token lasts 15m in this fallback. */
export function savePosAccessToken(token: string | undefined) {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
  if (!token) {
    localStorage.removeItem(POS_ACCESS_TOKEN_STORAGE_KEY);
  } else {
    const payload: StoredToken = {
      token,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    localStorage.setItem(POS_ACCESS_TOKEN_STORAGE_KEY, JSON.stringify(payload));
  }
}

/** Dev-only: Persist refresh token for fallback. */
export function savePosRefreshToken(token: string | undefined) {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
  if (!token) {
    localStorage.removeItem(POS_REFRESH_TOKEN_STORAGE_KEY);
  } else {
    localStorage.setItem(POS_REFRESH_TOKEN_STORAGE_KEY, token);
  }
}

/** Dev-only: Retrieve token for Authorization header, checking for expiry. */
function getPosAccessToken(): string | null {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return null;
  const raw = localStorage.getItem(POS_ACCESS_TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredToken;
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem(POS_ACCESS_TOKEN_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

/** Dev-only: Retrieve refresh token for fallback. */
export function getPosRefreshToken(): string | null {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return null;
  return localStorage.getItem(POS_REFRESH_TOKEN_STORAGE_KEY);
}

/** Remove dev fallback auth tokens from localStorage. */
export function clearPosDevTokens() {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
  localStorage.removeItem(POS_ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(POS_REFRESH_TOKEN_STORAGE_KEY);
}

/** Returned with GET /api/users (staff list). */
export type PosStaffListLimits = {
  maxUsers: number;
  staffCount: number;
  licenseStartsAt?: string | null;
  licenseEndsAt?: string | null;
};

export type PosApiJson<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  page?: number;
  limit?: number;
  total?: number;
  limits?: PosStaffListLimits;
};

function readLocationScope(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("pos-location-scope");
  } catch {
    return null;
  }
}

/**
 * Login / register / refresh — no `Authorization` header (avoids sending a stale bearer during sign-in).
 * Still uses `credentials: "include"` so httpOnly cookies work when the browser sends them.
 */
export async function posPublicFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${getPosApiOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body != null && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
}

/** Browser fetch to POS backend with cookies + optional location scope (matches pos-frontend axios wrapper). */
export async function posApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${getPosApiOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body != null && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (process.env.NODE_ENV === "development") {
    const token = getPosAccessToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const loc = readLocationScope();
  if (loc && !headers.has(LOCATION_HEADER)) headers.set(LOCATION_HEADER, loc);

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
  return response;
}

export async function posApiJson<T>(path: string, init: RequestInit = {}): Promise<PosApiJson<T>> {
  const res = await posApiFetch(path, init);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  const obj = body as PosApiJson<T> & { message?: string };
  if (!res.ok) {
    const raw = (typeof obj?.message === "string" && obj.message) || res.statusText || `Request failed (${res.status})`;
    const err = new Error(sanitizePosApiErrorMessage(raw)) as Error & {
      code?: string;
      status?: number;
    };
    const code = (body && typeof body === "object" && "code" in body ? (body as { code?: unknown }).code : null);
    if (typeof code === "string" && code.trim()) {
      err.code = code;
    }
    err.status = res.status;
    throw err;
  }
  return obj;
}

/** GET /api/auth/session — always 200 when the route is reachable; never throws on logged-out state. */
export type PosAuthSessionJson<T> = {
  success?: boolean;
  authenticated?: boolean;
  data?: T;
};

export async function posAuthSessionJson<T>(): Promise<PosAuthSessionJson<T>> {
  const res = await posApiFetch("/api/auth/session");
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  const obj = body as PosAuthSessionJson<T>;
  if (!res.ok) {
    return { success: false, authenticated: false };
  }
  return obj;
}
