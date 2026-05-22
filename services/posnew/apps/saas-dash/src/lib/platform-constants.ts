/** Pinned platform API path prefix (v1). */
export const PLATFORM_API_PREFIX = "/api/platform/v1" as const;

/** Local API when `NEXT_PUBLIC_POS_API_ORIGIN` is unset (matches `apps/pos-backend/.env.example` PORT). */
const DEV_DEFAULT_API_ORIGIN = "http://localhost:8010";

export function platformApiBaseUrl(): string {
	// Browser requests should stay same-origin and go through Next rewrite proxy.
	if (typeof window !== "undefined") {
		return `${window.location.origin}${PLATFORM_API_PREFIX}`;
	}

	const fromEnv =
		process.env.NEXT_PUBLIC_POS_API_ORIGIN?.replace(/\/$/, "") || "";
	const origin =
		fromEnv ||
		(process.env.NODE_ENV === "development" ? DEV_DEFAULT_API_ORIGIN : "");
	return `${origin}${PLATFORM_API_PREFIX}`;
}
