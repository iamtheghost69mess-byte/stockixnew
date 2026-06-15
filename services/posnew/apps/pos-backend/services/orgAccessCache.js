const crypto = require("crypto");
const config = require("../config/config");
const { getOrganizationAccessState } = require("@restaurant-pos/domain-access");

const DEFAULT_TTL_SECONDS = (() => {
  const raw = Number.parseInt(
    String(process.env.ORG_ACCESS_CACHE_TTL_SECONDS || "120"),
    10
  );
  if (!Number.isFinite(raw)) return 120;
  return Math.min(300, Math.max(60, raw));
})();

const memoryStore = new Map();
let redisClientPromise = null;
let reconciliationTimer = null;

function cacheKey(orgId) {
  return `org_access_state:${String(orgId)}`;
}

function hashInput(input) {
  const payload = JSON.stringify({
    formatVersion: "2026-04-24-license-reason-v2",
    licenseStartDate: input.licenseStartDate || null,
    licenseEndDate: input.licenseEndDate || null,
    timezone: input.timezone || null,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function getRedisClient() {
  if (!config.redisUrl) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        const IORedis = require("ioredis");
        const client = new IORedis(config.redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
        await client.connect();
        return client;
      } catch {
        return null;
      }
    })();
  }
  return redisClientPromise;
}

async function readFromRedis(orgId) {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(cacheKey(orgId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeToRedis(orgId, value) {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(cacheKey(orgId), JSON.stringify(value), "EX", DEFAULT_TTL_SECONDS);
  } catch {
    // ignore cache failures
  }
}

/**
 * Returns cached access state if inputHash matches and value not expired.
 */
async function getCachedAccessState(orgId, input) {
  const key = cacheKey(orgId);
  const expectedHash = hashInput(input);
  const nowMs = Date.now();

  const local = memoryStore.get(key);
  if (
    local &&
    local.inputHash === expectedHash &&
    nowMs - local.computedAt <= DEFAULT_TTL_SECONDS * 1000
  ) {
    return local.accessState;
  }

  const redisValue = await readFromRedis(orgId);
  if (
    redisValue &&
    redisValue.inputHash === expectedHash &&
    typeof redisValue.computedAt === "number" &&
    nowMs - redisValue.computedAt <= DEFAULT_TTL_SECONDS * 1000
  ) {
    memoryStore.set(key, redisValue);
    return redisValue.accessState;
  }

  const accessState = getOrganizationAccessState(input);
  const snapshot = {
    accessState,
    computedAt: nowMs,
    inputHash: expectedHash,
  };
  memoryStore.set(key, snapshot);
  await writeToRedis(orgId, snapshot);
  return accessState;
}

async function invalidateOrgAccessCache(orgId) {
  const key = cacheKey(orgId);
  memoryStore.delete(key);
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // ignore cache failures
  }
}

async function clearRedisCachePrefix() {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    let cursor = "0";
    do {
      // Use SCAN to avoid blocking Redis in production.
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "org_access_state:*", "COUNT", 200);
      cursor = String(nextCursor);
      if (Array.isArray(keys) && keys.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // ignore reconciliation failures
  }
}

function startOrgAccessCacheReconciliationJob() {
  if (reconciliationTimer) return reconciliationTimer;
  const intervalMs = Math.max(
    5 * 60 * 1000,
    (DEFAULT_TTL_SECONDS + 60) * 1000
  );
  reconciliationTimer = setInterval(() => {
    memoryStore.clear();
    void clearRedisCachePrefix();
  }, intervalMs);
  reconciliationTimer.unref?.();
  return reconciliationTimer;
}

module.exports = {
  OrgAccessCache: {
    getCachedAccessState,
    invalidateOrgAccessCache,
    startOrgAccessCacheReconciliationJob,
  },
};
