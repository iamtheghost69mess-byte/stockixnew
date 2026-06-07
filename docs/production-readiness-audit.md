# Stockix Production Readiness & Architecture Audit

**Audit date:** 2026-06-07  
**Last repair verification:** 2026-06-07 (full doc realigned to codebase — open items removed when fixed)  
**Auditor role:** Principal Architect / DevOps / DBA / SRE / Security  
**Scope:** Entire Stockix monorepo — control plane, worker, tenant stacks, shared infra, Finance/POS/PMS  
**Method:** Static codebase analysis, env/schema/compose review, cross-reference with `docs/env-audit.md` and `docs/investigation-report.md`  
**Code changes:** P1/P2 repair items applied in repo; this document updated to match current code

---

## Verdict (Executive Summary)

Stockix is a **sophisticated multi-tenant platform** with deliberate separation between control-plane (Postgres + API + dashboard) and data-plane (shared MySQL/Mongo/Redis + per-tenant Docker stacks). The provisioning journal, deprovision ordering gate, and worker claim tokens show production-minded design.

**However, production at thousands of tenants still requires architectural evolution (shared data plane, per-tenant containers). Remaining work is P0 deploy verification, scale testing, and ops hardening — not open P1/P2 code defects in this repo.**

| Dimension | Score (/10) | One-line verdict |
|-----------|-------------|------------------|
| Architecture | 6.5 | Sound boundaries; shared data plane and host-port routing limit growth |
| Security | 6.8 | RBAC + tenant scope; correlation routes scoped; Redis AUTH + worker secret fail-fast in prod |
| Scalability | 4.5 | ProxySQL + worker concurrency help; per-tenant containers still cap ~500 on one host |
| Reliability | 6.5 | Scrub off API; rollback/data-step gate; SSE disconnect hardening; prod Redis required |
| Maintainability | 7.5 | Monorepo, typed config, route registrars, runbooks, CI route checks |
| Operations | 6.5 | Postgres/MySQL/Mongo + runtime asset backups; Prometheus/Grafana; verify on host |
| Database design | 7.0 | Postgres indexes + per-tenant org slug unique (0055–0057) |
| Provisioning system | 7.0 | POS schema migration journaled; advisory lock; deprovision gate incl. finance compose |

**Overall production readiness:** **6.6 / 10** — suitable for **controlled pilot (≤50 tenants)** after P0 host verification; **not** ready for **1,000+ tenants** without data-plane sharding and routing changes.

---

# PHASE 1 — SYSTEM DISCOVERY

## 1.1 Monorepo topology

```
stockixnew/
├── apps/
│   ├── api/              Control-plane API (Hono, Node 22)
│   └── dashboard/        Operator UI (Next.js 16, BFF proxies)
├── packages/
│   ├── config/           Central env (apiConfig, dashboardConfig, infraConfig)
│   ├── db/               Drizzle schema + Postgres migrations
│   ├── auth/             Session/token helpers
│   └── shared/           Roles, permissions, structured logger
├── infra/
│   ├── dev/              Local control-plane Postgres + Redis
│   ├── shared/           Shared MySQL, Mongo (rs0), tenant Redis
│   ├── tenant-stack/     Per-tenant Finance (1 container)
│   ├── pos-tenant-stack/ Per-tenant POS (4 containers)
│   ├── pms-tenant-stack/ Per-tenant PMS (2 containers)
│   ├── prod/             Production platform compose + runbooks
│   └── worker-service/   Infra worker (provision/deprovision)
└── services/
    ├── stockix-finance/  NestJS ERP (tenant server image)
    ├── posnew/           POS backend + frontend images
    ├── pms/ + pmsfull/   PMS API + frontend
    └── chatlive/         Optional Chatwoot
```

## 1.2 Service dependency diagram

```mermaid
flowchart TB
  subgraph ingress [Ingress]
    CF[Cloudflare DNS]
    TRAEFIK[Traefik TLS]
  end

  subgraph control [Control Plane]
    DASH[Dashboard Next.js]
    API[API Hono x1-2]
    BULLMQ[api-bullmq]
    PG[(Postgres)]
    CPRedis[(control-plane-redis)]
    WORKER[infra-worker]
  end

  subgraph shared [Shared Data Plane]
    MYSQL[(stockix-mysql)]
    MONGO[(stockix-mongo rs0)]
    TREDIS[(stockix-redis)]
  end

  subgraph tenantN [Per Tenant N]
    FIN[Finance server]
    POS[POS stack]
    PMS[PMS stack]
  end

  CF --> TRAEFIK
  TRAEFIK --> DASH
  TRAEFIK --> API
  TRAEFIK --> FIN
  TRAEFIK --> POS

  DASH -->|BFF apiFetch| API
  API --> PG
  API --> CPRedis
  BULLMQ --> CPRedis
  WORKER -->|claim/complete| API
  WORKER -->|docker compose| FIN
  WORKER -->|docker compose| POS
  WORKER -->|docker compose| PMS

  FIN --> MYSQL
  FIN --> MONGO
  FIN --> TREDIS
  POS --> MONGO
  POS --> TREDIS
  POS -->|internal HTTP| FIN
  PMS --> PG

  WORKER --> MYSQL
  WORKER --> MONGO
  WORKER --> TREDIS
```

## 1.3 Request flow (operator action)

