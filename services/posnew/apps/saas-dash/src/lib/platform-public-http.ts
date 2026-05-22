"use client";

import { mapErrorCode, platformMessage } from "@/lib/messages/platform";
import { platformApiBaseUrl } from "@/lib/platform-constants";
import { isRefreshReuseResponse } from "@/lib/platform-refresh-errors";

const PLATFORM_TOKEN_KEY = "platform_access_token";
const PLATFORM_REFRESH_TOKEN_KEY = "platform_refresh_token";

interface StoredToken {
	token: string;
	expiresAt: number;
}

/** Dev-only: Persist token for cross-port fallback. */
export function savePlatformToken(token: string | undefined) {
	if (process.env.NODE_ENV !== "development" || typeof window === "undefined")
		return;
	if (!token) {
		localStorage.removeItem(PLATFORM_TOKEN_KEY);
	} else {
		const payload: StoredToken = {
			token,
			expiresAt: Date.now() + 15 * 60 * 1000,
		};
		localStorage.setItem(PLATFORM_TOKEN_KEY, JSON.stringify(payload));
	}
}

/**
 * Persist refresh token for credentialed-cookie fallback (cross-site / cookie quirks).
 * Login already exposes this value in JSON; httpOnly cookies remain primary when they work.
 */
export function savePlatformRefreshToken(token: string | undefined) {
	if (process.env.NODE_ENV !== "development" || typeof window === "undefined")
		return;
	if (!token) {
		localStorage.removeItem(PLATFORM_REFRESH_TOKEN_KEY);
	} else {
		localStorage.setItem(PLATFORM_REFRESH_TOKEN_KEY, token);
	}
}

/** Dev-only: Retrieve token for Authorization bearer header, checking for expiry. */
export function getPlatformToken(): string | null {
	if (process.env.NODE_ENV !== "development" || typeof window === "undefined")
		return null;
	const raw = localStorage.getItem(PLATFORM_TOKEN_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as StoredToken;
		if (parsed.expiresAt < Date.now()) {
			localStorage.removeItem(PLATFORM_TOKEN_KEY);
			return null;
		}
		return parsed.token;
	} catch {
		return null;
	}
}

/** Retrieve refresh token saved at login / last rotation (fallback when cookie-only refresh fails). */
export function getPlatformRefreshToken(): string | null {
	if (process.env.NODE_ENV !== "development" || typeof window === "undefined")
		return null;
	return localStorage.getItem(PLATFORM_REFRESH_TOKEN_KEY);
}

export type PlatformHttpError = {
	status: number;
	code: string;
	message: string;
	retryAfterSec?: number;
	raw?: unknown;
};

function requestId(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID)
		return crypto.randomUUID();
	return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function retryAfterSecondsFromResponse(
	res: Response,
): number | undefined {
	const header = res.headers.get("Retry-After");
	if (!header) return undefined;
	const n = Number(header);
	if (!Number.isNaN(n)) return n;
	const d = Date.parse(header);
	if (!Number.isNaN(d)) return Math.max(0, Math.ceil((d - Date.now()) / 1000));
	return undefined;
}

