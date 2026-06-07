# Stockix Production Readiness & Architecture Audit

**Audit date:** 2026-06-07  
**Auditor role:** Principal Architect / DevOps / DBA / SRE / Security  
**Scope:** Entire Stockix monorepo — control plane, worker, tenant stacks, shared infra, Finance/POS/PMS  
**Method:** Static codebase analysis, env/schema/compose review, cross-reference with `docs/env-audit.md` and `docs/investigation-report.md`  
**Code changes:** None (audit only)

---

## Verdict (Executive Summary)

Stockix is a **sophisticated multi-tenant platform** with deliberate separation between control-plane (Postgres + API + dashboard) and data-plane (shared MySQL/Mongo/Redis + per-tenant Docker stacks). The provisioning journal, deprovision ordering gate, and worker claim tokens show production-minded design.

**However, this system is not yet safe to approve for production at thousands of tenants without addressing structural limits and several P0/P1 defects.**

| Dimension | Score (/10) | One-line verdict |
|-----------|-------------|------------------|
| Architecture | 6.5 | Sound boundaries; shared data plane and single worker are hard ceilings |
| Security | 6.0 | RBAC + tenant scope exist; gaps in correlation routes, Redis isolation, permission wiring |
| Scalability | 4.0 | Single-host tenant-per-container model breaks before 500 tenants |
| Reliability | 5.5 | Job queue + journal good; rollback/SSE/API-restart fragility remains |
| Maintainability | 7.0 | Monorepo, typed config, route registrars, docs/runbooks |
| Operations | 5.0 | B2 backups for PG/MySQL/Mongo; missing Redis/Traefik/S3 DR |
| Database design | 6.5 | Postgres solid; shared MySQL/Mongo isolation OK at small scale |
| Provisioning system | 6.0 | Journal + async worker strong; API blocking scrub + partial rollback weak |

**Overall production readiness:** **5.8 / 10** — suitable for **controlled pilot (≤50 tenants)** on a large single host after P0 fixes; **not** ready for **1,000+ tenants** without architectural evolution.

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
  B -->|yes| C[scrubTenantRuntimeArtifacts SYNC in API]
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
  L --> M[wire_pos + edge.publish Traefik]
  M --> N[mark complete + notifyProvisionOutcome]
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
| Provision events → UI | Postgres `tenant_provision_events` + in-memory bus + SSE | `provision-bus.ts`, `provision-stream` route |
| Notifications → UI | Postgres insert + Redis pub/sub + SSE | `notification-service.ts`, `notification-pubsub.ts` |
| Traefik routes | Worker writes dynamic YAML | `traefik-config.ts`, `edgePublisher` |

**Gap:** In-memory `provision-bus.ts` does not fan out across API replicas — SSE misses live events after restart or on non-leader instance.

---

# PHASE 2 — ENVIRONMENT AUDIT

**Prior audit:** `docs/env-audit.md` — automated `scripts/audit-env.mjs` reports 0 schema issues for root + `infra/prod/.env`.

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

## 2.2 Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| E1 | **P1** | `WORKER_SECRET` defaults to `dev-worker-secret` if unset | `packages/config/src/index.ts` |
| E2 | **P1** | Shared tenant Redis has **no password** — prefix-only isolation | `tenant-env.ts`, `infra/shared/docker-compose.yml` |
| E3 | **P2** | Root `.env.example` stale Mongo URL (`mongodb://mongo/stockix`) vs runtime `{slug}_pos` | `.env.example` L228 vs `tenant-env.ts` |
| E4 | **P2** | `TENANT_DB_NAME_PREFIX` vs `TENANT_DB_NAME_PERFIX` typo duplicated intentionally | Finance upstream reads typo key |
| E5 | **P2** | `CONTROL_PLANE_REDIS_URL` required in prod but absent from root example | `packages/config` production profile |
| E6 | **P3** | `PROVISION_POLL_MS` in compose not wired to worker (hardcoded 1500ms) | `worker.ts` vs `infra/prod/docker-compose.yml` |
| E7 | **P3** | Prod post-boot: `CHATWOOT_API_ACCESS_TOKEN` empty until Chatwoot boots | `docs/env-audit.md` |
| E8 | **P3** | `prod-scale-smoke.sh` references `BACKUP_S3_*` but compose uses `BACKUP_B2_*` | Script vs `infra/prod/.env.example` |

