import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';

const DENYLIST_PREFIX = 'auth:denylist:';

@Injectable()
export class AuthLogoutService {
  private readonly redis: ReturnType<RedisService['getClient']> | null = null;

  constructor(@Optional() private readonly redisService?: RedisService) {
    try {
      this.redis = redisService?.getClient() ?? null;
    } catch {
      this.redis = null;
    }
  }

  /**
   * Adds the given JWT to the Redis denylist with a TTL matching the token's
   * remaining validity so the entry auto-expires when the token would have
   * expired anyway.
   */
  async denyToken(jti: string, expiresAt: number): Promise<void> {
    if (!this.redis) return;
    const ttlSeconds = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
    await this.redis.set(`${DENYLIST_PREFIX}${jti}`, '1', 'EX', ttlSeconds);
  }

  /**
   * Returns true if the token has been explicitly revoked via logout.
   */
  async isDenied(jti: string): Promise<boolean> {
    if (!this.redis) return false;
    const val = await this.redis.get(`${DENYLIST_PREFIX}${jti}`);
    return val !== null;
  }
}
