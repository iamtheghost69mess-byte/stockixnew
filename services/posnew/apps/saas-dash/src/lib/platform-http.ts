"use client";

import { useAuthStore } from "@/lib/auth-store";
import { platformApiBaseUrl } from "@/lib/platform-constants";
import {
	getPlatformToken,
	type PlatformHttpError,
	requestTokenRefresh,
	retryAfterSecondsFromResponse,
	savePlatformRefreshToken,
	savePlatformToken,
	throwPlatformResponseError,
} from "@/lib/platform-public-http";
import { singleFlightRefresh } from "@/lib/refresh-mutex";

export {
	platformPublicFetch,
	platformPublicJson,
	requestTokenRefresh,
	retryAfterSecondsFromResponse,
} from "@/lib/platform-public-http";
export type { PlatformHttpError };

function requestId(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID)
		return crypto.randomUUID();
	return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function tryRefresh(): Promise<boolean> {
	const r = await requestTokenRefresh(""); // Tokens are in cookies now, empty string placeholder
	if (r.ok) {
		savePlatformToken(r.accessToken);
		savePlatformRefreshToken(r.refreshToken);
		return true;
	}
	if (r.reuseDetected) {
		useAuthStore.getState().logout({ sessionExpired: true });
	}
	return false;
}

export async function platformFetch(
	path: string,
	init: RequestInit & { idempotencyKey?: string } = {},
): Promise<Response> {
	const base = platformApiBaseUrl();
	const url = path.startsWith("http")
		? path
		: `${base}${path.startsWith("/") ? path : `/${path}`}`;

	const build = () => {
		const headers = new Headers(init.headers);
		headers.set("X-Request-Id", requestId());
		if (init.idempotencyKey)
			headers.set("Idempotency-Key", init.idempotencyKey);

		if (process.env.NODE_ENV === "development") {
			const token = getPlatformToken();
			if (token && !headers.has("Authorization")) {
				headers.set("Authorization", `Bearer ${token}`);
			}
		}

		return fetch(url, { ...init, headers, credentials: "include" });
	};

	let res = await build();

	if (
		res.status === 401 &&
		!path.includes("/auth/login") &&
		!path.includes("/auth/refresh")
	) {
		const ok = await singleFlightRefresh(() => tryRefresh());
		if (ok) res = await build();
		else useAuthStore.getState().openSessionExpired();
	}

	return res;
}

export async function platformJson<T>(
	path: string,
	init?: RequestInit & { idempotencyKey?: string },
): Promise<T> {
	const res = await platformFetch(path, init || {});
	const text = await res.text();
	let body: unknown = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	if (!res.ok) {
		throwPlatformResponseError(res, body);
	}
	return body as T;
}