## 2.3 Secret exposure risks

- Tenant `.env` files contain JWT, DB passwords (encrypted deployment secrets), written `0o600` under `TENANT_ENV_ROOT` — **filesystem backup/ACL critical**
- Platform secrets use `__MUST_OVERRIDE__` placeholders in examples — good
- Dashboard BFF holds `PLATFORM_API_SECRET` server-side only — good
- Worker + API share `WORKER_SECRET` for `/internal/*` — single bearer, no rotation story documented

---

# PHASE 3 — DATABASE AUDIT

## 3.1 Postgres (control plane)

**Schema:** `packages/db/src/schema.ts`  
**Migrations:** `packages/db/drizzle/0000`–`0054`  
**Runner:** `pnpm db:migrate`

| Table | FK / cascade | Indexes | Risk |
|-------|--------------|---------|------|
| `tenants` | `owner_id` → owners **RESTRICT** | Unique `slug`, `organization_number` | **Missing index on `owner_id`** |
| `organizations` | `tenant_id` → tenants **CASCADE** | Unique global `slug`, `subdomain` | **Global slug uniqueness** blocks cross-tenant same slug; **missing `tenant_id` index** |
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
| `stockix_{safe}_finance` | Legacy compat — **may be orphaned** (provisioner comment) |

**Isolation:** Strong at DB name level on shared instance. **Blast radius:** one MySQL for all tenants.

**Deprovision gate:** Postgres rows not deleted unless `mysqlDbs && mongoDb && redisKeys` all true (`provisioner.ts:616-626`).

## 3.3 MongoDB (`{slug}_pos`)

- URL: `mongodb://stockix-mongo:27017/{slug}_pos?replicaSet=rs0`
- Raw slug in DB name (API validates `[a-z0-9-]+`)
- Deprovision: `dropDatabase` via `mongosh` in shared container
- POS schema migrations: **manual** `npm run migrate:schema` — **not in worker provision path**

## 3.4 Redis

| Instance | Purpose | Isolation |
|----------|---------|-----------|
| `control-plane-redis` | API rate limit + BullMQ (license expiry, invite mail) | Global queues |
| `stockix-redis` | All tenant Finance + POS BullMQ/Agenda | `REDIS_KEY_PREFIX=tenant:{slug}:` |

**Risk:** No AUTH on shared Redis; 128MB maxmemory + `allkeys-lru` — cross-tenant eviction under load.

## 3.5 Orphan / leakage scenarios

| Scenario | Possible? | Mitigation |
|----------|-----------|------------|
| MySQL DB without Postgres tenant | Yes (failed rollback) | `audit-orphan-dbs.ts`, M2 runbook |
| Postgres tenant without MySQL | Yes (failed provision early) | Retry provision |
| Redis keys after delete | Blocked if flush fails | Deprovision throws before PG delete |
| PMS data in platform Postgres | App-layer scoping only | Not isolated DB per tenant |

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

## 4.3 Critical lifecycle defects

| ID | Severity | Issue |
|----|----------|-------|
| L1 | **P0** | `scrubTenantRuntimeArtifacts()` runs **sync Docker in API** on POST `/tenants` slug recovery (`tenants.ts:1002,1026`) |
| L2 | **P1** | Rollback `deprovisionTenantDatabases` is **best-effort** — partial MySQL/Mongo/Redis cleanup without gate |
| L3 | **P1** | `cancel-check` looks for `cancel_requested_by_user` but **nothing sets that string** — dead path; cancel relies on status→`dead` |
| L4 | **P2** | Correlation routes (`provision-stream`, `provision-status`, `provision-stop`) **lack tenant ownership check** |
| L5 | **P2** | Dashboard removes tenant from UI on 202 before worker finishes |
| L6 | **P2** | Failed tenant + user delete: deprovision queued (good) but UI may show inconsistent state until worker runs |