```mermaid
sequenceDiagram
  participant Browser
  participant Dash as Dashboard BFF
  participant API as Control Plane API
  participant PG as Postgres
  participant Worker as infra-worker
  participant Docker as Docker Engine

  Browser->>Dash: GET /api/tenants
  Dash->>API: GET /tenants (Bearer PLATFORM_API_SECRET + cookies)
  API->>PG: SELECT tenants (scoped)
  PG-->>API: rows
  API-->>Dash: JSON
  Dash-->>Browser: JSON

  Browser->>Dash: POST /api/tenants
  Dash->>API: POST /tenants
  API->>PG: INSERT tenant + job tenant.provision
  API-->>Dash: 202 + correlationId
  Worker->>API: POST /internal/jobs/claim
  Worker->>Docker: compose up / build / health
  Worker->>API: POST /internal/jobs/:id/complete
  API->>PG: UPDATE deployment status
```

## 1.4 Provisioning flow

```mermaid
flowchart TD
  A[POST /tenants] --> B{Slug recovery?}
  B -->|yes| C[worker preflight.scrub async]
  B -->|no| D[insert tenant.provision job]
  C --> D
  D --> E[202 Accepted]
  E --> F[Worker claim job]
  F --> G[preflight.cleanup]
  G --> H[buildTenantEnvMap + write .env]
  H --> I[docker.data_step MySQL/Mongo/Redis]
  I --> J[compose migration + app up]
  J --> K[health_check + bootstrap_admin]
  K --> L[build_organization BullMQ in Finance]
  L --> M[POS: bootstrap org then pos.schema_migration]
  M --> N[wire_pos + edge.publish Traefik]
  N --> O[mark complete + notifyProvisionOutcome]
  L -->|fail| R[rollbackProvisionFailure]
  R --> S[compose down + optional deprovisionTenantDatabases]
```

**Key files:** `provision-runtime.ts`, `tenant-env.ts`, `provisioner.ts`, `traefik-config.ts`

## 1.5 Deletion flow

```mermaid
flowchart TD
  A[DELETE /tenants/:id] --> B[Cancel child + parent provision jobs]
  B --> C[insertTenantJob tenant.deprovision]
  C --> D[202 + jobId]
  D --> E[Worker runDeprovisionJob]
  E --> F[withTenantLifecycleAdvisoryLock]
  F --> G[compose down finance/pos/pms]
  G --> H[deprovisionTenantDatabases]
  H --> I{mysql AND mongo AND redis clean?}
  I -->|no| J[throw - Postgres NOT deleted]
  I -->|yes| K[DELETE postgres tenant rows]
  K --> L[POST /internal/jobs/complete]
```

See **`docs/investigation-report.md`** for delete vs rollback vs SSE correlation analysis.

## 1.6 Synchronization flows

| Sync | Mechanism | Files |
|------|-----------|-------|
| Finance license ↔ control plane | API internal routes + worker adapters | `pos-license-sync.ts`, worker finance adapters |
| POS ↔ Finance (Bigcapital) | BullMQ on prefixed Redis + internal HTTP | `posnew` jobQueue, provision step `tenant.wire_pos_integration` |
| Provision events → UI | Postgres `tenant_provision_events` + PG NOTIFY → Redis pub/sub (or local fallback) + SSE | `provision-notify-listener.ts`, `provision-pubsub.ts`, `provision-stream` |
| Notifications → UI | Postgres insert + Redis pub/sub + SSE | `notification-service.ts`, `notification-pubsub.ts` |
| Traefik routes | Worker writes dynamic YAML | `traefik-config.ts`, `edgePublisher` |

**Residual gap (dev/local only):** When `CONTROL_PLANE_REDIS_URL` is unset, `apps/api/src/lib/provision-pubsub.ts:9-21` falls back to an in-process `EventEmitter` — SSE does not fan out across API replicas. Production compose sets `CONTROL_PLANE_REDIS_URL`; local dev without Redis still has single-process SSE.

---

# PHASE 2 — ENVIRONMENT AUDIT

**Prior audit:** `docs/env-audit.md` — automated `scripts/audit-env.mjs` reports 0 schema issues for root + `infra/prod/.env`. Alignment section prints informational `root↔prod MISMATCH` for secrets that intentionally differ between local and production files.

## 2.1 Environment matrix (summary)

| Surface | Primary source | Loaded by |
|---------|----------------|-----------|
| Root `.env` | `.env.example` (355 lines) | `packages/config`, all apps via `load-root-env` |
| Production | `infra/prod/.env.example` | `docker compose` in prod stack |
| Tenant per-slug | `{TENANT_ENV_ROOT}/{slug}/.env` | Worker `buildTenantEnvMap()` |
| Dashboard | `NEXT_PUBLIC_*` + server vars | `dashboardConfig` |
| API | `apiConfig` | `apps/api` |
| Worker | Same root + `WORKER_*` overrides | `infra/worker-service` |
| Finance tenant | Generated tenant `.env` | Docker compose `--env-file` |
| POS/PMS tenant | Module stack env from tenant `.env` | `module-stacks.ts` |

## 2.2 Environment findings (code-verified 2026-06-07)

All former Phase 2 open items are **resolved in repo**. Residual ops notes only.

| ID | Status | Evidence |
|----|--------|----------|
| E1 | **Fixed (prod)** | `validateWorkerSecret()` rejects default in staging/production; worker + API call `validateRequiredEnv()` at startup (`packages/config`, `worker.ts`, `create-control-plane-app.ts`) |
| E2 | **Fixed** | Shared Redis `requirepass`, `512mb`, `noeviction` (`infra/shared/docker-compose.yml`); tenant URLs include password when `TENANT_REDIS_PASSWORD` set (`tenant-env.ts`) |
| E5 | **Fixed** | `CONTROL_PLANE_REDIS_URL` in `infra/prod/.env.example` and root `.env.example` |
| E6 | **Fixed** | `PROVISION_POLL_MS` → `apiConfig.provisionPollMs` → `worker.ts` poll loop |
| E7 | **Ops** | `CHATWOOT_API_ACCESS_TOKEN` post-boot — documented in `audit-env.mjs` prod blockers |
| E8 | **Fixed** | `scripts/prod-scale-smoke.sh` uses `BACKUP_B2_*` |

