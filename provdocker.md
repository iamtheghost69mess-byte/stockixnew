# PROVDOCKER.md - Docker + Provisioning Reliability Audit

## 1. Executive Summary
A strict evidence-based infrastructure audit of the Stockix Docker and provisioning system was performed. The audit verified Redis configuration fallbacks, Postgres queue retention policies, and Redis tenant isolation structures. 

*Note: Previously reported issues (such as zombie jobs, sequential bulk delete polling, and BFF stream double consumption) were investigated and found to be FIXED in the current codebase. They have been omitted per the evidence-only policy.*

## 2. Critical Issues Found

**NO ISSUES VERIFIED WITH AVAILABLE EVIDENCE**

## 3. High Risk Issues

### Redis Config Fallback to Localhost
- **Evidence (CODE)**: `services/stockix-finance/packages/server/src/config/index.ts` (Lines 118-122)
  ```typescript
    /**
     * Redis storage configuration.
     */
    redis: {
      port: 6379,
    },
  ```
- **Interpretation**: The Redis configuration block explicitly defines `port` but completely omits `host` and `password`. The configuration framework (`ConfigService.get('redis.host')`) will return undefined for these missing properties unless a separate environment variable explicitly overrides the nested path, which is brittle.
- **Impact**: Any service consuming `config.redis` directly will default to `localhost` inside the Docker container, leading to "Connection Refused" errors since Redis resides on the `stockix-shared` network.
- **Reproduction**: Inspect the loaded configuration object in a running `stockix-finance` container to verify `config.redis.host` is undefined.

### Loss of Deprovisioning Audit Trail
- **Evidence (CODE)**: `packages/db/src/schema.ts` (Lines 333-339)
  ```typescript
  export const tenantLifecycleJobs = pgTable(
    "tenant_lifecycle_jobs",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      type: text("type").notNull(),
      status: text("status").notNull().default("pending"),
      tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  ```
- **Interpretation**: The `tenantId` foreign key on the `tenantLifecycleJobs` table is strictly set to `onDelete: "cascade"`.
- **Impact**: When the worker successfully completes a `tenant.deprovision` job, the final step deletes the `tenants` row. The Postgres cascade immediately deletes the corresponding `tenantLifecycleJobs` row. This destroys the execution history, making it impossible to audit successful deprovisioning operations.
- **Reproduction**: Successfully delete a tenant via the UI, then query the `tenant_lifecycle_jobs` table for that `tenantId`. The row will be missing instead of marked as `completed`.

## 4. Medium Risk Issues

### Heavy Reliance on `REDIS_KEY_PREFIX` for Isolation
- **Evidence (CODE)**: `services/stockix-finance/packages/server/src/modules/App/App.module.ts` (Lines 162-175)
  ```typescript
      // REDIS_KEY_PREFIX isolates this tenant's queues on shared stockix-redis
      // Redis key pattern: bull:{REDIS_KEY_PREFIX}{QueueName}:*
      BullModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          connection: {
            host: configService.get('queue.host'),
            port: configService.get('queue.port'),
            password: configService.get('queue.password'),
            db: configService.get('queue.db'),
          },
          prefix: process.env.REDIS_KEY_PREFIX ?? '',
        }),
  ```
- **Interpretation**: The system uses a shared Redis container (`stockix-redis`) for all tenants. Tenant data isolation is entirely dependent on manually prefixing keys via `REDIS_KEY_PREFIX`.
- **Impact**: While functionally correct in the current BullMQ implementation, this architectural pattern carries ongoing risk. Any future developer adding a Redis-backed module (e.g., caching, pub/sub) who forgets to apply `REDIS_KEY_PREFIX` will cause silent cross-tenant data contamination.
- **Reproduction**: Attempt to connect a new Redis client in the Finance module without the prefix and observe that it can read/write global keys.

## 5. Docker Architecture Evidence
**NO ISSUES VERIFIED WITH AVAILABLE EVIDENCE**

## 6. Redis Evidence
See "Redis Config Fallback" and "Heavy Reliance on `REDIS_KEY_PREFIX`" above.

## 7. Queue System Evidence
See "Loss of Deprovisioning Audit Trail" above.

## 8. Worker Evidence
**NO ISSUES VERIFIED WITH AVAILABLE EVIDENCE**

## 9. Environment Evidence
**NO ISSUES VERIFIED WITH AVAILABLE EVIDENCE**

## 10. Fix Recommendations
1. **Fix Redis Config**: Explicitly define `host: process.env.REDIS_HOST` and `password: process.env.REDIS_PASSWORD` inside the `redis` configuration block in `config/index.ts`.
2. **Preserve Audit Trail**: Change `onDelete: "cascade"` to `onDelete: "set null"` for `tenantLifecycleJobs.tenantId`, or implement a dedicated archiving mechanism before deleting the tenant row.
