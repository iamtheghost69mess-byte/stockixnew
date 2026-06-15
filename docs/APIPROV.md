# APIPROV.md - Full Platform Audit

## Executive Summary
This document provides an exhaustive architectural audit of the Stockix platform, acting as a control plane for a multi-tenant SaaS accounting runtime. The audit covers the frontend Dashboard, the backend Control Plane API, worker systems, databases, Redis, Docker, and the exact provisioning lifecycle.

## Architecture Overview
Stockix uses a hybrid multi-tenant approach with shared backing services and isolated application runtimes:
- **Shared Infrastructure**: `stockix-mysql` (with ProxySQL), `stockix-mongo`, `stockix-redis`.
- **Per-Tenant Infrastructure**: Separate compose projects (`stockix-<tenant_slug>`) for individual Next.js and API instances.
- **Worker Connectivity**: Direct network resolution in production, host-port fallback in development.

## Folder Structure Analysis
- **`apps/dashboard/`**: Owner-facing Next.js App Router providing Shadcn UI interfaces. Depends on `apps/api`.
- **`apps/api/`**: The core control-plane HTTP API powered by Hono. Handles tenant orchestration, proxies PMS requests, and interfaces with `packages/db`.
- **`packages/db/`**: Platform Postgres schema leveraging Drizzle ORM. Owns the control-plane data layer.
- **`services/stockix-finance/`**: Vendored accounting source. Used for tenant runtime.
- **`infra/worker-service/`**: Worker layer responsible for provisioning and teardown via Docker compose commands and Database creation.
- **`packages/ui/`**, **`packages/eslint-config/`**, **`packages/typescript-config/`**: Shared TS tooling and UI components.

## API Inventory
- **POST `/api/tenants`**: Triggers the provisioning flow. BFF forwards to control plane. Risk Level: HIGH.
- **GET `/api/tenants/provision-status/:correlationId`**: Polling endpoint for provision progress.
- **GET `/api/tenants/provision-stream/:correlationId`**: SSE stream endpoint for real-time trace events.
- **POST `/internal/jobs/claim`**: Worker endpoint to claim jobs from the `tenant_lifecycle_jobs` table.
- **GET `/ready` & `/health`**: System readiness checks (`apps/api/src/routes/public.ts`). Risk Level: CRITICAL (currently hanging on Redis ping).

## Provisioning Flow
1. **Request Received**: `apps/dashboard/app/api/tenants/route.ts` BFF receives the POST and forwards to Control Plane API.
2. **Validation**: Control Plane validates via Zod schema (`provisionBody`).
3. **Queue Creation**: Inserts a job into `tenant_lifecycle_jobs` with status `pending`.
4. **Worker Execution**: Worker claims the job, launching a heartbeat and running `runProvisionJob`.
5. **Database Updates**: Worker provisions schemas on the shared MySQL instance.
6. **Docker Actions**: Spawns isolated Docker containers for the tenant (`docker compose up server`).
7. **Final Activation**: Edges published via Traefik, admin bootstrapped via Finance internal API.

*Possible Failure Points*: Port collisions on WSL2 for Redis, missing Throttler configurations returning 500s during health checks, and brittle regex parsing for container IDs.

## Deprovisioning Flow
Deprovisioning strictly reverses the provision steps.
- **Execution Order**: Mark tenant as failed/deleted -> `compose down` -> drop tenant DB + user from shared MySQL.
- **Rollback Logic**: On step failure during provision, the rollback is immediately executed to ensure no partial state.
- **Risks**: `docker.data_step` relies on clean regex from Docker Compose. Upgrading Compose versions may output hyphens, breaking cleanup and leading to orphaned resources.