## 2.3 Secret exposure risks

- Tenant `.env` files contain JWT, DB passwords (encrypted deployment secrets), written `0o600` under `TENANT_ENV_ROOT` — **filesystem backup/ACL critical**
- Platform secrets use `__MUST_OVERRIDE__` placeholders in examples — good
- Dashboard BFF holds `PLATFORM_API_SECRET` server-side only — good
- Worker + API share `WORKER_SECRET` for `/internal/*` — single bearer, no rotation story documented

---

# PHASE 3 — DATABASE AUDIT

## 3.1 Postgres (control plane)

**Schema:** `packages/db/src/schema.ts`  
**Migrations:** `packages/db/drizzle/0000`–`0057` (hand-written: `0055_tenant_org_indexes`, `0056_organizations_tenant_slug_unique`, `0057_tenant_lifecycle_jobs_cancel_requested_at`)  
**Runner:** `pnpm db:migrate`

| Table | FK / cascade | Indexes | Risk |
|-------|--------------|---------|------|
| `tenants` | `owner_id` → owners **RESTRICT** | Unique `slug`, `organization_number`, **`tenants_owner_id_idx`** (0055) | Low |
| `organizations` | `tenant_id` → tenants **CASCADE** | **`organizations_tenant_id_idx`** (0055), **`organizations_tenant_slug_unique`** on `(tenant_id, slug)` (0056); global `subdomain` unique | Cross-tenant slug collision resolved; subdomain still globally unique |
| `tenant_lifecycle_jobs` | `tenant_id` CASCADE | `(status, run_at, priority)`, `(tenant_id, created_at)`, `(correlation_id)` | Good for worker |
| `tenant_deployments` | CASCADE from tenant | — | Orphan if manual tenant row delete |
| `tenant_provision_events` | Append-only trace | correlation indexes | Good for SSE replay |
| `admin_audit_log` | target tenant FK | — | No retention policy |

**Transaction boundaries:** Job claim uses DB transaction + row lock pattern in `internal.ts`. Idempotency middleware uses separate storage.

## 3.2 MySQL (tenant isolation)

**Pattern:** `stockix_{mysqlSafe(slug)}_*` databases, user `tenant_{mysqlSafe}` with grant on prefix.

| DB | Purpose |
|----|---------|
| `stockix_{safe}_system` | Finance system schema |
| `stockix_{safe}_{orgId}` | Per-organization tenant DB (runtime) |
| `stockix_{safe}_finance` | Legacy compat — **dropped on deprovision** via `tenantMysqlDatabaseNames().financeDb` |

**Isolation:** Strong at DB name level on shared instance. **Blast radius:** one MySQL for all tenants.

**Deprovision gate:** Postgres rows not deleted unless `financeCompose && mysqlDbs && mongoDb && redisKeys` (`provisioner.ts:719-734`).

## 3.3 MongoDB (`{slug}_pos`)

- URL: `mongodb://stockix-mongo:27017/{slug}_pos?replicaSet=rs0`
- Raw slug in DB name (API validates `[a-z0-9-]+`)
- Deprovision: `dropDatabase` via `mongosh` in shared container
- POS schema migrations: worker journaled step `pos.schema_migration` runs `node scripts/run-schema-migrations.js` via `docker compose exec` **after** `bootstrapPosOrganization` (`provision-runtime.ts:177-203`, `module-stacks.ts:532-533`)

## 3.4 Redis

| Instance | Purpose | Isolation |
|----------|---------|-----------|
| `control-plane-redis` | API rate limit + BullMQ (license expiry, invite mail) | Global queues |
| `stockix-redis` | All tenant Finance + POS BullMQ/Agenda | `REDIS_KEY_PREFIX=tenant:{slug}:` + **`requirepass`** (`TENANT_REDIS_PASSWORD`) |

**Prod config:** `512mb` maxmemory, `noeviction` (`infra/shared/docker-compose.yml`). Dev may run passwordless when `TENANT_REDIS_PASSWORD` unset — prod only.

## 3.5 Orphan / leakage scenarios

| Scenario | Possible? | Mitigation |
|----------|-----------|------------|
| MySQL DB without Postgres tenant | Yes (failed rollback before `docker.data_step`) | `audit-orphan-dbs.ts`, M2 runbook; throws if `docker.data_step` journaled |
| Postgres tenant without MySQL | Yes (failed provision early) | Retry provision |
| Redis keys after delete | Blocked if flush fails | Deprovision throws before PG delete |
| PMS data in platform Postgres | App-layer scoping only | Documented — `OPERATIONS.md` § P1-8 |

---

# PHASE 4 — TENANT LIFECYCLE AUDIT

## 4.1 States

**Tenant status (`tenants.status`):** `provisioning | active | partial | failed | suspended | stopped` (check constraint 0054)

**Deployment status (`tenant_deployments.status`):** provisioning lifecycle separate from tenant status

## 4.2 Lifecycle matrix

| Operation | Entry | Async? | Idempotent? | Rollback | Stuck states |
|-----------|-------|--------|-------------|----------|--------------|
| **Create** | POST `/tenants` | Job queue | Slug unique constraint | `rollbackProvisionFailure` | `provisioning` + dead job |
| **Provision** | Worker `tenant.provision` | Yes | Journal `operationKey` resume | Compose down + DB cleanup | `failed`, partial journal |
| **Activate** | Job complete → status active | — | Complete handler | — | — |
| **Suspend** | POST suspend → lifecycle job | Yes | — | — | `suspended` |
| **Delete** | DELETE → `tenant.deprovision` | Yes | 202 + job row | Worker deprovision | Job pending if worker down |
| **Recovery** | POST retry-provision | Yes | M1/M5 runbooks | — | Failed + orphan resources |

