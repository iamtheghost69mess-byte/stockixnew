const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const config = require("../config/config");

/**
 * Builds a Socket.IO Redis adapter when REDIS_URL is set.
 * @returns {Promise<{ adapter: import("@socket.io/redis-adapter").RedisAdapter } | null>}
 */
async function createPosSocketRedisAdapter() {
  const url = (config.redisUrl || "").trim();
  if (!url) return null;

  const connectTimeoutMs = Math.min(
    10_000,
    Math.max(
      1000,
      Number.parseInt(
        String(process.env.POS_SOCKET_REDIS_CONNECT_TIMEOUT_MS || "2500"),
        10
      ) || 2500
    )
  );

  const pubClient = createClient({
    url,
    socket: {
      connectTimeout: connectTimeoutMs,
      reconnectStrategy: () => false,
    },
  });
  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[socket-redis] pub client error:", err.message);
  });
  subClient.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[socket-redis] sub client error:", err.message);
  });

  const connectPromise = Promise.all([pubClient.connect(), subClient.connect()]);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`socket redis connect timeout (${connectTimeoutMs}ms)`));
    }, connectTimeoutMs + 250);
  });

  try {
    await Promise.race([connectPromise, timeoutPromise]);
    const adapter = createAdapter(pubClient, subClient);
    return { adapter, pubClient, subClient };
  } catch (error) {
    await Promise.allSettled([
      pubClient.quit().catch(() => pubClient.disconnect()),
      subClient.quit().catch(() => subClient.disconnect()),
    ]);
    throw error;
  }
}

module.exports = { createPosSocketRedisAdapter };
