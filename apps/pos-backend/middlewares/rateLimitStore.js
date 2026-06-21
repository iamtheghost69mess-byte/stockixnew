const config = require("../config/config");

let RedisStore = null;
let IORedis = null;
let sharedClient = null;

function ensureRedisDeps() {
  if (RedisStore && IORedis) return true;
  try {
    ({ RedisStore } = require("rate-limit-redis"));
    IORedis = require("ioredis");
    return true;
  } catch {
    return false;
  }
}

function getSharedClient() {
  // Keep auth/rate-limit flows resilient in local/dev environments without Redis.
  if (config.nodeEnv !== "production") return null;
  if (!config.redisUrl) return null;
  if (!ensureRedisDeps()) return null;
  if (!sharedClient) {
    sharedClient = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        if (times > 15) return null;
        return Math.min(times * 200, 3000);
      },
    });
    sharedClient.on("error", () => {
      // Best-effort limiter store; request handlers should continue using fallback in-memory stores.
    });
  }
  return sharedClient;
}

function createRateLimitStore(prefix) {
  const client = getSharedClient();
  if (!client || !RedisStore) return null;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args) => client.call(...args),
  });
}

function withRateLimitStore(options, prefix) {
  const store = createRateLimitStore(prefix);
  if (!store) return options;
  return { ...options, store };
}

module.exports = {
  withRateLimitStore,
};
