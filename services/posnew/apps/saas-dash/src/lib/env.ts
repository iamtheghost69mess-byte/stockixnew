export function getPosApiOrigin(): string {
	const o = process.env.NEXT_PUBLIC_POS_API_ORIGIN?.replace(/\/$/, "") || "";
	if (!o && typeof window !== "undefined") {
		console.warn("NEXT_PUBLIC_POS_API_ORIGIN is not set.");
	}
	return o;
}
