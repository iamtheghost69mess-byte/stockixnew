function readProblemCode(body: unknown): string | undefined {
	if (!body || typeof body !== "object") return undefined;
	const o = body as { code?: string };
	if (typeof o.code === "string") return o.code;
	return undefined;
}

export function isRefreshReuseResponse(body: unknown): boolean {
	return readProblemCode(body) === "PLATFORM_REFRESH_REUSE";
}
