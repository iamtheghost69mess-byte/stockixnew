import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { LicenseStatus } from './License.types';
import { licenseCache, getLicenseCacheTtlMs } from './LicenseGuard.cache';

const CACHE_TTL_S = 60;

/**
 * Redis-backed license status cache with in-process Map fallback.
 *
 * In a single-replica deploy the Map alone would suffice, but in multi-replica
 * Finance deployments a sync to replica A would never invalidate replica B's
 * in-memory entry. Writing to and clearing from Redis ensures every replica
 * sees the invalidation on the next request.
 *
 * Failure strategy: every Redis error is swallowed and the operation falls
 * through to the in-process Map. The app never goes down because of a cache
 * problem.
 */
@Injectable()
export class LicenseCacheService {
  private readonly redis: ReturnType<RedisService['getClient']> | null = null;
  private readonly keyPrefix: string;

  constructor(@Optional() private readonly redisService?: RedisService) {
    const prefix = process.env.REDIS_KEY_PREFIX ?? '';
    // Key pattern: {prefix}lic:status:{tenantId}
    // Matches the tenant-isolation prefix used by BullMQ and the throttler.
    this.keyPrefix = prefix ? `${prefix}lic:status:` : 'lic:status:';
    try {
      this.redis = redisService?.getClient() ?? null;
    } catch {
      this.redis = null;
    }
  }

  /**
   * Returns:
   *   - `LicenseStatus` — cache hit with a known status
   *   - `null`           — cache hit: tenant has no license
   *   - `undefined`      — cache miss: caller must fetch from DB
   */
  async get(tenantId: number): Promise<LicenseStatus | null | undefined> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(this.key(tenantId));
        if (raw !== null) {
          return raw === 'null' ? null : (raw as LicenseStatus);
        }
        // Redis miss — signal caller to re-fetch from DB
        return undefined;
      } catch {
        // Redis error — fall through to Map
      }
    }
    const entry = licenseCache.get(tenantId);
    if (entry && Date.now() - entry.cachedAt < getLicenseCacheTtlMs()) {
      return entry.effectiveStatus;
    }
    return undefined;
  }

  /** Write a resolved status to both Redis (primary) and Map (fallback). */
  async set(tenantId: number, status: LicenseStatus | null): Promise<void> {
    // Always write Map so in-process reads work while Redis is briefly down
    licenseCache.set(tenantId, { effectiveStatus: status, cachedAt: Date.now() });
    if (this.redis) {
      try {
        await this.redis.set(
          this.key(tenantId),
          status === null ? 'null' : status,
          'EX',
          CACHE_TTL_S,
        );
      } catch {
        // non-fatal: Map write already succeeded
      }
    }
  }

  /**
   * Invalidate cache for one tenant (or all tenants if tenantId omitted).
   * Deletes from Redis so OTHER replicas see the invalidation on next request.
   * Also deletes from the local Map for immediate local consistency.
   */
  async clear(tenantId?: number): Promise<void> {
    if (tenantId === undefined) {
      licenseCache.clear();
      // No Redis SCAN: TTL of 60 s is short enough that stale entries expire
      // quickly; a full-cache clear is only issued in tests.
      return;
    }
    licenseCache.delete(tenantId);
    if (this.redis) {
      try {
        await this.redis.del(this.key(tenantId));
      } catch {
        // non-fatal: local Map already cleared
      }
    }
  }

  private key(tenantId: number): string {
    return `${this.keyPrefix}${tenantId}`;
  }
}