## 4.4 Idempotency & retry

- HTTP idempotency: `POST/PATCH/DELETE` on `/owners` and `/tenants` only (`middleware/idempotency.ts`)
- Provision jobs: **no auto-retry** on failure for `tenant.provision` (`worker.ts:912-918`)
- Deprovision: up to 5 attempts via job table
- Journal enables **resume** after worker crash — strong point

---

# PHASE 5 — WORKER AUDIT

## 5.1 Job processing model

- Single worker process, sequential loop, poll every **1500ms** (hardcoded)
- Claim: `POST /internal/jobs/claim` with stale-lease reclaim (~10 min)
- Heartbeat: 30s → updates `claimedAt`
- Execution timeout: default **45 minutes**
- Fail report: API `/internal/jobs/:id/fail` or **DB fallback** if API unreachable

## 5.2 Locks

```typescript
// provision-lock.ts — session advisory lock
SELECT pg_advisory_lock(hash(tenantId))
```

**Risk (P1):** Uses pooled `postgres.js` connection — lock acquire/release may occur on **different connections**, weakening serialization.

**Used for:** deprovision, compose steps when tenantId known  
**Not used for:** initial `runProvisionJob` entry, `add_module`, `organization.provision`

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
| Duplicate execution | Single worker mitigates; multi-worker needs advisory lock fix | Medium |

---

# PHASE 6 — DOCKER AUDIT

## 6.1 Stack inventory

| Stack | File | Restart | Healthchecks |
|-------|------|---------|--------------|
| Shared | `infra/shared/docker-compose.yml` | unless-stopped | mysql, mongo, redis ✓ |
| Prod platform | `infra/prod/docker-compose.yml` | unless-stopped | Most ✓; **api-bullmq ✗**, **db-backup ✗** |
| Tenant Finance | `infra/tenant-stack/docker-compose.yml` | unless-stopped | server ✓; migration one-shot |
| POS | `infra/pos-tenant-stack/docker-compose.yml` | unless-stopped | backend ✓; **workers stub always-pass** |
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
| RBAC | Role **rank** middleware in production | `middleware/rbac.ts` |

## 7.2 Threat model (STRIDE summary)

| Threat | Exposure | Mitigation status |
|--------|----------|-------------------|
| Cross-tenant data access | Tenant scope on `:tenantId` routes | **Partial** — correlation UUID routes gap |
| Privilege escalation | Custom permissions not loaded in prod RBAC | **Gap** — `actorPermissions` empty |
| Worker secret compromise | Full job claim/complete | Rotate secret; network isolate |
| Redis key enumeration | No AUTH on shared Redis | **Weak** — prefix only |
| Docker socket abuse | socket-proxy filtered POST | db-backup mounts raw socket |
| SSRF via proxies | POS/PMS/Finance proxy routes | Rank-gated; review URL construction |
| Tenant file path traversal | `TENANT_ENV_ROOT` slug validated | Low if slug regex enforced |

## 7.3 Security findings

| ID | Severity | Finding |
|----|----------|---------|
| S1 | **P0** | Sync Docker scrub in API request path (DoS / stall) |
| S2 | **P1** | Provision correlation endpoints without owner scope |
| S3 | **P1** | Shared Redis without authentication |
| S4 | **P2** | Production RBAC ignores fine-grained permission matrix |
| S5 | **P2** | PMS uses platform Postgres — cross-tenant risk if app bug |
| S6 | **P3** | Traefik dashboard `--api.insecure` on localhost:8080 |
| S7 | **P3** | Dev defaults for WORKER_SECRET / license signing in non-prod only |

---

# PHASE 8 — API AUDIT

## 8.1 Route registrars (control plane)

All mounted via `register-control-plane-routes.ts` — see CLAUDE.md route map.

## 8.2 Blocking operations in request path (must be zero in prod)

