import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@repo/db/schema";
import { tenants } from "@repo/db/schema";

import {
  getActiveLicenseForTenant,
  parseLicenseModulesJson,
  type LicenseModuleId,
} from "../license-utils.js";
import { parseTenantModules } from "../services/auth/stockix-product-token.js";

type Db = PostgresJsDatabase<typeof schema>;

export type TenantModuleAccessResult =
  | { ok: true }
  | { ok: false; status: 404 | 403; error: string; message: string };

/** Pure check: tenant + active license both include the required module. */
export function tenantHasLicensedModule(
  tenantModulesJson: string | null | undefined,
  licenseModules: LicenseModuleId[] | null | undefined,
  required: LicenseModuleId,
): { ok: true } | { ok: false; message: string } {
  const tenantModules = parseTenantModules(tenantModulesJson);
  if (!tenantModules.includes(required)) {
    return {
      ok: false,
      message: `Module "${required}" is not enabled on this tenant`,
    };
  }
  if (licenseModules && licenseModules.length > 0 && !licenseModules.includes(required)) {
    return {
      ok: false,
      message: `Module "${required}" is not included in the active license`,
    };
  }
  return { ok: true };
}

export async function assertTenantModuleLicensed(
  db: Db,
  tenantId: string,
  required: LicenseModuleId,
): Promise<TenantModuleAccessResult> {
  const [row] = await db
    .select({ modules: tenants.modules })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      status: 404,
      error: "tenant_not_found",
      message: "Tenant not found",
    };
  }

  const license = await getActiveLicenseForTenant(db, tenantId);
  const licenseModules = license ? parseLicenseModulesJson(license.modules) : null;
  const check = tenantHasLicensedModule(row.modules, licenseModules, required);
  if (!check.ok) {
    return {
      ok: false,
      status: 403,
      error: "module_not_licensed",
      message: check.message,
    };
  }
  return { ok: true };
}

/** Respond with JSON when module access is denied; returns true if the handler should stop. */
export function respondModuleAccessDenied(
  c: { json: (body: unknown, status?: number) => Response },
  result: Extract<TenantModuleAccessResult, { ok: false }>,
): Response {
  return c.json(
    { error: result.error, message: result.message, module: result.message.match(/"([^"]+)"/)?.[1] },
    result.status,
  );
}
