import { createHash, randomBytes } from "node:crypto";

import { apiConfig } from "@repo/config";
import { apiKeys } from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";

type Db = PostgresJsDatabase<typeof dbSchema>;

function hashPepper(): string {
  return apiConfig.authTokenSecret;
}

export function hashApiKeySecret(rawKey: string): string {
  return createHash("sha256").update(rawKey).update(hashPepper()).digest("hex");
}

export function generateApiKeyMaterial(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const rawKey = `sk_live_${randomBytes(24).toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 18);
  const keyHash = hashApiKeySecret(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

export async function findActiveApiKeyByRaw(
  db: Db,
  rawKey: string,
): Promise<{ keyId: string; ownerId: string } | null> {
  if (!rawKey.startsWith("sk_live_")) return null;
  const keyHash = hashApiKeySecret(rawKey);
  const rows = await db
    .select({ id: apiKeys.id, ownerId: apiKeys.ownerId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { keyId: row.id, ownerId: row.ownerId };
}

export function scheduleApiKeyLastUsedTouch(db: Db, keyId: string): void {
  queueMicrotask(() => {
    void db
      .update(apiKeys)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(apiKeys.id, keyId))
      .catch((err) => {
        console.error(
          "[api-keys] lastUsedAt touch failed",
          err instanceof Error ? err.message : String(err),
        );
      });
  });
}