| Route | Operation | Duration risk | File |
|-------|-----------|---------------|------|
| POST `/tenants` | `scrubTenantRuntimeArtifacts` — docker compose down, volume rm | **Minutes** | `tenants.ts:1002,1026` |
| GET `/tenants/provision-status/:id` | `docker inspect`, compose port | Seconds | `readiness-engine.ts` |
| DELETE `/tenants/:id` | DB only + enqueue | **Fixed** — async 202 | `tenants.ts:762+` |

## 8.3 Idempotency & timeouts

- Idempotency middleware: `/owners`, `/tenants` mutations only
- Dashboard `apiFetch`: 3s dev / 10s prod default; lifecycle DELETE uses 30s
- API global rate limit: Redis-backed in prod (required `CONTROL_PLANE_REDIS_URL`)

## 8.4 API findings

| ID | Severity | Finding |
|----|----------|---------|
| A1 | **P0** | Blocking Docker on POST `/tenants` |
| A2 | **P2** | Readiness polls invoke Docker CLI |
| A3 | **P2** | Limited HTTP idempotency scope |
| A4 | **P3** | Transient DB → 503 handler good (`create-control-plane-app.ts`) |

---

# PHASE 9 — SSE / STREAMING AUDIT

## 9.1 Streams

| Stream | API | BFF | Client |
|--------|-----|-----|--------|
| Notifications | Hono `streamSSE` + Redis pub/sub | `proxyControlPlaneEventStream` | EventSource + 5s reconnect |
| Provision progress | Hono `streamSSE` + in-memory bus | Direct body proxy (pump added) | EventSource |

## 9.2 Findings (see also `docs/investigation-report.md`)

| ID | Severity | Finding |
|----|----------|---------|
| SS1 | **P0** | API restart → ECONNRESET → dashboard **500** (observed); pump proxy mitigates if deployed |
| SS2 | **P1** | `void emitIfNew()` — unhandled `writeSSE` rejection on disconnect |
| SS3 | **P1** | In-memory provision bus — no multi-replica SSE |
| SS4 | **P2** | Provision stream lacks `req.signal` abort listener on API |
| SS5 | **P2** | Dev `node --watch` restarts API — drops all SSE |
| SS6 | **P3** | Redis pub/sub cleanup fixed (idempotent disconnect) |

**Requirement:** Streams must not crash API — **API process does not crash** on ECONNRESET (logs `unhandled_rejection` only). Dashboard may return 500 to client.

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
- Deprovision: **strong gate** before Postgres delete (user path)
- Rollback: **weak** — per-store errors logged, not gated

## 10.3 Partial failure states

| State | User deprovision | Provision rollback |
|-------|------------------|-------------------|
| Docker up, PG deleted | Blocked by gate | N/A |
| Docker up, PG exists | Possible if compose down failed silently | Common |
| MySQL exists, PG deleted | Blocked | Possible |
| Mongo exists, PG deleted | Blocked | Possible |
| Redis keys remain | Blocked | Possible |
| Traefik route remains | PG may still delete | Common |

## 10.4 Recent fix

- Finance `OrganizationBuild.processor` — removed invalid `Scope.REQUEST` (requires `stockix-server:local` image rebuild)

---

# PHASE 11 — SCALABILITY AUDIT

## 11.1 Tenant count projections

Assumptions: finance-only tenant ≈512MB RAM limit + shared DB connections; single EC2-class host.

| Tenants | Feasibility | First bottleneck |
|---------|-------------|------------------|
| **100** | Marginal on 64GB+ host | MySQL `max_connections=500`, shared Redis 128MB |
| **500** | **Not viable** current design | RAM + connections + worker serial queue |
| **1,000** | Requires redesign | Container count, Traefik YAML, Docker daemon |
| **5,000** | Out of scope | Multi-region, sharded data plane, worker pool |

## 11.2 Single points of failure

- Single shared MySQL, Mongo, Redis
- Single infra-worker (serial jobs)
- Host-port Traefik upstream model
- Single Postgres (backed up, but not HA in compose)
- `MAX_TENANT_PORT` ~4999 caps published ports

