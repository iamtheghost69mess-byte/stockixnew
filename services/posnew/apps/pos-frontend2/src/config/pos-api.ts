/**
 * Base URL for the POS backend (same role as `VITE_BACKEND_URL` in pos-frontend).
 * Cross-origin requests use `credentials: "include"`; ensure CORS allows your Next origin.
 */
export function getPosApiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_POS_API_ORIGIN?.trim();
  if (raw) {
    const normalized = raw.replace(/\/$/, "");
    if (typeof window !== "undefined") {
      const appHost = String(window.location.hostname || "").toLowerCase();
      const isTenantLocalhost = appHost.endsWith(".localhost");
      if (isTenantLocalhost) {
        try {
          const parsed = new URL(normalized);
          const apiHost = String(parsed.hostname || "").toLowerCase();
          const isPlainLocalApi =
            apiHost === "localhost" ||
            apiHost === "127.0.0.1" ||
            apiHost === "::1";
          if (isPlainLocalApi) {
            const port = parsed.port ? `:${parsed.port}` : "";
            return `${parsed.protocol}//${appHost}${port}`;
          }
        } catch {
          // keep explicit env origin as-is when malformed
        }
      }
    }
    return normalized;
  }
  if (typeof window !== "undefined") {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host.endsWith(".localhost")) {
      return `${window.location.protocol}//${host}:8010`;
    }
  }
  /** Match `VITE_BACKEND_URL` default (localhost) so session cookies align with the Vite POS app. */
  return "http://localhost:8010";
}