function userFacingMessage(
	status: number,
	problem: { type?: string; title?: string; detail?: string; code?: string },
	retryAfterSec?: number,
): string {
	const mappedCode = mapErrorCode(status, problem?.code);
	if (status === 429) {
		return platformMessage(mappedCode, { seconds: retryAfterSec ?? "" });
	}
	if (status === 400 || status === 422) {
		const d = problem?.detail || problem?.title;
		if (
			typeof d === "string" &&
			d.length > 0 &&
			d.length <= 200 &&
			!/[\n\r]/.test(d) &&
			!/at\s+\S+\s+\(/.test(d)
		) {
			return d;
		}
		return platformMessage("validation.failed");
	}
	return platformMessage(mappedCode);
}

function buildUrl(path: string): string {
	const base = platformApiBaseUrl();
	return path.startsWith("http")
		? path
		: `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseJsonBody(res: Response): Promise<unknown> {
	const text = await res.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export function throwPlatformResponseError(
	res: Response,
	body: unknown,
): never {
	const problem = body as {
		type?: string;
		title?: string;
		detail?: string;
		code?: string;
	};
	const retryAfterSec = retryAfterSecondsFromResponse(res);
	const code = mapErrorCode(res.status, problem?.code);
	const message = userFacingMessage(res.status, problem, retryAfterSec);
	const err: PlatformHttpError = {
		status: res.status,
		code,
		message,
		retryAfterSec,
		raw: body,
	};
	throw err;
}

export async function platformPublicFetch(
	path: string,
	init: RequestInit & { idempotencyKey?: string } = {},
): Promise<Response> {
	const url = buildUrl(path);
	const headers = new Headers(init.headers);
	headers.set("X-Request-Id", requestId());
	if (init.body != null && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);
	if (process.env.NODE_ENV === "development") {
		const token = getPlatformToken();
		const omitBearer =
			path.includes("/auth/login") || path.includes("/auth/refresh");
		if (token && !headers.has("Authorization") && !omitBearer) {
			headers.set("Authorization", `Bearer ${token}`);
		}
	}
	const { idempotencyKey: _, ...rest } = init;
	return fetch(url, { ...rest, headers, credentials: "include" });
}

/** Lightweight session check without the tenant `platformJson` refresh wrapper (used by SSE recovery). */
export async function probePlatformSessionAlive(): Promise<
	"alive" | "unauthenticated" | "offline"
> {
	try {
		const res = await platformPublicFetch("/auth/me", { method: "GET" });
		if (res.status === 200) return "alive";
		if (res.status === 401) return "unauthenticated";
		return "offline";
	} catch {
		return "offline";
	}
}

export async function platformPublicJson<T>(
	path: string,
	init?: RequestInit & { idempotencyKey?: string },
): Promise<T> {
	const res = await platformPublicFetch(path, init || {});
	const body = await parseJsonBody(res);
	if (!res.ok) {
		throwPlatformResponseError(res, body);
	}
	return body as T;
}

export type RefreshRequestResult =
	| { ok: true; accessToken: string; refreshToken: string }
	| { ok: false; reuseDetected: boolean; raw?: unknown };

/** Raw refresh call — no Zustand; callers handle logout on reuse. */
export async function requestTokenRefresh(
	_unused?: string,
): Promise<RefreshRequestResult> {
	const tryCookieOnly = () =>
		platformPublicJson<{
			success?: boolean;
			accessToken?: string;
			refreshToken?: string;
		}>("/auth/refresh", { method: "POST" });

	/** Body wins over cookies on the server — development-only fallback. */
	const tryWithRefreshBody = (refreshToken: string) =>
		platformPublicJson<{
			success?: boolean;
			accessToken?: string;
			refreshToken?: string;
		}>("/auth/refresh", {
			method: "POST",
			body: JSON.stringify({ refreshToken }),
		});

	const mapSuccess = (json: {
		success?: boolean;
		accessToken?: string;
		refreshToken?: string;
	}): RefreshRequestResult => {
		if (!json?.success) return { ok: false, reuseDetected: false };
		return {
			ok: true,
			accessToken: json.accessToken || "",
			refreshToken: json.refreshToken || "",
		};
	};

	try {
		const json = await tryCookieOnly();
		return mapSuccess(json);
	} catch (e) {
		const pe = e as PlatformHttpError;

		// In development only, retry with the
		// last refresh token from login or prior rotation (backend: body before cookie).
		if (pe?.status === 401 && process.env.NODE_ENV === "development") {
			const fallbackToken = getPlatformRefreshToken();
			if (fallbackToken) {
				try {
					const json = await tryWithRefreshBody(fallbackToken);
					return mapSuccess(json);
				} catch {
					/* fallback failed, continue to error */
				}
			}
		}

		if (pe?.raw != null && isRefreshReuseResponse(pe.raw)) {
			return { ok: false, reuseDetected: true, raw: pe.raw };
		}
		return { ok: false, reuseDetected: false };
	}
}

export async function platformLogout(): Promise<void> {
	try {
		await platformPublicJson<{ success?: boolean }>("/auth/logout", {
			method: "POST",
		});
	} finally {
		savePlatformToken(undefined);
		savePlatformRefreshToken(undefined);
	}
}
