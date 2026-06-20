import type { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { featureFlags } from "@repo/db/schema";
import type * as schema from "@repo/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Checks if a feature flag is enabled for a given tenant or globally.
 * Uses a 60-second Redis cache to avoid database query amplification.
 */
export async function isFlagEnabled(
  redis: any,
  db: Db,
  key: string,
  tenantId: string
): Promise<boolean> {
  const cacheKey = `ff:${key}:${tenantId}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        return cached === "1";
      }
    } catch {
      // Fail silent and fallback to DB
    }
  }

  const [flag] = await db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);

  if (!flag) {
    return false;
  }

  const overrides = (flag.tenantOverrides as Record<string, boolean>) || {};
  const overrideVal = overrides[tenantId];
  const result = overrideVal !== undefined ? overrideVal : flag.enabledGlobally;

  if (redis) {
    try {
      await redis.set(cacheKey, result ? "1" : "0", "EX", 60);
    } catch {
      // Fail silent
    }
  }

  return result;
}

/**
 * Helper to invalidate the cached feature flag state for all tenants or a specific tenant.
 */
export async function invalidateFlagCache(
  redis: any,
  key: string,
  tenantId?: string
): Promise<void> {
  if (!redis) return;
  try {
    if (tenantId) {
      await redis.del(`ff:${key}:${tenantId}`);
    } else {
      // Use cursor-based SCAN instead of KEYS to avoid blocking Redis on large keyspaces.
      let cursor = "0";
      do {
        const [nextCursor, batch] = await redis.scan(cursor, "MATCH", `ff:${key}:*`, "COUNT", 100);
        cursor = nextCursor;
        if (batch.length > 0) {
          await redis.del(...batch);
        }
      } while (cursor !== "0");
    }
  } catch {
    // Fail silent
  }
}
