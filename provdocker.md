# PROVDOCKER.md

## 1. Architecture Contract
- **Source of Truth System**: The control-plane Postgres database, specifically the `tenant_lifecycle_jobs` table, is the absolute source of truth for provisioning intent and lifecycle state.
- **Authoritative vs Derived State**: 
  - *Authoritative*: Postgres is authoritative for tenant billing status, provision job intent, and lifecycle lock states.
  - *Derived*: Docker Engine container state, locally cached Redis rate-limits, and provision journal logs (`provisionEvents`) are derived from the execution of the authoritative intent.
- **Eventual vs Strongly Consistent**: 
  - Job claiming is *strongly consistent* via Postgres `FOR UPDATE SKIP LOCKED`.
  - The actual physical infrastructure (Docker containers, volumes) is *eventually consistent* with the Postgres job state, synchronized only by the forward execution of the Node.js `worker-service`.

## 2. State Ownership Model
- **Postgres (Control Plane)**: Owns the lifecycle state machine, advisory locks (`withTenantLifecycleAdvisoryLock`), and the global tenant registry.
- **Worker Plane (`worker-service`)**: Owns the temporary execution lease (via `claimToken` and `workerHeartbeatStaleMs`). Owns NO persistent state.
- **Docker Daemon**: Owns the physical runtime state (networks, volumes, running processes).
- **Redis (`stockix-redis`)**: Owns transient cache, rate-limiting (`AppThrottle.module.ts`), and intra-app message queues via BullMQ. It does NOT own the core provisioning state.

## 3. Runtime Verification Spec
To declare this system safe, the following MUST be validated via runtime evidence:

- **Redis Connectivity & Config Resolution**:
  - *Check*: Execute `printenv` inside the `stockix-finance` container to verify `REDIS_HOST` and `REDIS_PASSWORD` are resolved.
  - *Pass*: Environment variables explicitly point to `dev-redis-1` or production equivalent.
  - *Fail*: Configuration falls back to `localhost:6379`.
- **Postgres Schema Validation**:
  - *Check*: Execute `docker exec psql` to describe `tenant_lifecycle_jobs` foreign keys.
  - *Pass*: `tenantId` is `ON DELETE SET NULL` or archival triggers exist.
  - *Fail*: `tenantId` is `ON DELETE CASCADE`, destroying audit trails.
- **Docker Network Topology Validation**:
  - *Check*: `docker network inspect stockix-shared`.
  - *Pass*: Subnet boundaries and iptables rules strictly isolate tenant internal ports.
  - *Fail*: Tenant A can route traffic directly to Tenant B's containers.
- **Worker Lifecycle State Validation**:
  - *Check*: Tail `worker-service` logs during an active job loop.
  - *Pass*: Logs emit heartbeat signals proving lease renewals.
- **Queue Correctness Validation**:
  - *Check*: Monitor `internal.ts` `/internal/jobs/claim` endpoint behavior.
  - *Pass*: Stale jobs (`attempts < maxAttempts` with expired heartbeats) transition back to `pending`.

## 4. Negative Verification Model
The system MUST be tested against the following negative failure modes:

- **Missing Environment Variables**
  - *Expected Behavior*: App boot sequence strictly aborts (fail-fast) preventing silent default fallbacks.
  - *Risk if Recovery Fails*: Silent fallback to `localhost`, causing localized connection timeouts (`ECONNREFUSED`) inside isolated Docker containers.
- **Partial Docker Failures**
  - *Expected Behavior*: If `docker-compose up` fails halfway, the worker catches the exit code and flags the job as `failed`.
  - *Risk if Recovery Fails*: Zombie containers consume CPU/RAM indefinitely.
- **Redis Disconnection Behavior**
  - *Expected Behavior*: The API fails open for health checks, but BullMQ pauses job processing without crashing the main Node loop.
  - *Risk if Recovery Fails*: Constant crash-looping of the tenant application.
- **Worker Crash Mid-Provision**
  - *Expected Behavior*: The worker heartbeat stops. After `workerStaleLeaseThresholdMs`, the control plane reclaims the job and another worker retries.
  - *Risk if Recovery Fails*: The job remains perpetually in `running` status, deadlocking the tenant.
- **Postgres Lock Failure Scenarios**
  - *Expected Behavior*: `withTenantLifecycleAdvisoryLock` rejects simultaneous mutations.
  - *Risk if Recovery Fails*: Double-provisioning corrupts Docker volume mappings and overwrites DB state.
