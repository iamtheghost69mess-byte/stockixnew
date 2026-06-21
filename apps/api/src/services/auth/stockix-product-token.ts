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
import { getControlPlaneRedisClient } from "../../lib/redis.js";

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

// SEC-01: Product-token allowlist (Redis). TTL matches JWT expiry + 60 s buffer.
const PRODUCT_TOKEN_ALLOWLIST_TTL_S = 8 * 3600 + 60;

/** SEC-01: Redis key for a user's product-token allowlist entry. */
export function productTokenAllowKey(tenantId: string, userId: string): string {
  return `product-token:allow:${tenantId}:${userId}`;
}

/**
 * SEC-01: Revoke all product-token allowlist entries for a tenant (SCAN+DEL, never KEYS).
 * Call when a tenant is suspended or deleted so Finance/PMS reject tokens within seconds.
 */
export async function revokeProductTokensForTenant(tenantId: string): Promise<void> {
  const redis = getControlPlaneRedisClient();
  if (!redis) return;
  const pattern = `product-token:allow:${tenantId}:*`;
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
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

  const token = await signStockixToken(
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

  // SEC-01: Record token in Redis allowlist so Finance/PMS can validate it before trust.
  // Non-fatal: if Redis is down, the token still works; revocation falls back to JWT expiry.
  const redis = getControlPlaneRedisClient();
  if (redis) {
    await redis
      .set(productTokenAllowKey(input.tenantId, input.userId), "1", "EX", PRODUCT_TOKEN_ALLOWLIST_TTL_S)
      .catch(() => {/* non-fatal */});
  }

  return token;
}

export async function verifyProductToken(
  db: PostgresJsDatabase<typeof schema>,
  token: string
): Promise<StockixTokenPayload> {
  const payload = await verifyStockixToken(token, authSecretOrThrow());
  
  // Fast-path DB check to ensure the tenant hasn't been suspended or deleted
  const [row] = await db
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, payload.tenantId))
    .limit(1);

  if (!row) {
    throw new Error(`tenant_not_found:${payload.tenantId}`);
  }

  if (row.status === "suspended" || row.status === "deprovisioning" || row.status === "failed") {
    throw new Error(`tenant_revoked:${payload.tenantId}`);
  }

  return payload;
}