## 11.3 API scaling

- `deploy.replicas: 2` in compose **ignored** without Swarm (`OPERATIONS.md`)
- SSE/provision bus breaks with multiple API instances unless replaced with Redis pub/sub

---

# PHASE 12 — OBSERVABILITY AUDIT

## 12.1 Current state

| Signal | Status |
|--------|--------|
| Structured JSON logs | API, worker ✓ |
| HTTP request logs | requestId, latency ✓ |
| Sentry | API, worker, dashboard optional |
| Metrics emitter | `METRICS_ENDPOINT` — **no collector in repo** |
| Audit log | Postgres `admin_audit_log` ✓ |
| Provision trace | `tenant_provision_events` ✓ |
| Health | `/health`, `/ready`, worker `:9090/health` |

## 12.2 Gaps

- No Prometheus/Grafana/Loki/OpenTelemetry deployment
- Finance tenant logs: Winston plain text
- `/ready` does not check shared MySQL/Mongo/worker
- Backup failures silent without log monitoring
- No SLOs/alerting wired except optional `ALERT_WEBHOOK_URL` in cron script

## 12.3 Recommendations

| Tool | Use |
|------|-----|
| **Prometheus** | API latency, worker job duration, queue depth |
| **Grafana** | Dashboards per tenant count / host RAM |
| **Loki** | Centralize JSON logs from all compose services |
| **OpenTelemetry** | Trace BFF → API → worker → docker |
| **Sentry** | Enable in prod for all three control-plane apps |
| **PagerDuty/Opsgenie** | Wire `ALERT_WEBHOOK_URL` + backup cron failures |

---

# PHASE 13 — DISASTER RECOVERY AUDIT

## 13.1 Backup coverage

| Asset | Backed up? | Script | RPO |
|-------|------------|--------|-----|
| Control-plane Postgres | ✓ | `infra/prod/backup/backup.sh` | ~12h (2x daily) |
| Shared MySQL (all tenant DBs) | ✓ | `backup-shared.sh` | ~12h |
| Shared Mongo | ✓ (oplog archive) | `backup-shared.sh` | ~12h |
| Tenant Redis | ✗ | — | — |
| Control-plane Redis | ✗ (no persistence) | — | — |
| Traefik dynamic YAML | ✗ | — | — |
| Tenant `.env` dirs | ✗ | — | — |
| S3 tenant attachments | ✗ | Separate bucket | — |

## 13.2 Restore documentation

- Postgres: full runbook (`OPERATIONS.md`)
- MySQL: M4 runbook
- Mongo: sketch only (`backup/README.md`)
- Tenant recovery: M1–M5 matrices in `OPERATIONS.md`

## 13.3 Data-loss risks

- **RPO ~12 hours** — no WAL continuous archiving
- Redis queue/state loss on restart — in-flight jobs may stall
- Partial rollback leaves orphan MySQL/Mongo — manual M2 cleanup

---

# PHASE 14 — PRODUCTION READINESS SCORES

| Category | Score | Justification |
|----------|-------|---------------|
| **Architecture** | **6.5/10** | Clear control vs data plane split; shared infra and host-port routing limit growth |
| **Security** | **6.0/10** | Auth stack solid; Redis isolation, RBAC permission wiring, correlation route gaps |
| **Scalability** | **4.0/10** | Single worker + shared DBs + per-tenant containers hit wall <500 tenants |
| **Reliability** | **5.5/10** | Job journal + deprovision gate good; rollback/SSE/API-watch fragile |
| **Maintainability** | **7.0/10** | Monorepo, typed config, runbooks, route checks in CI |
| **Operations** | **5.0/10** | Backups exist; monitoring/alerting/DR gaps for Redis, files, multi-AZ |
| **Database design** | **6.5/10** | Postgres migrations mature; missing indexes; global org slug constraint |
| **Provisioning system** | **6.0/10** | Worker async model correct; API scrub + org build bug class + partial rollback |

**Weighted overall: 5.8/10**