## Redis Audit
- **Keys/Namespaces**: Used for idempotency keys (`api_idempotency_keys`), throttling, and background BullMQ queues.
- **Caching Mechanisms**: Real-time throttling via `@nestjs/throttler` in the tenant runtime.
- **Risks**: The Redis connection is missing `host` and `password` inside `services/stockix-finance/packages/server/src/config/index.ts`, relying on fallbacks. Redis pings inside `/ready` lack timeouts and can indefinitely block the Node.js event loop.
- **Reliability Score**: 4/10

## Worker Audit
- **Trigger Source**: Long-polling loop hitting `/internal/jobs/claim`.
- **Execution Path**: Heartbeat thread + timeout wrapper + step-by-step journaled execution (`completedOps`).
- **Retry Behavior**: `noRetry: true`. Fail-fast is intentional to allow clean scrubs.
- **Risks**: Stale dev worker rebuilds due to script monitoring only `src/worker.ts` and not `domain/*.ts`.

## Database Audit
- **Databases**: Postgres (Control Plane), MySQL (Tenant Shared), Mongo (POS).
- **Transaction Boundaries**: Provisioning uses `withTenantLifecycleAdvisoryLock` to isolate tenant operations.
- **Optimization Recommendations**: Move away from exact regex parsing of container data before database flushes.

## Docker Audit
- **Image Strategy**: Prebuilt shared images `stockix-database-migration:local` and `stockix-server`.
- **Deployment Strategy**: Tenant containers are spawned dynamically by the worker. Traefik maps routes.
- **Detect**: WSL2 host-port conflicts during local development, leading to hang conditions when connecting from Host to VM-mapped ports.

## Health System Audit
- **Endpoints**: `/ready`, `/health`, `/health/redis`, `/health/db`.
- **Verify**: Missing timeouts on health checks.
- **Risks**: `/ready` blocks indefinitely if Redis does not respond.
- **Recommended Architecture**: Implement `Promise.race` with explicit 2000ms timeouts on all downstream resource checks to ensure the health endpoint itself never hangs.

## Latency Analysis
- **API Latency Contributors**: Redis ping unresponsiveness.
- **Provisioning Latency Contributors**: Sequential container spawning and database seeding. 
- **Database Latency**: ProxySQL connection establishment in Dev vs Prod networks.

## Error Analysis
- **Error Handling Report**: Errors during provisioning trigger a rollback and mark the job as "failed". However, the BFF debug log (`req.text()`) incorrectly logs empty payloads due to double consumption of the request stream.

## Debugging Analysis
- **What failed? Where? Why?**: The system uses a granular journaled step process (e.g. `docker.data_step`, `docker.network_connect`).
- **Pain Points**: Debugging worker state in local dev is difficult because `dev-stockix.mjs` does not hot-reload worker domain changes correctly.
- **Debuggability Score**: 7/10

## Reliability Risks
1. **Unbounded Redis Ping** in API `/ready`.
2. **Missing ThrottlerGuard whitelist** causing tenant `/api/ping` to return 500 when Redis is down.
3. **WSL2 Docker Desktop Port Conflict** leading to socket hangs.
4. **Brittle Regex** (`/^[a-f0-9]{12,64}$/i`) in container ID filtering.

## Maintainability Analysis
- **Score**: 6/10
- Folder structure is logical, but cross-referencing between Next.js BFF, Hono control-plane, and worker processes leads to scattered error boundaries.

## Recommended Refactor Plan
- **Priority 0 (Critical Bugs)**: Implement 2-second timeout on Redis `ping()` in `/ready`. Update `getComposeContainerName` regex to `/^[a-f0-9_--]{12,64}$/i`.
- **Priority 1 (Reliability)**: Create `CustomThrottler.guard.ts` to bypass `/api/ping`.
- **Priority 2 (Performance)**: Fix `dev-stockix.mjs` to watch all `.ts` files under `infra/worker-service`.
- **Priority 3 (Codebase Cleanup)**: Remove double-call of `req.text()` in BFF.
- **Priority 4 (Architecture)**: Standardize Docker compose mappings so Dev environments exactly mimic Prod bridge networks, bypassing WSL2 host proxies.