## 4.3 Lifecycle — open vs resolved

**Open (low):**

| ID | Severity | Issue |
|----|----------|-------|
| L6 | **P3** | Failed tenant + delete: UI may lag until worker runs deprovision (polling mitigates) |

**Resolved (removed from open list):** L1 scrub off API; L2 rollback throws when `docker.data_step` journaled but shared DB teardown incomplete; L3 cooperative cancel (`cancel_requested_at`); L4 correlation routes scoped (`assertCorrelationJobAccess`); L5 deprovisioning UI state + polling.

## 4.4 Idempotency & retry

- HTTP idempotency: `POST/PATCH/DELETE` on `/owners`, `/tenants`, `/licenses`, `/admin`, `/api-keys` (`middleware/idempotency.ts:16`)
- Provision jobs: **no auto-retry** on failure for `tenant.provision` (`worker.ts:912-918`)
- Deprovision: up to 5 attempts via job table
- Journal enables **resume** after worker crash — strong point

---

# PHASE 5 — WORKER AUDIT

## 5.1 Job processing model

- Worker process: `WORKER_CONCURRENCY` parallel poll loops (default from `apiConfig`, often `2`)
- Poll interval: `PROVISION_POLL_MS` / `apiConfig.provisionPollMs` (default **2000ms**)
- Claim: `POST /internal/jobs/claim` with `FOR UPDATE SKIP LOCKED` + stale-lease reclaim (~10 min)
- Heartbeat: 30s → updates `claimedAt`
- Execution timeout: default **45 minutes**
- Fail report: API `/internal/jobs/:id/fail` or **DB fallback** if API unreachable

## 5.2 Locks

Dedicated Postgres client `max: 1` for session advisory locks (`provision-lock.ts`). Full lifecycle jobs wrapped: `runProvisionJob`, `runAddModuleJob`, `runDeprovisionJob` (`worker.ts`). Compose sub-steps also use lock when `tenantId` known (`provision-runtime.ts`).

Per-tenant serialization is **enforced** when multiple worker loops or containers run.

## 5.3 BullMQ (two tiers)

| Location | Redis | Queues |
|----------|-------|--------|
| Control plane | `control-plane-redis` | license-expiry, owner-invite-mail |
| Tenant Finance | `stockix-redis` + prefix | OrganizationBuild, mail, etc. |
| Tenant POS | Same shared Redis | bigcapital_sync, platform, print |

Organization build processor had `Scope.REQUEST` bug (fixed in codebase + image rebuild required).

## 5.4 Worker failure modes

| Mode | Behavior | Risk |
|------|----------|------|
| Zombie job | Stale reclaim marks dead / reclaims | Duplicate work if worker still running |
| Lost completion | Worker DB fallback | Race with reclaim |
| API down during fail report | Logged; fallback persist | Job state drift |
| Infinite retry | Capped at maxAttempts (5) except provision family (noRetry) | Dead jobs need ops |
| Duplicate execution | `FOR UPDATE SKIP LOCKED` + advisory lock per tenant | Low with current worker model |

---

# PHASE 6 — DOCKER AUDIT

## 6.1 Stack inventory

| Stack | File | Restart | Healthchecks |
|-------|------|---------|--------------|
| Shared | `infra/shared/docker-compose.yml` | unless-stopped | mysql, mongo, redis ✓ |
| Prod platform | `infra/prod/docker-compose.yml` | unless-stopped | Most ✓; **api-bullmq ✓**, **db-backup ✓** (crond); Prometheus + Grafana added |
| Tenant Finance | `infra/tenant-stack/docker-compose.yml` | unless-stopped | server ✓; migration one-shot |
| POS | `infra/pos-tenant-stack/docker-compose.yml` | unless-stopped | backend ✓; **workers: pgrep + Redis ping** (`docker-compose.yml:96-101`, `131-136`) |
| PMS | `infra/pms-tenant-stack/docker-compose.yml` | unless-stopped | ✓ |

## 6.2 Networks

- `stockix_public` — Traefik ingress
- `stockix_internal` — internal-only control plane
- `stockix-shared` — **external** bridge to tenant DBs (must exist before prod)
- `socket_proxy_network` — Docker API via socket-proxy (Traefik + worker)

## 6.3 Resource leaks

| Leak type | Cause | Detection |
|-----------|-------|-----------|
| Orphan containers | Failed rollback / manual abort | `docker ps`, compose project names |
| Orphan volumes | compose down without `-v` when intended | M2 runbook |
| Orphan MySQL DBs | Rollback partial | `audit-orphan-dbs.ts` |
| Orphan Traefik YAML | unpublish failure | File in `TRAEFIK_DYNAMIC_DIR` |
| Orphan networks | `bestEffortDockerProjectCleanup` | Low priority |

## 6.4 Traefik + Cloudflare

- TLS: Let's Encrypt DNS-01 via `CF_DNS_API_TOKEN`
- Tenant routes: dynamic file provider + `edgePublisher.unpublish`
- Upstream: `host.docker.internal:${PUBLIC_PROXY_PORT}` — **host port binding model**

---

# PHASE 7 — SECURITY AUDIT

## 7.1 Authentication & authorization

