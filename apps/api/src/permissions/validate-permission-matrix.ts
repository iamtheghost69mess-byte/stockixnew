import { PERMISSIONS } from "@repo/shared/permissions";

import { requiredPermissionsForRoute } from "./route-permissions.js";

const KNOWN_ROUTES: Array<{ path: string; method: string }> = [
  { path: "/tenants", method: "GET" },
  { path: "/tenants", method: "POST" },
  { path: "/tenants/provision-status/corr", method: "GET" },
  { path: "/tenants/provision-stream/corr", method: "GET" },
  { path: "/tenants/provision-stop/corr", method: "POST" },
  { path: "/licenses", method: "GET" },
  { path: "/licenses/generate", method: "POST" },
  { path: "/plans", method: "GET" },
  { path: "/owners", method: "GET" },
  { path: "/audit-log", method: "GET" },
  { path: "/api-keys", method: "GET" },
  { path: "/admin/roles", method: "GET" },
];

export function assertPermissionMatrixValid(): void {
  if (!Array.isArray(PERMISSIONS) || PERMISSIONS.length < 1) {
    throw new Error("[config] permission matrix is empty");
  }

  const allowed = new Set<string>(PERMISSIONS);
  for (const route of KNOWN_ROUTES) {
    const required = requiredPermissionsForRoute(route.path, route.method);
    if (!required) continue;
    for (const permission of required) {
      if (!allowed.has(permission)) {
        throw new Error(
          `[config] route ${route.method} ${route.path} requires unknown permission: ${permission}`,
        );
      }
    }
  }
}
