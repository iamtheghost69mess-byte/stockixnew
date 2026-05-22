import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const enforceCsp = process.env.PLATFORM_CSP_ENFORCE === "true";

function buildConnectSrc() {
	const override = process.env.NEXT_PUBLIC_PLATFORM_CSP_CONNECT_SRC?.trim();
	if (override) return override;
	const parts = ["'self'"];
	const api = process.env.NEXT_PUBLIC_POS_API_ORIGIN?.trim();
	if (api) {
		try {
			const u = new URL(api);
			parts.push(`${u.protocol}//${u.host}`);
		} catch {
			/* ignore */
		}
	}
	if (process.env.NODE_ENV !== "production") {
		parts.push(
			"http://localhost:*",
			"http://127.0.0.1:*",
			"ws://localhost:*",
			"ws://127.0.0.1:*",
		);
	}
	return parts.join(" ");
}

const connectSrc = buildConnectSrc();
const platformApiProxyOrigin =
	process.env.POS_API_ORIGIN?.trim().replace(/\/$/, "") ||
	process.env.NEXT_PUBLIC_POS_API_ORIGIN?.trim().replace(/\/$/, "") ||
	"http://localhost:8010";

const cspReportOnly = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: *.backblazeb2.com",
	"font-src 'self' data:",
	`connect-src ${connectSrc}`,
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
].join("; ");

/** Tighter baseline when `PLATFORM_CSP_ENFORCE=true` (no `unsafe-eval`; keep inline for Next/shadcn). */
const cspEnforced = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: *.backblazeb2.com",
	"font-src 'self' data:",
	`connect-src ${connectSrc}`,
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
].join("; ");

const nextConfig = {
	transpilePackages: ["@restaurant-pos/ui"],
	allowedDevOrigins: ["127.0.0.1", "localhost"],
	experimental: {
		externalDir: true,
	},
	async rewrites() {
		return [
			{
				source: "/api/platform/v1/:path*",
				destination: `${platformApiProxyOrigin}/api/platform/v1/:path*`,
			},
			{
				source: "/uploads/:path*",
				destination: `${platformApiProxyOrigin}/uploads/:path*`,
			},
		];
	},
	async headers() {
		const security = [
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			{ key: "X-Frame-Options", value: "DENY" },
			{
				key: enforceCsp
					? "Content-Security-Policy"
					: "Content-Security-Policy-Report-Only",
				value: enforceCsp ? cspEnforced : cspReportOnly,
			},
		];
		return [{ source: "/(.*)", headers: security }];
	},
};

export default withBundleAnalyzer(nextConfig);