| Layer | Implementation | File |
|-------|----------------|------|
| Session | HMAC cookie, 30-day TTL, version revocation | `services/auth/tokens.ts` |
| Platform secret | Bearer for BFF | `middleware/auth.ts` |
| Worker secret | `/internal/*` only | `middleware/auth.ts:65-74` |
| API keys | `sk_live_` prefix, hashed, **read_only** role | `routes/api-keys.ts` |
| RBAC | Permission-string middleware in production (`createRbacMiddleware` + `loadOwnerAuthById` + `hasAllPermissions`) | `middleware/rbac.ts:57-96`, `register-control-plane.ts:23` |

## 7.2 Threat model (STRIDE summary)

| Threat | Exposure | Mitigation status |
|--------|----------|-------------------|
| Cross-tenant data access | Tenant scope on `:tenantId` routes | **Mitigated** — correlation routes use `assertCorrelationJobAccess` |
| Privilege escalation | Custom permissions not loaded in prod RBAC | **Mitigated** — `loadOwnerAuthById()` + `hasAllPermissions()` (`rbac.ts:83-92`) |
| Worker secret compromise | Full job claim/complete | Rotate secret; network isolate |
| Redis key enumeration | Shared tenant Redis | **Mitigated (prod)** — `requirepass` + key prefix; verify `TENANT_REDIS_PASSWORD` on host |
| Docker socket abuse | socket-proxy filtered POST | db-backup mounts raw socket |
| SSRF via proxies | POS/PMS/Finance proxy routes | Rank-gated; review URL construction |
| Tenant file path traversal | `TENANT_ENV_ROOT` slug validated | Low if slug regex enforced |

## 7.3 Security findings

| ID | Status | Notes |
|----|--------|-------|
| S1 | **Fixed** | Scrub in worker only (`worker.ts`, `tenants.ts:943`) |
| S2 | **Fixed** | Correlation routes scoped — `assertCorrelationJobAccess` + tests |
| S3 | **Mitigated (prod)** | Redis AUTH + memory policy in shared compose; verify deploy |
| S4 | **Not a defect** | RBAC loads permissions via `loadOwnerAuthById` |
| S5 | **Documented** | PMS app-layer Postgres isolation — `OPERATIONS.md` § P1-8 |
| S6 | **Accepted** | Traefik dashboard localhost-only — documented |
| S7 | **Dev only** | Default secrets blocked in staging/production startup validation |

---

# PHASE 8 — API AUDIT

## 8.1 Route registrars (control plane)

All mounted via `register-control-plane-routes.ts` — see CLAUDE.md route map.

## 8.2 Blocking operations in request path (must be zero in prod)

| Route | Operation | Duration risk | File |
|-------|-----------|---------------|------|
| POST `/tenants` | Enqueue `tenant.provision` only; slug scrub in worker | **Async** | `tenants.ts:943` (P0-4 comment) |
| GET `/tenants/provision-status/:id` | Readiness from `tenant_provision_events` journal rows | Milliseconds | `readiness-engine.ts` (no Docker/HTTP) |
| DELETE `/tenants/:id` | DB only + enqueue | **Fixed** — async 202 | `tenants.ts:762+` |

## 8.3 Idempotency & timeouts

- Idempotency middleware: `/owners`, `/tenants`, `/licenses`, `/admin`, `/api-keys` (`idempotency.ts:16`)
- Dashboard `apiFetch`: 3s dev / 10s prod default; lifecycle DELETE uses 30s
- API global rate limit: Redis-backed in prod (required `CONTROL_PLANE_REDIS_URL`)

## 8.4 API findings

| ID | Status | Notes |
|----|--------|-------|
| A1 | **Fixed** | No blocking Docker on POST `/tenants` |
| A2 | **Fixed** | Event-based readiness (`readiness-engine.ts`) |
| A3 | **Fixed** | Per-file idempotency comments on five route registrars |
| A4 | **Good** | Transient DB → 503 (`create-control-plane-app.ts`) |

---

# PHASE 9 — SSE / STREAMING AUDIT

## 9.1 Streams

| Stream | API | BFF | Client |
|--------|-----|-----|--------|
| Notifications | Hono `streamSSE` + Redis pub/sub | `proxyControlPlaneEventStream` | EventSource + 5s reconnect |
| Provision progress | Hono `streamSSE` + Redis pub/sub (prod) or local EventEmitter (dev) | Direct body proxy (pump added) | EventSource |

## 9.2 Findings

| ID | Status | Notes |
|----|--------|-------|
| SS1 | **Mitigated** | BFF `proxyControlPlaneEventStream` pump; prod requires Redis pub/sub |
| SS2 | **Fixed** | `safeWrite()` catches `writeSSE` errors; `forward().catch()` on pub/sub callback (`tenants.ts`) |
| SS3 | **Dev only** | EventEmitter fallback when `CONTROL_PLANE_REDIS_URL` unset — intentional for local dev |
| SS4 | **Fixed** | `stream.onAbort()` sets closed flag (`tenants.ts`) |
| SS5 | **Ops** | Do not run API with file watcher in production |
| SS6 | **Fixed** | Redis pub/sub idempotent disconnect |

---

# PHASE 10 — PROVISIONING AUDIT

## 10.1 Core functions

| Function | File | Role |
|----------|------|------|
| `buildTenantEnvMap()` | `tenant-env.ts` | Per-tenant env generation |
| `provisionTenant()` | `provisioner.ts` → `provision-runtime.ts` | Full provision |
| `deprovisionTenant()` | `provisioner.ts` | Ordered teardown + PG gate |
| `rollbackProvisionFailure()` | `provision-runtime.ts` | Failure cleanup |
| `deprovisionTenantDatabases()` | `provisioner.ts` | Shared MySQL/Mongo/Redis |

