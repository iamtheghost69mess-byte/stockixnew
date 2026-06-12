import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const isTest =
          process.env.NODE_ENV === 'test' ||
          process.env.JEST_WORKER_ID !== undefined;

        if (isTest) {
          return {
            throttlers: [
              { name: 'default', ttl: 60000, limit: 1000000 },
              { name: 'auth', ttl: 60000, limit: 1000000 },
            ],
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
          throttlers: [
            { name: 'default', ttl: 60000, limit: 2000 },
            { name: 'auth', ttl: 60000, limit: 200 },
          ],
          storage: new ThrottlerStorageRedisService(redisClient as any),
        };
      },
    }),
  ],
})
export class AppThrottleModule {}
