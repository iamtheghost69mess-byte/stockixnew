import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
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

        const globalTtl = configService.get<number>('throttle.global.ttl');
        const globalLimit = configService.get<number>('throttle.global.limit');
        const authTtl = configService.get<number>('throttle.auth.ttl');
        const authLimit = configService.get<number>('throttle.auth.limit');

        const redisPrefix = process.env.REDIS_KEY_PREFIX ?? '';
        const redisOptions = {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password') || undefined,
          db: configService.get<number>('redis.db'),
          keyPrefix: redisPrefix ? `${redisPrefix}throttle:` : 'throttle:',
        };

        return {
          throttlers: [
            {
              name: 'default',
              ttl: globalTtl ?? 60000,
              limit: globalLimit ?? 2000,
            },
            {
              name: 'auth',
              ttl: authTtl ?? 60000,
              limit: authLimit ?? 200,
            },
          ],
          storage: new ThrottlerStorageRedisService(redisOptions),
        };
      },
    }),
  ],
})
export class AppThrottleModule {}