## 10.2 Transactional behavior

- **Not atomic end-to-end** — journal + job state machine provide eventual consistency
- Postgres tenant row created **before** worker finishes — intentional
- Deprovision: **strong gate** before Postgres delete (finance compose + shared DBs)
- Rollback: **gated** when `docker.data_step` journaled — throws if shared DB teardown incomplete; compose down remains best-effort with logged warnings

## 10.3 Partial failure states

| State | User deprovision | Provision rollback |
|-------|------------------|-------------------|
| Docker up, PG deleted | Blocked by gate | N/A |
| Finance compose up, PG exists | Blocked (`financeCompose` gate) | Possible if compose down fails |
| MySQL exists, PG deleted | Blocked | Blocked when `docker.data_step` journaled (throws) |
| Mongo exists, PG deleted | Blocked | Blocked when `docker.data_step` journaled (throws) |
| Redis keys remain | Blocked | Blocked when `docker.data_step` journaled (throws) |
| Traefik route remains | PG may still delete if data plane clean | Common — manual cleanup |

## 10.4 Recent fix

- Finance `OrganizationBuild.processor` — removed invalid `Scope.REQUEST` (requires `stockix-server:local` image rebuild)

---

# PHASE 11 — SCALABILITY AUDIT

## 11.1 Tenant count projections

Assumptions: finance-only tenant ≈512MB RAM limit + shared DB connections; single EC2-class host.

| Tenants | Feasibility | First bottleneck |
|---------|-------------|------------------|
| **100** | Feasible on 64GB+ host with monitoring | MySQL connections via ProxySQL; worker queue |
| **500** | **Not viable** current design | RAM + container count + worker queue depth |
| **1,000** | Requires redesign | Container count, Traefik YAML, Docker daemon |
| **5,000** | Out of scope | Multi-region, sharded data plane, worker pool |

## 11.2 Single points of failure

- Single shared MySQL, Mongo, Redis (mitigated limits in repo; verify on host)
- Worker throughput bounded by `WORKER_CONCURRENCY` × replica count (not single serial loop)
- Host-port Traefik upstream model
- Single Postgres (backed up, but not HA in compose)
- `MAX_TENANT_PORT` ~4999 caps published ports

## 11.3 API scaling

- Scale via `docker compose --scale api=N` — no `deploy.replicas` in compose (`OPERATIONS.md`)
- SSE/provision bus: prod uses Redis pub/sub when `CONTROL_PLANE_REDIS_URL` set; local dev fallback is in-process only

---

# PHASE 12 — OBSERVABILITY AUDIT

## 12.1 Current state

| Signal | Status |
|--------|--------|
| Structured JSON logs | API, worker, Finance tenant server ✓ |
| HTTP request logs | requestId, latency ✓ |
| Sentry | API, worker, dashboard optional |
| Metrics | `GET /metrics` (Prometheus text) on API + worker; optional `METRICS_ENDPOINT` push | `apps/api/src/routes/public.ts:76`, `infra/worker-service/src/worker-prometheus.ts` |
| Audit log | Postgres `admin_audit_log` ✓ |
| Provision trace | `tenant_provision_events` ✓ |
| Health | `/health`, `/ready`, worker `:9090/health` |
| Prometheus/Grafana | Prod compose services `prometheus`, `grafana` | `infra/prod/docker-compose.yml:363-395` |

## 12.2 Gaps (remaining)

- No Loki/OpenTelemetry deployment (Prometheus/Grafana present)
- `/ready` does not check shared MySQL/Mongo/worker reachability
- Backup failure alerting requires log/metrics monitoring (cron in `db-backup`)
- SLOs/alerting optional via `ALERT_WEBHOOK_URL`

## 12.3 Recommendations

| Tool | Use | Status |
|------|-----|--------|
| **Prometheus** | API latency, worker job duration, queue depth | **In prod compose** (`infra/prod/docker-compose.yml:363`) |
| **Grafana** | Dashboards per tenant count / host RAM | **In prod compose** (`infra/prod/docker-compose.yml:377`) |
| **Loki** | Centralize JSON logs from all compose services | Not deployed |
| **OpenTelemetry** | Trace BFF → API → worker → docker | Not deployed |
| **Sentry** | Enable in prod for all three control-plane apps | Optional |
| **PagerDuty/Opsgenie** | Wire `ALERT_WEBHOOK_URL` + backup cron failures | Not wired |

---

# PHASE 13 — DISASTER RECOVERY AUDIT

## 13.1 Backup coverage

| Asset | Backed up? | Script | RPO |
|-------|------------|--------|-----|
| Control-plane Postgres | ✓ | `infra/prod/backup/backup.sh` | ~12h (2× daily) |
| Shared MySQL (all tenant DBs) | ✓ | `backup-shared.sh` | ~12h |
| Shared Mongo | ✓ (oplog archive) | `backup-shared.sh` | ~12h |
| Tenant Redis RDB | ✓ | `backup-runtime.sh` → B2 `redis/` | ~12h |
| Traefik dynamic YAML | ✓ | `backup-runtime.sh` → B2 `traefik/` | ~12h |
| Tenant `.env` dirs | ✓ (GPG) | `backup-runtime.sh` → B2 `tenant-envs/` | ~12h |
| Control-plane Redis | ✗ (ephemeral) | — | — |
| S3 tenant attachments | ✗ | Separate bucket / provider | — |

## 13.2 Restore documentation

- Postgres: full runbook (`OPERATIONS.md`)
- MySQL: M4 runbook
- Mongo: sketch only (`backup/README.md`)
- Tenant recovery: M1–M5 matrices in `OPERATIONS.md`

