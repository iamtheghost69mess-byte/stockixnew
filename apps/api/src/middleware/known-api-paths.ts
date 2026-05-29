/** Control-plane API path prefixes (unknown paths return 404 before platform auth). */
const KNOWN_PATH_PREFIXES = [
  "/health",
  "/ready",
  "/public/",
  "/auth",
  "/webhooks/",
  "/internal/jobs",
  "/internal/organizations",
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