- **Network Isolation Failure Between Tenants**
  - *Expected Behavior*: Inter-tenant HTTP requests timeout.
  - *Risk if Recovery Fails*: Critical security vulnerability; Tenant A can access Tenant B's unprotected internal endpoints.

## 5. Failure Simulation Matrix

| Scenario | Injection Method | Expected System Response | Data Integrity Guarantee | Recovery Path | Orphan Risk |
|---|---|---|---|---|---|
| **Redis Failure** | `docker stop dev-redis-1` | Worker/API throws localized cache errors but core provision logic (Postgres-backed) survives or gracefully pauses. | UNVERIFIABLE WITHOUT RUNTIME EVIDENCE | Automatic reconnect loop via `ioredis`. | Low |
| **Worker Crash** | `kill -9` worker process during DB creation | Job lease expires; reclaimed by API logic. | YES (If DB queries are strictly idempotent). | Re-run by next available worker. | High (if crash happens before rollback logic triggers). |
| **Docker Partial Fail** | Inject timeout in `docker-compose up` | Worker catches `execa` timeout, fails job. | YES | Manual trigger of deprovision/cleanup job. | High (Abandoned networks/volumes). |
| **Postgres Constraint** | Manually delete a required `plans` row | Job transitions to `dead` upon foreign key violation. | YES | Alert generated; manual DB fix required. | Low |
| **Network Partition** | `iptables -A INPUT -p tcp --dport 5432 -j DROP` | Worker loses DB connection, throws unhandled rejection. | UNVERIFIABLE WITHOUT RUNTIME EVIDENCE | Worker restarts via orchestration (PM2/Docker). | Low |
| **Partial Deletion** | Drop MySQL but manually lock Mongo | Worker flags deprovision as `failed`. | NO (Tenant partially exists). | Retry deprovision job. | High (Tenant UUID burned, data lingering). |

## 6. Idempotency & Atomicity Contract
- **Idempotent Operations**:
  - `docker-compose down -v` (Safe to run multiple times, throws no error if resources are already gone).
  - Claiming jobs via `FOR UPDATE SKIP LOCKED` (Database enforces exact-once assignment per cycle).
- **Non-Idempotent Operations (Requires Verification)**:
  - `CREATE DATABASE` executions (UNVERIFIABLE WITHOUT RUNTIME EVIDENCE whether they use `IF NOT EXISTS`).
  - Volume initialization.
- **Compensation Logic**:
  - `deprovisionTenantDatabases` acts as the compensation mechanism. If a provision fails, this function is explicitly invoked to tear down the partially created shared database schemas.
- **Retry Behavior**:
  - Provisioning jobs are explicitly configured with `noRetry: true` in the codebase. A failed provision does NOT automatically loop; it requires manual or systemic re-triggering after cleanup.

## 7. Observability Contract
- **Required Logs**: Every log emitted by the worker MUST include `tenantId` and `jobId` for correlation.
- **Required Correlation IDs**: `correlationId` must be passed from API → Worker.
- **Required Trace Boundaries**:
  - *Gap*: No Distributed Tracing (e.g., OpenTelemetry) is present in the codebase.
  - *Status*: UNVERIFIED GAP.
- **Required Failure Logging Rules**: Any `catch` block interacting with Docker Engine MUST log the raw `stderr` output from the daemon.

## 8. Risk Classification Map
- **Loss of Deprovisioning Audit Trail (`onDelete: "cascade"`)**: STATIC CODE RISK
- **Redis Config Fallback to Localhost (`index.ts`)**: STATIC CODE RISK
- **Heavy Reliance on `REDIS_KEY_PREFIX` for Security**: ARCHITECTURAL GAP
- **Lack of Distributed Tracing**: ARCHITECTURAL GAP
- **Worker Recovery / Idempotency under Crash Conditions**: UNVERIFIABLE
- **Docker Resource Garbage Collection**: UNVERIFIABLE
- **Network Isolation Enforcement**: UNVERIFIABLE

## 9. Final SRE Verdict

> **THIS SYSTEM CANNOT BE DECLARED PRODUCTION SAFE WITHOUT RUNTIME VERIFICATION**

The Stockix architecture defines a robust theoretical contract via Postgres state ownership and step-by-step worker execution. However, the execution layer (Docker daemon reliability, Redis configuration resolution, and fail-open/fail-closed network states) lacks complete runtime observability. Without executing the Runtime Verification Spec and Failure Simulation Matrix in a live environment, the system's actual resilience remains mathematically unproven.