## 13.3 Data-loss risks

- **RPO ~12 hours** — no WAL continuous archiving
- Redis queue/state loss on restart — in-flight jobs may stall
- Partial rollback without journaled `docker.data_step` may leave orphan MySQL/Mongo — `audit-orphan-dbs.ts` + M2 runbook

---

# PHASE 14 — PRODUCTION READINESS SCORES

| Category | Score | Justification |
|----------|-------|---------------|
| **Architecture** | **6.5/10** | Clear control vs data plane split; shared infra and host-port routing limit growth |
| **Security** | **6.8/10** | Auth stack solid; correlation scoped; Redis AUTH + worker secret fail-fast in prod |
| **Scalability** | **4.5/10** | ProxySQL + worker concurrency; per-tenant containers hit wall <500 on one host |
| **Reliability** | **6.5/10** | Deprovision/rollback gates; SSE hardening; prod Redis required |
| **Maintainability** | **7.5/10** | Monorepo, typed config, runbooks, route checks in CI |
| **Operations** | **6.5/10** | DB + runtime asset backups; Prometheus/Grafana; host verification required |
| **Database design** | **7.0/10** | Migrations 0055–0057 |
| **Provisioning system** | **7.0/10** | Advisory lock, finance compose gate, journaled POS migration |

**Weighted overall: 6.6/10** (aligned with executive summary)

---

# PHASE 15 — CRITICAL FINDINGS

## P0 — Critical (block production at scale)

| ID | Issue | Business impact | Fix direction |
|----|-------|-----------------|---------------|
| P0-1 | Shared MySQL connection ceiling | Platform-wide outage at high tenant count | **Mitigated in repo:** `max_connections=1000` + ProxySQL (`infra/shared/docker-compose.yml`). Verify deploy: `scripts/verify-shared-infra.sh`; monitor `Threads_connected` (see OPERATIONS.md) |
| P0-2 | Shared tenant Redis isolation | Queue loss, cross-tenant risk | **Mitigated in repo:** `requirepass`, `512mb`, `noeviction` (`infra/shared/docker-compose.yml`). Verify `TENANT_REDIS_PASSWORD` + `scripts/verify-shared-infra.sh` |
| P0-3 | Worker throughput / scale | Provision queue backlog | **Partial:** `WORKER_CONCURRENCY` + `FOR UPDATE SKIP LOCKED`; scale with `--scale infra-worker=N`. Documented in OPERATIONS.md |
| P0-5 | SSE/dashboard on API restart | Operator UI broken | **Mitigated:** BFF pump + prod Redis hard-fail (`provision-pubsub.ts`, `index.ts`); SSE `safeWrite` disconnect handling. Staging soak in OPERATIONS.md |

**Resolved in repair pass:** P0-4 (scrub moved to worker `preflight.scrub` — `worker.ts:554`, `domain/scrub-tenant-artifacts.ts`)

## P1 — High priority

| ID | Issue |
|----|-------|
| _(none — all P1 items resolved)_ |

**Resolved:** P1-1 (dedicated advisory lock client + full job wrap), P1-2 (rollback throws on incomplete shared DB teardown when `docker.data_step` journaled), P1-3 (`assertCorrelationJobAccess`), P1-5 (`backup-runtime.sh` Redis/Traefik/tenant-env → B2), P1-6 (no misleading `deploy.replicas`; scale via `--scale api=N` — `OPERATIONS.md`), P1-7 (prod Redis hard-fail + startup ping), P1-8 (PMS Postgres threat model in `OPERATIONS.md`), P1-9 (`assertFinanceStackStopped` + finance in deprovision gate), P1-10 (`validateWorkerSecret` + worker startup)

## P2 — Medium priority (open)

| ID | Issue |
|----|-------|
| _(none — all P2 items below resolved)_ |

**Resolved in repair pass:** P2-1 (0055 indexes), P2-2 (0056 `(tenant_id, slug)` unique), P2-3 (legacy `_finance` in `tenantMysqlDatabaseNames` + explicit DROP in `deprovisionTenantDatabases`), P2-4 (`pos.schema_migration`), P2-5 (deprovisioning UI), P2-6 (DB event readiness), P2-7 (idempotency comments on route registrars), P2-8 (`cancel_requested_at`), P2-9 (api-bullmq/db-backup healthchecks), P2-10 (POS worker healthchecks), P2-11 (`GET /metrics` + Prometheus/Grafana), P2-12 (`audit-env.mjs` informational root↔prod MISMATCH + exit on real blockers)

## P3 — Improvements

| ID | Issue |
|----|-------|
| _(none — all listed P3 items resolved)_ |

**Resolved:** P3-1 (`PROVISION_POLL_MS`), P3-2 (`deprovision.complete` notification), P3-3 (Finance winston JSON logs), P3-4 (Sentry DSN in tenant env + Finance init), P3-5 (`prod-scale-smoke.sh` `BACKUP_B2_*`), P3-6 (Traefik dashboard doc), P3-7 (`scripts/dr-drill.sh`), P3-8 (same as P2-7), P3-9 (same as P2-12). **Open:** L6 (minor UI lag on delete until worker runs).

---

# PHASE 16 — REPAIR VERIFICATION (2026-06-07)

Code-verified status of items from the P1/P2 repair pass. **Removed from open findings above if fixed; kept if not.**

