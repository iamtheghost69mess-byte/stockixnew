/** Decode JWT `exp` (seconds since epoch) without verifying the signature — UX hint only. */
export function jwtExpiresAtMs(
	accessToken: string | null | undefined,
): number | null {
	if (!accessToken) return null;
	const parts = accessToken.split(".");
	if (parts.length < 2) return null;
	try {
		const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
		const json = JSON.parse(atob(padded)) as { exp?: unknown };
		const exp = json?.exp;
		if (typeof exp !== "number") return null;
		return exp * 1000;
	} catch {
		return null;
	}
}
