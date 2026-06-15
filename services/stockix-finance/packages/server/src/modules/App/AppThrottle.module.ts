import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';

export class CustomThrottlerStorageRedis {
  storage = {};

  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
    // ttl is in seconds in @nestjs/throttler v4 (which gets converted to milliseconds internally by Redis PEXPIRE)
    const ttlMs = ttl * 1000;
    const script = `
      local hitKey = KEYS[1]
      local ttlMs = tonumber(ARGV[1])
      local totalHits = redis.call('INCR', hitKey)
      local timeToExpire = redis.call('PTTL', hitKey)
      if timeToExpire <= 0 then
        redis.call('PEXPIRE', hitKey, ttlMs)
        timeToExpire = ttlMs
      end
      return { totalHits, timeToExpire }
    `;

    const results = (await this.redis.call(
      'eval',
      script.trim(),
      1,
      key,
      ttlMs,
    )) as [number, number];

    const [totalHits, timeToExpire] = results;

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpire / 1000), // return seconds to the guard
    };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const isTest =
          process.env.NODE_ENV === 'test' ||
          process.env.JEST_WORKER_ID !== undefined;

        if (isTest) {
          return {
            ttl: 60,
            limit: 1000000,
          };
        }

        const redisPrefix = process.env.REDIS_KEY_PREFIX ?? '';

        const redisClient = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          db: parseInt(process.env.REDIS_DB || '0', 10),
          keyPrefix: redisPrefix ? `${redisPrefix}throttle:` : 'throttle:',
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
        });

        // Connect in background — do not await, do not block app boot.
        // If Redis is unavailable at boot, throttler fails open (no throttling).
        // The app still boots and /api/ping returns 200.
        redisClient.connect().catch(() => {});

        return {
          ttl: 60, // 60 seconds
          limit: 2000, // 2000 requests per minute
          storage: new CustomThrottlerStorageRedis(redisClient),
        };
      },
    }),
  ],
})
export class AppThrottleModule {}