| ID | Status | Evidence (file:line or migration) |
|----|--------|-----------------------------------|
| P0-4 / L1 / S1 / A1 | **Fixed** | No `scrubTenantRuntimeArtifacts` in `apps/api`; worker `worker.ts:554`, comment `tenants.ts:943` |
| P1-4 / S4 | **Not a defect** | `createRbacMiddleware` + `loadOwnerAuthById` + `hasAllPermissions` at `rbac.ts:57-96`; registered `register-control-plane.ts:23`. No `requirePermission()` in repo. |
| P1-7 | **Fixed (prod)** | Hard-fail without Redis in production (`provision-pubsub.ts`); `ensureControlPlaneRedisReady` (`redis.ts`, `index.ts`). Dev EventEmitter fallback intentional. |
| P1-10 | **Fixed** | `validateWorkerSecret` + worker `validateRequiredEnv()` at startup (`packages/config`, `worker.ts`) |
| P1-3 | **Fixed** | `assertCorrelationJobAccess` on all correlation routes; tests `provision-correlation-auth.test.ts` |
| P1-1 | **Fixed** | Dedicated lock client + full job wrap (`provision-lock.ts`, `worker.ts`) |
| P1-2 | **Fixed** | `rollbackProvision` throws on incomplete `deprovisionTenantDatabases` when `docker.data_step` journaled |
| P1-5 | **Fixed** | `backup-runtime.sh` + `db-backup` cron; verify commands in `OPERATIONS.md` |
| P1-6 | **Fixed** | No `deploy.replicas` in compose; documented `--scale api=N` |
| P1-8 | **Documented** | PMS app-layer Postgres isolation threat model in `OPERATIONS.md` |
| P1-9 | **Fixed** | `assertFinanceStackStopped` + `financeCompose` in deprovision gate (`provisioner.ts`) |
| P0-1 / P0-2 | **Verify ops** | `scripts/verify-shared-infra.sh`; connection budget in `OPERATIONS.md` |
| P0-3 / P0-5 | **Documented** | Worker scale + SSE soak in `OPERATIONS.md`; SSE `safeWrite` in `tenants.ts` |
| P2-1 | **Fixed** | `0055_tenant_org_indexes.sql`; `schema.ts:104`, `:133` |
| P2-2 | **Fixed** | `0056_organizations_tenant_slug_unique.sql`; `schema.ts:134` |
| P2-3 | **Fixed** | `tenantMysqlDatabaseNames()` + deprovision DROP; `audit-orphan-dbs.ts` |
| P2-7 / A3 / P3-8 | **Fixed** | Idempotency comments on five route registrars |
| P2-12 / P3-9 / E8 | **Fixed** | `audit-env.mjs` informational prod MISMATCH; `prod-scale-smoke.sh` `BACKUP_B2_*` |
| S2 / L4 / P1-3 | **Fixed** | `assertCorrelationJobAccess` + tests |
| S3 / E2 / P0-2 | **Mitigated** | Shared Redis AUTH in compose — verify on host |
| SS2 / SS4 / P0-5 | **Fixed** | SSE `safeWrite` + `onAbort` (`tenants.ts`) |
| P2-4 | **Fixed** | `provision-runtime.ts:177-203` (`afterBootstrap`); `module-stacks.ts:532-533`; command `node scripts/run-schema-migrations.js` |
| P2-5 | **Fixed** | `tenant-status-badge.tsx:54`, `tenant-list.tsx:429`, `tenants-page-content.tsx:188` |
| P2-6 | **Fixed** | `readiness-engine.ts` — event-based only |
| P2-8 / L3 | **Fixed** | `0057_tenant_lifecycle_jobs_cancel_requested_at.sql`; `internal.ts:328-329`; `tenants.ts:1109` |
| P2-9 | **Fixed** | `infra/prod/docker-compose.yml:292-301` (api-bullmq), `:439-443` (db-backup) |
| P2-10 | **Fixed** | `infra/pos-tenant-stack/docker-compose.yml:96-101`, `:131-136` |
| P2-11 | **Fixed** | `GET /metrics` + Prometheus/Grafana compose |
| E1 / P1-10 | **Fixed** | `validateWorkerSecret` + startup validation |
| E3 / E4 | **Fixed** | `.env.example` Mongo URL + `TENANT_DB_NAME_PREFIX` comments |

**`node scripts/audit-env.mjs` (2026-06-07):** exit 0 when local root↔POS aligned; root↔prod MISMATCH lines marked informational.

---

# APPENDIX A — Related documents

| Document | Purpose |
|----------|---------|
| `docs/investigation-report.md` | Deep dive: tenant delete vs SSE vs observed logs |
| `docs/env-audit.md` | Automated env alignment audit |
| `docs/testrun-results.md` | CI/test matrix snapshot |
| `infra/prod/OPERATIONS.md` | M1–M5 runbooks, backup/restore |
| `infra/prod/FAILOVER_RUNBOOK.md` | EC2 failover decision tree |
| `CLAUDE.md` | API route map |

---

# APPENDIX B — Approval checklist (Principal Engineer sign-off)

Before production go-live at target tenant count, require:

- [ ] All **P0** items verified on production host (`scripts/verify-shared-infra.sh`, `scripts/dr-drill.sh`)
- [ ] Load test at **2× target tenant count** on staging hardware profile
- [ ] DR drill: Postgres + MySQL + runtime asset restore verified within RTO target
- [x] Security review: correlation routes scoped + Redis prod hard-fail + worker secret validation
- [ ] `pnpm docker:prebuild` in CI for tenant images
- [ ] API runs **without** file watcher; SSE soak test 24h (`OPERATIONS.md`)
- [ ] Worker horizontal scale test with `--scale infra-worker=N`
- [ ] Observability: centralized logs + alerts on backup cron failures + worker dead jobs

---

*End of production readiness audit. Updated 2026-06-07 — body phases aligned with Phase 15/16 verification table.*
