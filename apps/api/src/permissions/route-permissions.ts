import type { Permission } from "@repo/shared/permissions";

/**
 * Required permissions per API route (all must be granted).
 * null = public / no owner RBAC (POS, auth login, webhooks).
 */
export function requiredPermissionsForRoute(
  pathname: string,
  method: string,
): readonly Permission[] | null {
  const m = method.toUpperCase();
  if (pathname === "/health") return null;
  if (pathname.startsWith("/auth")) return null;
  if (pathname.startsWith("/webhooks/")) return null;
  if (pathname.startsWith("/internal/jobs")) return null;
  if (pathname.startsWith("/internal/organizations")) return null;
  if (m === "POST" && pathname === "/licenses/activate") return null;
  if (m === "POST" && pathname === "/licenses/verify-offline") return null;
  if (m === "GET" && pathname.startsWith("/public/tenant-orgs/")) return null;

  if (pathname === "/admin/orphan-check" && m === "GET") return ["*"];
  if (pathname.startsWith("/admin/roles")) {
    if (m === "GET") return ["roles.manage"];
    return ["roles.manage"];
  }
  if (pathname.startsWith("/admin/email-logs")) return ["email_logs.read"];

  if (pathname.startsWith("/plans")) {
    if (m === "GET") return ["plans.read"];
    return ["plans.manage"];
  }

  if (pathname === "/tenants/export.csv" && m === "GET") return ["tenants.read"];
  if (pathname === "/licenses/export.csv" && m === "GET") return ["licenses.read"];
  if (pathname === "/search" && m === "GET") return ["tenants.read"];

  if (pathname === "/licenses/generate" && m === "POST") return ["*"];

  if (pathname.startsWith("/licenses")) {
    if (m === "GET" && /^\/licenses\/sync-audit\/[^/]+$/.test(pathname)) {
      return ["*"];
    }
    if (m === "GET") return ["licenses.read"];
    if (m === "POST" && pathname.endsWith("/extend")) return ["licenses.extend"];
    if (m === "POST" && pathname.endsWith("/reactivate")) return ["licenses.extend"];
    if (m === "POST" && pathname.endsWith("/suspend")) return ["licenses.suspend"];
    if (m === "PATCH") return ["licenses.write"];
    if (pathname.endsWith("/deactivate")) return ["licenses.write"];
    return ["licenses.write"];
  }
  if (pathname.startsWith("/fingerprints")) return ["*"];
  if (pathname.startsWith("/audit-log")) return ["audit.read"];
  if (pathname.startsWith("/api-keys")) return ["api_keys.manage"];
  if (pathname.startsWith("/owners")) {
    if (m === "GET") return ["tenants.read"];
    return ["owners.manage"];
  }
  if (pathname === "/tenants" && m === "POST") return ["*"];
  if (m === "DELETE" && /^\/tenants\/[^/]+$/.test(pathname)) return ["*"];

  if (pathname.startsWith("/tenants")) {
    if (/\/users(?:\/|$)/.test(pathname)) {
      if (m === "GET") return ["tenants.read"];
      return ["tenants.write"];
    }
    if (pathname.includes("/impersonate")) return ["*"];
    if (pathname.includes("/pos-credentials")) return ["tenants.write"];
    if (pathname.includes("/finance-password")) return ["tenants.write"];
    if (pathname.includes("/add-module") || pathname.includes("/remove-module")) {
      return ["*"];
    }
    if (pathname.includes("/organization-access")) return ["*"];
    if (pathname.includes("/provision")) return ["tenants.provision"];
    if (pathname.includes("/organizations") && m !== "GET") return ["tenants.write"];
    if (pathname.includes("/suspend") || pathname.includes("/reactivate")) {
      return ["tenants.write"];
    }
    if (m === "GET") return ["tenants.read"];
    return ["tenants.write"];
  }

  if (m === "GET") return ["tenants.read"];
  return ["tenants.write"];
}
