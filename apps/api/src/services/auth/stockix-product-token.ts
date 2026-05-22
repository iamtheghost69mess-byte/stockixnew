import { apiConfig } from "@repo/config";
import {
  signStockixToken,
  verifyStockixToken,
  type StockixModule,
  type StockixRole,
  type StockixTokenPayload,
} from "@repo/auth";
import { tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const MODULE_VALUES = ["accounting", "pos", "pms", "chat"] as const;

export const stockixModuleSchema = MODULE_VALUES;

export type { StockixModule, StockixRole, StockixTokenPayload };

export function parseTenantModules(json: string | null | undefined): StockixModule[] {
  if (!json || json.trim().length === 0) {
    return ["accounting"];
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return ["accounting"];
    const out: StockixModule[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && (MODULE_VALUES as readonly string[]).includes(item)) {
        out.push(item as StockixModule);
      }
    }
    return out.length > 0 ? out : ["accounting"];
  } catch {
    return ["accounting"];
  }
}

export function serializeTenantModules(modules: StockixModule[]): string {
  return JSON.stringify(modules);
}

function authSecretOrThrow(): string {
  const secret = apiConfig.authTokenSecret;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_TOKEN_SECRET (or SESSION_SECRET fallback) must be set for product token operations");
  }
  return secret;
}

export type SignProductTokenInput = {
  userId: string;
  tenantId: string;
  roles: StockixRole[];
  planSlug: string;
  organizationId?: string;
  modules?: StockixModule[];
  expiresIn?: string;
};

export async function signProductToken(
  db: PostgresJsDatabase<typeof schema>,
  input: SignProductTokenInput,
): Promise<string> {
  let modules = input.modules;
  if (!modules) {
    const [row] = await db
      .select({ modules: tenants.modules, planSlug: tenants.planSlug })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .limit(1);
    if (!row) {
      throw new Error(`tenant_not_found:${input.tenantId}`);
    }
    modules = parseTenantModules(row.modules);
  }

  return signStockixToken(
    {
      userId: input.userId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      modules,
      roles: input.roles,
      planSlug: input.planSlug,
    },
    authSecretOrThrow(),
    input.expiresIn ?? "8h",
  );
}

export async function verifyProductToken(token: string): Promise<StockixTokenPayload> {
  return verifyStockixToken(token, authSecretOrThrow());
}
