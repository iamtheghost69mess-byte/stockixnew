import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Use in-memory storage with very high limits for test environment
        const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

        if (isTest) {
          return {
            throttlers: [
              {
                name: 'default',
                ttl: 60000,
                limit: 1000000, // Effectively disable throttling in tests
              },
              {
                name: 'auth',
                ttl: 60000,
                limit: 1000000, // Effectively disable throttling in tests
              },
            ],
            // No storage specified = uses in-memory storage
          };
        }

        const globalTtl = configService.get<number>('throttle.global.ttl');
        const globalLimit = configService.get<number>('throttle.global.limit');
        const authTtl = configService.get<number>('throttle.auth.ttl');
        const authLimit = configService.get<number>('throttle.auth.limit');

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
          // @nest-lab/throttler-storage-redis@1.x is incompatible with @nestjs/throttler@4.x
          // (storage interface changed). Using in-memory storage until the package is upgraded.
          // storage: new ThrottlerStorageRedisService({ host, port, password, db }),
        };
      },
    }),
  ],
})
export class AppThrottleModule { }