---

# PHASE 15 — CRITICAL FINDINGS

## P0 — Critical (block production at scale)

| ID | Issue | Business impact | Fix direction |
|----|-------|-----------------|---------------|
| P0-1 | Shared MySQL `max_connections=500` + single instance | Platform-wide outage at ~50–100 active tenants | Raise limits, connection pooling proxy, or shard MySQL |
| P0-2 | Shared tenant Redis 128MB, no AUTH | Queue loss, cross-tenant key risk, eviction | Dedicated Redis per N tenants or AUTH + memory policy |
| P0-3 | Single serial infra-worker | Provisioning/deprovision queue backlog | Horizontal worker pool + fix advisory locks |
| P0-4 | Sync Docker in API `POST /tenants` | API stalls/outages during onboarding | Move scrub to worker job only |
| P0-5 | SSE/dashboard 500 on API restart | Operator UI appears broken | Harden BFF proxy; stable API process in prod |

## P1 — High priority

| ID | Issue | Fix direction |
|----|-------|---------------|
| P1-1 | `pg_advisory_lock` with connection pool | Dedicated connection or serial worker per tenant |
| P1-2 | Rollback partial cleanup without gate | Align rollback with deprovision gate or ops alerts |
| P1-3 | Provision correlation routes lack tenant scope | Bind correlationId → tenantId + owner check |
| P1-4 | `actorPermissions` not loaded in production RBAC | Register permission middleware or load perms in rank middleware |
| P1-5 | No Redis / Traefik / tenant-env backup | Extend backup scripts + runbooks |
| P1-6 | API `deploy.replicas: 2` ineffective | Document `--scale` or remove misleading config |
| P1-7 | In-memory provision bus (no multi-API SSE) | Redis pub/sub for provision events |
| P1-8 | PMS on shared Postgres (app-layer isolation only) | Document threat model or separate DB |
| P1-9 | `deprovisionTenant` swallows compose-down failure | Fail job if finance stack still running |
| P1-10 | WORKER_SECRET dev default | Fail fast in prod if unset |

## P2 — Medium priority

| ID | Issue |
|----|-------|
| P2-1 | Missing Postgres indexes (`tenants.owner_id`, `organizations.tenant_id`) |
| P2-2 | Global unique `organizations.slug` |
| P2-3 | Orphan `stockix_{safe}_finance` MySQL DB |
| P2-4 | POS Mongo migrations not in provision worker |
| P2-5 | Dashboard optimistic delete UI on 202 |
| P2-6 | Readiness checks invoke Docker on API hot path |
| P2-7 | Limited HTTP idempotency scope |
| P2-8 | `cancel-check` dead string `cancel_requested_by_user` |
| P2-9 | api-bullmq / db-backup missing healthchecks |
| P2-10 | POS worker stub healthchecks |
| P2-11 | Metrics emitter with no backend |
| P2-12 | Env example drift (Mongo URL, prefix naming) |

## P3 — Improvements

| ID | Issue |
|----|-------|
| P3-1 | Wire `PROVISION_POLL_MS` to worker |
| P3-2 | Tenant delete completion notification |
| P3-3 | Structured logging in Finance tenant server |
| P3-4 | Sentry in tenant stack images |
| P3-5 | Fix `prod-scale-smoke.sh` BACKUP env var names |
| P3-6 | Document Traefik dashboard exposure |
| P3-7 | Quarterly DR drill automation |

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

- [ ] All **P0** items resolved or explicitly accepted with compensating controls
- [ ] Load test at **2× target tenant count** on staging hardware profile
- [ ] DR drill: Postgres + MySQL restore verified within RTO target
- [ ] Security review: correlation routes + Redis + internal API
- [ ] `pnpm docker:prebuild` in CI for tenant images
- [ ] API runs **without** file watcher; SSE soak test 24h
- [ ] Worker horizontal scale test with advisory lock fix
- [ ] Observability: logs centralized, alerts on backup failure + worker dead jobs

---

*End of production readiness audit. No source code was modified.*
