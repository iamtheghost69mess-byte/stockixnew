const config = require("../config/config");
const { orgScopedKey } = require("./redisKeys");

const REVEAL_SUFFIX = "bootstrap:fullCredentials";
const TTL_SEC = 3600;

/** @type {Map<string, { payload: unknown[]; expiresAt: number }>} */
const memory = new Map();

/** @type {import("ioredis").default | null | undefined} */
let client;

function getClient() {
  if (client !== undefined) return client;
  if (!config.redisUrl) {
    client = null;
    return null;
  }
  try {
    const IORedis = require("ioredis");
    client = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2_000,
      commandTimeout: 2_000,
      enableOfflineQueue: false,
    });
    client.on("error", () => {});
    return client;
  } catch {
    client = null;
    return null;
  }
}

async function storeFullCredentials(orgId, fullCredentials) {
  if (!Array.isArray(fullCredentials) || fullCredentials.length === 0) return;
  const key = orgScopedKey(orgId, REVEAL_SUFFIX);
  const payload = JSON.stringify(fullCredentials);
  const redis = getClient();
  if (redis) {
    try {
      await redis.setex(key, TTL_SEC, payload);
      return;
    } catch {
      // fall through to in-memory
    }
  }
  memory.set(String(orgId), {
    payload: fullCredentials,
    expiresAt: Date.now() + TTL_SEC * 1000,
  });
}

async function readFullCredentials(orgId, { deleteAfterRead = false } = {}) {
  const key = orgScopedKey(orgId, REVEAL_SUFFIX);
  const redis = getClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) {
        if (deleteAfterRead) await redis.del(key);
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      }
    } catch {
      // fall through
    }
  }
  const row = memory.get(String(orgId));
  if (!row || Date.now() > row.expiresAt) return null;
  if (deleteAfterRead) memory.delete(String(orgId));
  return row.payload;
}

/** Read bootstrap PINs without deleting (safe for repeated provisioning-status polls). */
async function peekFullCredentials(orgId) {
  return readFullCredentials(orgId, { deleteAfterRead: false });
}

/** Read and delete one-time bootstrap PINs (after Stockix worker persisted secrets). */
async function consumeFullCredentials(orgId) {
  return readFullCredentials(orgId, { deleteAfterRead: true });
}

module.exports = {
  storeFullCredentials,
  peekFullCredentials,
  consumeFullCredentials,
};
