import { apiConfig } from "@repo/config";

/** Browser origins for a tenant POS stack (comma-separated for CORS_ORIGINS). */
export function buildPosCorsOrigins(slug: string): string {
  const rootDomain = apiConfig.rootDomain || "example.com";
  const scheme = (apiConfig.publicBaseUrlScheme || "https").replace(/:+$/, "");
  if (rootDomain === "localhost") {
    return [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://localhost:5173",
    ].join(",");
  }
  const origins = [
    `${scheme}://${slug}-pos.${rootDomain}`,
    `${scheme}://${slug}.${rootDomain}`,
    `${scheme}://dashboard.${rootDomain}`,
  ];
  const dashboardUrl = apiConfig.dashboardUrl?.trim();
  if (dashboardUrl) {
    try {
      origins.push(new URL(dashboardUrl).origin);
    } catch {
      // ignore invalid dashboard URL
    }
  }
  return [...new Set(origins)].join(",");
}
