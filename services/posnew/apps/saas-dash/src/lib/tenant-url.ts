const tenantOriginFromEnv =
	process.env.NEXT_PUBLIC_TENANT_APP_ORIGIN?.trim() || "";

export function tenantAppOrigin(): string | null {
	if (!tenantOriginFromEnv) return null;
	return tenantOriginFromEnv.replace(/\/$/, "");
}

export function tenantOrgUrl(
	orgSlug: string | null | undefined,
): string | null {
	const origin = tenantAppOrigin();
	if (!origin) return null;
	const slug = String(orgSlug || "").trim();
	if (!slug) return null;
	try {
		const base = new URL(origin);
		const host = String(base.hostname || "").toLowerCase();
		const isLocal =
			host === "localhost" ||
			host === "127.0.0.1" ||
			host === "::1" ||
			host.endsWith(".localhost");
		if (isLocal) {
			const portPart = base.port ? `:${base.port}` : "";
			// Browsers resolve *.localhost to loopback, so this keeps
			// subdomain tenancy behavior available in local development.
			return `${base.protocol}//${encodeURIComponent(slug)}.localhost${portPart}`;
		}

		const parts = host.split(".");
		if (parts.length < 3) return null;
		const rootHost = parts.slice(1).join(".");
		const portPart = base.port ? `:${base.port}` : "";
		return `${base.protocol}//${encodeURIComponent(slug)}.${rootHost}${portPart}`;
	} catch {
		return null;
	}
}
