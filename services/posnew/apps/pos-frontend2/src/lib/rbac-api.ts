import { posApiJson } from "@/lib/pos-api-fetch";
import type { RbacPermissionRow } from "@/lib/rbac-ui";

export type RbacCatalogPayload = {
  permissions: RbacPermissionRow[];
  builtinRoleKeys?: string[];
  defaults: Record<string, { can?: string[] }>;
};

export type RbacConfigPayload = {
  builtinOverrides: Record<string, { can?: string[] }>;
  customRoles: Array<{
    key: string;
    label?: string;
    inheritsFrom?: string;
    can?: string[];
  }>;
  updatedAt?: string;
};

export async function fetchRbacCatalog() {
  return posApiJson<RbacCatalogPayload>("/api/rbac/catalog", { method: "GET" });
}

export async function fetchRbacConfig() {
  return posApiJson<RbacConfigPayload>("/api/rbac/config", { method: "GET" });
}

export async function putRbacConfig(body: {
  builtinOverrides: Record<string, { can: string[] }>;
  customRoles: Array<{
    key: string;
    label: string;
    inheritsFrom?: string;
    can: string[];
  }>;
}) {
  return posApiJson<RbacConfigPayload>("/api/rbac/config", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
