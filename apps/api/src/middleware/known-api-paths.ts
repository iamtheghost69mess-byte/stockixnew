/** Control-plane API path prefixes (unknown paths return 404 before platform auth). */
const KNOWN_PATH_PREFIXES = [
  "/health",
  "/ready",
  "/public/",
  "/auth",
  "/webhooks/",
  "/internal/jobs",
  "/internal/organizations",
  "/internal/product-token",
  "/v1/",
  "/owners",
  "/admin/",
  "/audit-log",
  "/api-keys",
  "/tenants",
  "/search",
  "/plans",
  "/licenses",
  "/fingerprints/",
  "/notifications",
  "/pos/",
  "/pms/",
] as const;

/**
 * Legacy versioned path prefixes — requests to these paths are still served
 * but carry Deprecation + Sunset response headers pointing clients to /v1.
 * Sunset date: 2026-09-20.
 */
const LEGACY_VERSIONED_PREFIXES = [
  "/owners",
  "/admin/",
  "/audit-log",
  "/api-keys",
  "/tenants",
  "/search",
  "/plans",
  "/licenses",
  "/fingerprints/",
  "/notifications",
  "/pos/",
  "/pms/",
] as const;

export function isKnownControlPlanePath(path: string): boolean {
  if (path === "/health" || path === "/ready") return true;
  return KNOWN_PATH_PREFIXES.some(
    (prefix) => prefix !== "/health" && path.startsWith(prefix),
  );
}

export function isLegacyVersionedPath(path: string): boolean {
  return LEGACY_VERSIONED_PREFIXES.some((prefix) => path.startsWith(prefix));
}
