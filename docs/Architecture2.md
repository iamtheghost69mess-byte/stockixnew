# Stockix Platform — Architecture Specification & Production Validation

**Document:** `Architecture2.md`  
**Audience:** Staff engineers, SRE, security review  
**Scope:** Multi-tenant Docker provisioning, shared infrastructure migration, control plane, edge routing  
**Evidence base:** Repository audit (`infra/`, `apps/api`, `infra/worker-service`, tenant compose stacks) — June 2026  
**Status:** P0 infrastructure repairs applied (2026-06-04) — see Repair Log; remaining blockers in §17 (MySQL naming, staging verification)

## Repair Log

| Repair | Status | Date |
|--------|--------|------|
| REPAIR 0 — MongoDB isolation fix | DONE | 2026-06-04 |
| REPAIR 1 — Hostname aliases | DONE | 2026-06-04 |
| REPAIR 2 — Traefik volume alignment | DONE | 2026-06-04 |
| REPAIR 3 — POS provision fix | DONE | 2026-06-04 |

---

## 1. Executive Summary

### What this system is

Stockix is a **multi-tenant SaaS control plane** that provisions isolated **tenant runtimes** (Finance/NestJS, POS/Express+Mongo, optional PMS/Chat) on Docker hosts. A **Hono API** and **Next.js dashboard** manage owners, tenants, licenses, and jobs. An **infra worker** claims Postgres-backed lifecycle jobs, provisions shared databases, writes per-tenant `.env` files, runs Docker Compose, and publishes **Traefik v3** dynamic routes.

### What changed (shared infrastructure architecture)

| Dimension | Legacy (per-tenant) | Current (shared) |
|-----------|---------------------|------------------|
| MySQL | Container per tenant | Single `stockix-mysql` on `stockix-shared`; logical DBs per slug |
| MongoDB | `pos-mongo` per POS tenant | Single `stockix-mongo` with replica set `rs0`; DB `{slug}_pos` |
| Redis | Per-tenant + control plane mixed | **Two instances:** `control-plane-redis` (internal) + `stockix-redis` (tenant runtime) |
| Nginx / webapp | Per-tenant nginx + webapp | **Removed** from tenant stack; Traefik → Finance `server` directly (shared Nginx gateway **planned**, not built) |
| Finance containers | 6 per tenant | **1** (`server` + one-shot `database_migration`) |
| POS containers | 7 per tenant | **4** (backend, 2 workers, frontend) |

**Container reduction example:** Accounting-only tenant: 6 → 1 (~83%). Accounting + POS: ~17 → 5.

### Why this architecture exists

- **Operational cost:** Fewer containers per tenant on a single host.
- **Resource efficiency:** Shared connection pools and storage volumes.
- **Correctness fix:** Per-tenant Mongo URL generation (`tenant-env.ts`) replaces platform-wide `MONGODB_DATABASE_URL` that caused **cross-tenant POS data sharing** in the `"stockix"` database.
- **Separation of concerns:** Control-plane Redis (license mail, BullMQ) is isolated from tenant Redis (sessions, POS/F finance queues).

---

## 2. High-Level Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │           Cloudflare DNS / WAF          │
                         │  *.stockix.cloud, api., app., *-pos.*   │
                         └────────────────────┬────────────────────┘
                                              │ HTTPS
                         ┌────────────────────▼────────────────────┐
                         │  Traefik v3 (stockix_public :443)       │
                         │  • Docker provider: api, dashboard      │
                         │  • File provider: tenant-{slug}.yml     │
                         └─┬──────────────┬──────────────┬─────────┘
                           │              │              │
              api.stockix  │   app.stockix│  {slug}.stockix
                           ▼              ▼              ▼
                    ┌──────────┐   ┌───────────┐   host.docker.internal:{port}
                    │ api ×2   │   │ dashboard │        or internal IP:3000
                    │ :4000    │   │ :3000     │              │
                    └────┬─────┘   └─────┬─────┘              ▼
                         │               │            ┌─────────────────┐
                         └───────┬───────┘            │ Finance server  │
                                 │                    │ (per tenant)    │
                         ┌───────▼────────┐           └────────┬────────┘
                         │ stockix_internal│                    │
                         │ postgres        │                    │
                         │ control-redis   │                    │
                         │ api-bullmq      │                    │
                         │ infra-worker    │◄─── Docker socket ─┘
                         └───────┬────────┘      (provision compose)
                                 │
         ┌───────────────────────┼───────────────────────┐
         │         stockix-shared (172.30.0.0/24)       │
         │  stockix-mysql │ stockix-mongo (rs0) │     │
         │  stockix-redis │ tenant app containers │     │
         └──────────────────────────────────────────────┘
```

**Compose projects:**

| Project | File | Purpose |
|---------|------|---------|
| `stockix-shared` | `infra/shared/docker-compose.yml` | MySQL, Mongo, tenant Redis |
| `stockix` | `infra/prod/docker-compose.yml` | Control plane + Traefik |
| `stockix-{slug}` | `infra/tenant-stack/docker-compose.yml` | Finance server |
| `stockix-pos-{slug}` | `infra/pos-tenant-stack/docker-compose.yml` | POS stack |

---

## 3. Request Flow (End-to-End)

### 3.1 Operator / tenant user (Finance UI)

```
Browser
  → Cloudflare (TLS, optional proxy)
  → Traefik websecure
      Rule: Host(`{slug}.stockix.cloud`)
      Service: http://{TRAEFIK_TENANT_UPSTREAM_HOST}:{allocatedPort}
               (default host.docker.internal, port from tenant_port_seq)
  → Finance NestJS server :3000 (/api/*, static if embedded)
  → shared-mysql / shared-mongo / tenant-redis (intended hostnames on stockix-shared)
```

**Note:** Legacy path expected `{composeProject}-nginx-1:80`; nginx was removed from tenant-stack. Traefik `resolveNginxDirectUrl()` falls back to host port.

### 3.2 Control plane API

```
Browser → app.stockix.cloud → dashboard BFF (Next.js)
       → api.stockix.cloud → Hono API :4000
       → postgres (stockix_platform)
       → control-plane-redis (optional BullMQ on api-bullmq replica)
```

Auth order (`create-control-plane-app.ts`): `/auth/*`, `/webhooks/*` **before** CORS; then global middleware, RBAC, domain routes.

### 3.3 POS

```
Browser → {slug}-pos.stockix.cloud → pos-frontend (host-bound port)
API     → {slug}-pos-api.stockix.cloud → pos-backend :8010
POS workers → MONGODB_URI, REDIS_URL (must come from tenant env — see risks)
Sync      → bigcapital_sync BullMQ → Finance POST /api/internal/pos/*
```

### 3.4 Provisioning (async)

```
POST /tenants → insert tenant + tenantLifecycleJobs (tenant.provision)
infra-worker poll → POST /internal/jobs/claim (Bearer WORKER_SECRET)
  → executeProvisionRuntime → provisionTenantDatabases → compose → Traefik YAML
Dashboard SSE → GET /tenants/provision-stream/:correlationId
```

---

## 4. Control Plane Architecture

### 4.1 Hono API (`apps/api`)

| Attribute | Value |
|-----------|-------|
| Entry | `apps/api/src/index.ts` → `createControlPlaneApp()` |
| Port | `4000` (prod); `api-bullmq` on `4001` with `RUN_BULLMQ_CONSUMERS=true` |
| Replicas | `deploy.replicas: 2` for `api` in `infra/prod/docker-compose.yml` |
| Platform DB | PostgreSQL `stockix_platform` via Drizzle (`packages/db`) |

**Route registrars** (`register-control-plane-routes.ts`):

| Registrar | Prefix |
|-----------|--------|
| `registerAuthRoutes` | `/auth/*` (pre-CORS) |
| `registerWebhooks` | `/webhooks/*` (pre-CORS) |
| `registerPublicRoutes` | `/health`, `/ready`, `/public/*` |
| `registerInternalRoutes` | `/internal/jobs/*`, `/internal/organizations/*` |
| `registerTenantRoutes` | `/tenants/*`, `/search` |
| `registerProxyRoutes` | `/pos/*`, `/pms/*` |
| Others | owners, admin, licenses, notifications, tenant-modules |

**Production guard:** Missing `CONTROL_PLANE_REDIS_URL` when `NODE_ENV=production` → hard exit.

### 4.2 Dashboard (`apps/dashboard`)

- Next.js 16, port `3000`, Traefik `app.${ROOT_DOMAIN}`
- BFF pattern: `app/api/**/route.ts` → Hono with session + `PLATFORM_API_SECRET`
- No direct `@repo/db` access (lint boundary)

### 4.3 Infra worker (`infra/worker-service`)

| Attribute | Value |
|-----------|-------|
| Image | `stockix-infra-worker` |
| Health | `:9090/health` |
| Docker | `DOCKER_HOST=tcp://socket-proxy:2375` (filtered socket proxy) |
| Job source | Postgres `tenantLifecycleJobs` — **not** BullMQ |

**Job types** (`apps/api/src/services/tenant-jobs.ts`):

| Type | Handler |
|------|---------|
| `tenant.provision` | `executeProvisionRuntime` |
| `tenant.deprovision` | `deprovisionTenant` |
| `organization.provision` | `org-provision-runtime` |
| `add_module` / `remove_module` | module runtime |
| `tenant.lifecycle` | compose start/stop only |

**Polling:** `POST ${API_HOST}/internal/jobs/claim` with `WORKER_SECRET`; heartbeat, cancel-check, complete/fail.

### 4.4 Control-plane Redis / BullMQ

| Queue | Consumer | Purpose |
|-------|----------|---------|
| `license-expiry-milestones` | `api-bullmq` only | License expiry notifications |
| `owner-invite-mail` | `api-bullmq` only | Owner invite email |

**Never** enable `RUN_BULLMQ_CONSUMERS` on scaled `api` replicas (duplicate work).

---

## 5. Shared Infrastructure Layer

**File:** `infra/shared/docker-compose.yml`  
**Start:** `docker compose -f infra/shared/docker-compose.yml --env-file infra/prod/.env -p stockix-shared up -d`

### 5.1 MySQL 8 (`stockix-mysql`)

| Setting | Value |
|---------|-------|
| Network | `stockix-shared` |
| Compose hostname | `stockix-mysql` |
| Root auth | `SHARED_MYSQL_ROOT_PASSWORD` |
| Limits | 512m RAM, slow query log >2s |

**Provisioner** (`provisioner.ts` → `provisionTenantDatabases`):

```sql
CREATE DATABASE stockix_{safe}_finance;
CREATE DATABASE stockix_{safe}_system;
CREATE USER tenant_{safe}@'%';
GRANT ALL ON stockix_{safe}_finance.*, stockix_{safe}_system.*;
```

`safe = slugToMysqlSafe(slug)` — lowercase, non-alphanumeric → `_`, **max 28 chars**.

### 5.2 MongoDB 6 (`stockix-mongo` + `stockix-mongo-rs-init`)

| Setting | Value |
|---------|-------|
| Command | `mongod --replSet rs0` |
| Init | One-shot `rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'stockix-mongo:27017' }] })` |
| Per-tenant DB | `{slug}_pos` (raw slug in connection string) |
| Provision | TCP reachability only; DB created on first write |
| Connection string | `mongodb://{host}:27017/{slug}_pos?replicaSet=rs0&directConnection=true` |

**Isolation fix applied in `tenant-env.ts` — per-tenant DB enforced.** `buildTenantEnvMap` sets `MONGODB_URI` / `MONGODB_DATABASE_URL` to `mongodb://{host}:27017/{slug}_pos?replicaSet=rs0&directConnection=true` (raw slug; default host `stockix-mongo`).

### 5.3 Tenant Redis (`stockix-redis`)

| Setting | Value |
|---------|-------|
| Purpose | BullMQ (POS), documented Finance session/agenda prefixes |
| Memory | 128mb, `allkeys-lru` |
| Key convention (documented) | `tenant:{slug}:queue:*`, `agenda:*`, `session:*` |

**Separate from** `control-plane-redis` on `stockix_internal`.

### 5.4 Shared Nginx gateway

**Status: NOT IMPLEMENTED**

- Referenced in `infra/tenant-stack/docker-compose.yml` comments (`infra/shared/nginx/`)
- Legacy per-tenant template: `services/stockix-finance/docker/nginx/sites/server.template`
- Traefik still contains nginx container discovery logic (`traefik-config.ts` → `resolveNginxDirectUrl`)

---

## 6. Tenant Isolation Model

### 6.1 MySQL isolation

| Layer | Mechanism | Identifier |
|-------|-----------|------------|
| Provisioner | Dedicated DBs + user grants | `stockix_{safe}_finance`, `stockix_{safe}_system`, `tenant_{safe}` |
| Finance runtime | Per-organization DB name | `{TENANT_DB_NAME_PREFIX}{organizationId}` e.g. `stockix_acme_1` |
| System metadata | Single system DB per slug | `SYSTEM_DB_NAME` = `stockix_{slug}_system` |

**Validation finding — naming mismatch (HIGH):**

1. **Provisioner** uses `slugToMysqlSafe` (28-char cap); **`buildTenantEnvMap`** uses raw `slug` for `SYSTEM_DB_NAME`, `TENANT_DB_NAME_PREFIX`, and `tenant_*` user (no 28-char cap, different sanitization rules).
2. **`stockix_{slug}_finance`** is created at provision time; Finance **`TenantDBManager`** uses `stockix_{slug}_{organizationId}` — the `_finance` database may be **orphaned** unless explicitly used elsewhere.
3. **Compose hardcodes** `DB_HOST=shared-mysql` while shared service hostname is `stockix-mysql` — see §9.

### 6.2 MongoDB isolation

| Mechanism | Correct when |
|-----------|--------------|
| Separate database per slug `{slug}_pos` | `MONGODB_URI` / `MONGODB_DATABASE_URL` set from `buildTenantEnvMap` |
| Replica set `rs0` | Required by POS driver; single-node RS is valid for dev/small prod |
| `directConnection=true` | Bypasses multi-host discovery for single-node RS |

**Fix implemented:** Per-tenant `{slug}_pos` database enforced in `buildTenantEnvMap` / `buildTenantMongoUrl` (`tenant-env.ts`). Prior cross-tenant leakage from platform `MONGODB_DATABASE_URL` → shared `"stockix"` DB is closed.

**Validation finding — deprovision uses raw slug; provision MySQL uses `safe` slug** — special characters can diverge.

**Stale control-plane metadata (P1):** `tenant_deployments.mongoUrl` still written as `mongodb://mongo/stockix` in provision-runtime (~783, ~1201) — not updated to per-tenant URL.

### 6.3 Redis isolation

| Mechanism | Intended | Actual (audit) |
|-----------|----------|----------------|
| Key prefix `tenant:{slug}:` | Documented in `tenant-env.ts` | Written to tenant `.env` as `REDIS_KEY_PREFIX` |
| Finance compose | Pass prefix to server | **Not passed** — `tenant-stack` sets `REDIS_HOST` only |
| POS BullMQ | Prefix queue names | **`jobQueue.js` uses unprefixed names** (`bigcapital_sync`, etc.) — no `REDIS_KEY_PREFIX` in code |
| POS rate limits | `org:{id}:` keys | Different namespace than tenant slug |

**Conclusion:** Redis isolation is **documented but not fully enforced** in application code. Shared Redis DB `0` with unprefixed BullMQ queues is a **cross-tenant job collision risk** unless workers are strictly per-tenant process (they are per compose project, but queue names are global on the instance).

### 6.4 Network isolation

- Tenant apps on `stockix-shared` can reach shared DB ports for all tenants (MySQL user grants are the primary boundary).
- `stockix_internal` is `internal: true` — control plane only; worker connects tenant `server` to this network for bootstrap HTTP.

### 6.5 Postgres (control plane)

- PMS module uses **same** `stockix_platform` Postgres with tenant scoping in app layer — not isolated per-tenant DB.

---

## 7. Provisioning Lifecycle (Detailed)

**Entry:** `provisionTenant()` → `TenantProvisionService` → `executeProvisionRuntime()` (`provision-runtime.ts`)

### 7.1 Preconditions

- Module gating (`PROVISION_MODULE_GATING`)
- Required images (`stockix-server:local`, etc.)
- Advisory lock `withTenantProvisionAdvisoryLock` during compose (when `tenantId` present)
- **`assertNoConcurrentProvisionJob` imported but never called** — incomplete concurrent-job guard

### 7.2 Journal / resume

- Operations stored in `tenant_provision_events` (`phase: "journal"`)
- `loadProvisionJournalState` skips completed `operationKey`s
- Enables resume after worker crash (partial progress)

### 7.3 Step-by-step (Finance + modules)

| Step | operationKey | Action |
|------|--------------|--------|
| 0 | — | Insert/update `tenants`, `tenant_deployments`; allocate org number, port |
| 1 | — | `buildTenantEnvMap` + `writeTenantEnvFileAtomic` → `{TENANT_ENV_ROOT}/{slug}/.env` |
| 2 | `preflight.cleanup` | `compose down -v` stale project |
| 3 | `docker.data_step` | `provisionTenantDatabases(slug, password)` |
| 4 | `docker.migration_step` | `compose run --rm database_migration` |
| 5 | `docker.app_step` | `compose up -d server` |
| 6 | — | `docker network connect stockix_internal` to `{project}-server-1` |
| 7 | `tenant.health_check` | `GET /api/ping` on internal URL |
| 8 | `tenant.bootstrap_admin` | Register bootstrap admin |
| 9 | `tenant.fetch_org_settings` | Org/sub-org URLs |
| 10 | `tenant.sync_finance_license_before_build` | License sync |
| 11 | `tenant.build_organization` | Org build + COA |
| 12 | `tenant.complete_setup_wizard` | Conditional |
| 13 | `tenant.activate_warehouses` | Warehouse activation |
| 14 | `tenant.seed_pos_defaults` | Walk-in, deposit accounts |
| 15 | `edge.publish` | `writeTenantTraefikConfig` → `tenant-{slug}.yml` |
| 16 | `pos.stack.*` | `provisionPosStack` (if POS module) |
| 17 | `tenant.wire_pos_integration` | Bigcapital integration PUT |
| 18 | — | PMS / Chat (PMS errors non-fatal) |
| 19 | — | Mark `active` or `partial` |

### 7.4 Env generation (`buildTenantEnvMap`)

**Source:** `infra/worker-service/domain/provisioning/tenant-env.ts`

| Variable group | Key vars |
|--------------|----------|
| MySQL | `DB_HOST`, `SYSTEM_DB_*`, `TENANT_DB_NAME_PREFIX`, `TENANT_DB_NAME_PERFIX` (typo) |
| Mongo | `MONGODB_URI`, `MONGODB_DATABASE_URL` |
| Redis | `REDIS_HOST`, `REDIS_URL`, `REDIS_KEY_PREFIX`, `QUEUE_HOST` |
| Auth | `JWT_SECRET`, `INTERNAL_API_SECRET` |
| Branding | `REACT_APP_STOCKIX_*` |

**Hosts from env:** `SHARED_MYSQL_HOST` (default `shared-mysql`), `SHARED_MONGO_HOST` (`shared-mongo`), `TENANT_REDIS_HOST` (`tenant-redis`).

**Finance compose** uses `--env-file` via `ExecaDockerComposeRunner` (line 26).

### 7.5 POS provision gap

**RESOLVED (2026-06-04).** `provisionPosStack` (`module-stacks.ts`):

- `upServices`: `pos-backend`, `pos-platform-worker`, `pos-bigcapital-worker`, plus conditional `pos-frontend` (compose service name; app built from `pos-frontend2`). Removed `pos-mongo`, `pos-mongo-init`, `pos-redis`.
- `composeEnv` merges `readTenantEnvFile(slug)` from `{TENANT_ENV_ROOT}/{slug}/.env` with `process.env` and POS overrides.

**Note:** POS-only provision path may run before tenant `.env` is written — accounting+POS path is fully covered.

### 7.6 Networking join

- Tenant `server` joins `stockix-shared` (compose) + `stockix_public`
- Worker explicitly connects `server` to `stockix_internal` for bootstrap (iptables / NAT workaround on Linux)

---

## 8. Deprovisioning Lifecycle

**Entry:** `deprovisionTenant()` (`provisioner.ts` 222–274)

| Order | Action |
|-------|--------|
| 1 | Load tenant + deployment row |
| 2 | `docker compose down` (Finance stack) if `.env` exists |
| 3 | `deprovisionTenantDatabases` — DROP MySQL DBs/user; `docker exec` mongosh drop `{slug}_pos` |
| 4 | Traefik unpublish Finance + POS YAML |
| 5 | Delete PG: `tenant_provision_events`, `admin_audit_log`, `tenant_deployments`, `tenants` |
| 6 | `rm -rf {TENANT_ENV_ROOT}/{slug}/` |

### 8.1 Data cleanup risks

| Risk | Detail |
|------|--------|
| MySQL skip | If `SHARED_MYSQL_ROOT_PASSWORD` unset → MySQL cleanup **skipped**, PG rows still deleted |
| Mongo container name | Hard-coded `stockix-shared-shared-mongo-1` — breaks if project name differs |
| Org-level MySQL DBs | Finance creates `stockix_{slug}_{orgId}` — deprovision drops `_finance`/`_system` only; **org DBs may remain** |
| POS/PMS compose | Deprovision only runs Finance compose down — **POS/PMS stacks may be orphaned** |
| Redis keys | No flush of `tenant:{slug}:*` on deprovision |
| Rollback vs deprovision | `rollbackProvision` does **not** call `deprovisionTenantDatabases` |

---

## 9. Docker Architecture

### 9.1 Networks

| Network | Defined in | internal | Members (summary) |
|---------|------------|----------|-------------------|
| `stockix-shared` | `infra/shared` | no | mysql, mongo, redis, tenant apps, worker |
| `stockix_public` | `infra/prod` | no | traefik, api, dashboard, tenant server, pos frontend |
| `stockix_internal` | `infra/prod` | **yes** | postgres, control-redis, api, worker, tenant server (connected at provision) |
| `stockix_socket_proxy_network` | `infra/prod` | yes | socket-proxy, worker |

### 9.2 Service discovery — critical hostname gap

**RESOLVED (2026-06-04).** Network aliases added to `infra/shared/docker-compose.yml` covering both naming conventions:

| Service | Aliases on `stockix-shared` |
|---------|----------------------------|
| `stockix-mysql` | `shared-mysql`, `stockix-mysql` |
| `stockix-mongo` | `shared-mongo`, `stockix-mongo` |
| `stockix-redis` | `tenant-redis`, `stockix-redis` |

Tenant `.env` and worker defaults may use either `shared-*` / `tenant-redis` or `stockix-*` hostnames.

### 9.3 Removed per-tenant infra containers

Confirmed removed from `tenant-stack` and `pos-tenant-stack`: `mysql`, `mongo`, `redis`, `nginx`, `webapp`, `pos-mongo`, `pos-redis`.

### 9.4 Traefik dynamic config volume mismatch

**RESOLVED (2026-06-04).** Traefik and `infra-worker` now both bind-mount `${TRAEFIK_DYNAMIC_DIR}` (default `/opt/stockix/traefik-dynamic`). Named volume `stockix_traefik_dynamic` removed from `infra/prod/docker-compose.yml`.

---

## 10. Traefik + Routing Layer

### 10.1 Static configuration (`infra/prod/docker-compose.yml`)

- Image `traefik:v3.4`
- Entrypoints: `web` (:80 → redirect HTTPS), `websecure` (:443)
- ACME DNS-01 Cloudflare (`certificatesresolvers.cloudflare`)
- Docker provider on `stockix_public`, `exposedbydefault=false`
- File provider: `/etc/traefik/dynamic`, `watch=true`

### 10.2 Platform routes (Docker labels)

| Host | Service | Port |
|------|---------|------|
| `api.${ROOT_DOMAIN}` | api | 4000 |
| `app.${ROOT_DOMAIN}` | dashboard | 3000 |

### 10.3 Tenant routes (worker file provider)

**Finance** — `tenant-{slug}.yml`:

```yaml
http:
  routers:
    tenant-{slug}:
      rule: "Host(`{slug}.{domain}`)"
      entryPoints: [websecure]
      tls:
        certResolver: cloudflare
      service: tenant-{slug}
  services:
    tenant-{slug}:
      loadBalancer:
        servers:
          - url: "http://{upstreamUrl}"
```

**POS** — `tenant-pos-{slug}.yml`:

| Router | Host |
|--------|------|
| Frontend | `{slug}-pos.{domain}` |
| API | `{slug}-pos-api.{domain}` |

Upstream: `http://{TRAEFIK_TENANT_UPSTREAM_HOST}:{port}` (default `host.docker.internal`).

### 10.4 TLS

Per-router `certResolver: cloudflare` — certificates issued per hostname, not a single wildcard cert object in Traefik config (Cloudflare token scope still covers `*.stockix.cloud`).

---

## 11. Database Architecture

### 11.1 MySQL — schema isolation strategy

| Database | Purpose |
|----------|---------|
| `stockix_{safe}_system` | System tables for slug (migrations via `database_migration`) |
| `stockix_{safe}_finance` | Provisioned; Finance may use `stockix_{slug}_{orgId}` instead |
| `stockix_{slug}_{organizationId}` | Per-org tenant data (Finance `TenantDBManager`) |

**Migrations:** One-shot `database_migration` container per provision; journal key `docker.migration_step`.

**Shared contention:** Single InnoDB instance — connection limit 500, buffer pool 256M — all tenants compete.

### 11.2 MongoDB — replica set & POS data

| Topic | Detail |
|-------|--------|
| rs0 | Required in connection string for drivers that enforce RS |
| Single member | Valid for production at small scale; no automatic failover |
| `directConnection=true` | Connects to primary without SRV topology surprises |
| Upgrade path | Add members to RS + update init script |

### 11.3 Redis — queues & sessions

| System | Redis instance | Queue examples |
|--------|----------------|----------------|
| Control plane | `control-plane-redis` | `license-expiry-milestones`, `owner-invite-mail` |
| Tenant runtime | `stockix-redis` | POS: `bigcapital_sync`, `provisioning`, `email`, … |
| Finance | Same tenant Redis | NestJS BullMQ (mail/inventory) — prefix not in compose |

**Session storage:** Documented as `tenant:{slug}:session:*` — verify Finance session store implementation uses prefix before production.

---

## 12. Sync & Background Jobs

### 12.1 POS sync workers

| Worker | File | Queue / role |
|--------|------|--------------|
| `pos-platform-worker` | `workers/platformWorker.js` | All `QUEUE_NAMES` |
| `pos-bigcapital-worker` | `workers/bigcapitalSyncWorker.js` | `bigcapital_sync` |

**Job names (Bigcapital):** `sync_paid_order`, `void_receipt`, `partial_refund`, `grn_bill`, `inventory_adjustment`, `stock_take_variance`

### 12.2 Finance ↔ POS integration flow

```
Provision: wire-pos-bigcapital-integration.ts
  → PUT /api/platform/v1/organizations/:orgId/integration/bigcapital
Runtime: bigcapitalSyncProcessor.js
  → POST /api/internal/pos/receipts (x-internal-secret)
License: sync-finance-license.ts, finance-license.client.ts
```

### 12.3 Job queue lifecycle (control plane)

```
tenantLifecycleJobs: pending → running (worker claim) → completed | failed
Heartbeat + cancel-check during long provision
Stuck job reconcilers on API process (Postgres, not BullMQ)
```

---

## 13. Consistency Risks

| Risk | Severity | Description |
|------|----------|-------------|
| Cross-tenant Mongo | **Critical (fixed in env builder)** | Old platform `MONGODB_DATABASE_URL`; ensure POS receives per-tenant URI |
| Cross-tenant Redis BullMQ | **High** | Unprefixed queue names on shared Redis |
| MySQL slug sanitization | **High** | `safe` vs raw `slug` between provisioner and env |
| Replication lag | Low (single-node Mongo) | N/A until multi-member RS |
| Partial provision status | Medium | `tenantStatus: "partial"` with `ok: true` — operator may assume healthy |
| Eventual consistency POS→Finance | Medium | Outbox drain `ACCOUNTING_OUTBOX_DRAIN_MS`; retries in BullMQ |
| Traefik / app URL drift | Medium | `tenant_deployments.mongoUrl` stale; public URL vs internal URL |
| PMS on shared Postgres | Medium | Logical isolation only |

---

## 14. Failure Modes

### 14.1 Worker crash mid-provision

| State | Behavior |
|-------|----------|
| Journal written | Resume skips completed steps |
| After `docker.data_step`, before `docker.app_step` | MySQL DBs exist; compose may be partial |
| Rollback invoked | `compose down -v`; **shared DBs remain** |
| No concurrent guard | `assertNoConcurrentProvisionJob` unused |

### 14.2 DB partially created

- MySQL: `CREATE DATABASE IF NOT EXISTS` — idempotent retry
- Mongo: no explicit create at provision — empty DB or partial data on retry
- Migrations: re-run may fail if half-applied — needs manual intervention playbook

### 14.3 Mongo replica set failure

- If `stockix-mongo-rs-init` fails, clients with `replicaSet=rs0` **cannot connect**
- Healthcheck on mongo does not verify RS state

### 14.4 Redis outage

| Impact |
|--------|
| Control plane | License mail queues stall; API may exit on missing URL in prod |
| Tenant | POS workers cannot enqueue/dequeue; Finance queues/sessions fail |

### 14.5 Shared MySQL outage

**All tenants** offline simultaneously.

### 14.6 Orphaned tenant containers

- Failed rollback leaves containers; preflight `compose down` on retry
- Deprovision may skip POS/PMS projects
- `remove_module` stop paths exist but full tenant delete may miss `stockix-pos-{slug}`

### 14.7 DNS / hostname failure

- `shared-mysql` not resolving → all new provisions fail at migration or app start

### 14.8 POS provision compose failure

**RESOLVED (2026-06-04).** Worker `upServices` aligned with slim `pos-tenant-stack`; tenant `.env` merged into `composeEnv`.

---

## 15. Scaling Strategy

### 15.1 Hono API

- Horizontal: 2+ replicas behind Traefik (stateless; session in cookie + Postgres)
- Split BullMQ to dedicated `api-bullmq` replica
- Connection pool tuning via `DB_POOL_MAX`, etc.

### 15.2 Shared MySQL / Mongo / Redis

| Component | Vertical | Horizontal |
|-----------|----------|------------|
| MySQL | Increase `innodb-buffer-pool-size`, connections | Read replicas (not wired); consider managed RDS |
| Mongo | WiredTiger cache | Sharded cluster (major migration) |
| Redis | Memory limit 128mb | Redis Cluster or per-tenant instance at scale |

**Practical limit:** Single-host compose — tenant count bounded by RAM (~512m per Finance server + POS stacks).

### 15.3 Worker scaling

- Single `infra-worker` today — job claiming must remain **single-writer per tenant** or use distributed locks
- Advisory lock partial; implement `assertNoConcurrentProvisionJob` + row-level job locking

### 15.4 Edge

- Cloudflare absorbs DDoS; Traefik on single host is bottleneck — consider second ingress node + shared dynamic config store

---

## 16. Security Model

### 16.1 Tenant isolation guarantees

| Boundary | Guarantee level |
|----------|-----------------|
| MySQL | **Strong** if credentials correct — user limited to slug DBs |
| Mongo | **Strong** if URI correct — separate DB per slug |
| Redis | **Weak** — prefix documented, not enforced in POS BullMQ |
| Network | **Weak** — shared L2 network; defense in depth = DB auth |
| Filesystem | Per-tenant `.env` mode 600 in slug dir |

### 16.2 Network segmentation

```
Internet → Traefik (public)
Control plane DB/Redis → stockix_internal only
Tenant DB → stockix-shared (all tenants)
Docker socket → socket-proxy (filtered API)
```

### 16.3 Credential scoping

| Secret | Scope |
|--------|-------|
| `WORKER_SECRET` | `/internal/*` only |
| `PLATFORM_API_SECRET` | Service-to-service |
| `INTERNAL_API_SECRET` | Finance internal routes |
| `tenant_{safe}` MySQL password | Per-tenant DBs only |
| Per-tenant `JWT_SECRET` | In tenant `.env` |

### 16.4 Auth boundaries

- Unknown paths → **404** (no enumeration)
- `/internal/jobs/*` → Bearer worker secret only
- Webhooks verified in handler (Resend signing)

---

## 17. Production Readiness Checklist

### P0 — Blockers (must fix before production)

- [x] **DNS aliases:** Network aliases on shared services (`shared-mysql`, `shared-mongo`, `tenant-redis` + `stockix-*`)
- [x] **Traefik dynamic volume:** Traefik and worker bind-mount `TRAEFIK_DYNAMIC_DIR`
- [x] **POS provision worker:** Stale `pos-mongo` / `pos-redis` services removed; tenant `.env` merged into `composeEnv`
- [x] **MongoDB per-tenant isolation:** Enforced in `buildTenantEnvMap` (`{slug}_pos`)
- [ ] **MySQL naming:** Unify `slugToMysqlSafe` between `provisioner.ts` and `tenant-env.ts`; align `_finance` DB with Finance `TenantDBManager` or stop creating unused DB
- [ ] **Verify end-to-end provision** on staging: Finance health, POS ping, Mongo DB name, MySQL grants

### P1 — High priority

- [ ] Implement Redis key prefix in POS `jobQueue.js` (or separate Redis DB index per tenant)
- [ ] Pass `REDIS_KEY_PREFIX` into Finance `tenant-stack` server environment
- [ ] Deprovision: tear down `stockix-pos-{slug}` and `stockix-pms-{slug}` projects
- [ ] Deprovision: drop org-level MySQL databases `stockix_{slug}_%`
- [ ] Replace hard-coded Mongo container name with `docker compose ps -q` lookup
- [ ] Wire `assertNoConcurrentProvisionJob` or equivalent
- [ ] Update `tenant_deployments.mongoUrl` to per-tenant URL
- [ ] Rollback: optional `deprovisionTenantDatabases` flag for hard rollback

### P2 — Operational excellence

- [ ] Shared Nginx gateway for Finance static assets (or embed static in server image)
- [ ] Remove stale nginx discovery from `traefik-config.ts` or implement gateway
- [ ] Mongo RS healthcheck includes `rs.status().ok`
- [ ] Redis FLUSH by prefix on deprovision
- [ ] Backup strategy for `stockix_shared_mysql`, `stockix_shared_mongo`, `stockix_shared_tenant_redis` volumes
- [ ] Load test: N tenants × connection count on MySQL 500 max
- [ ] Document partial provision remediation in `infra/prod/OPERATIONS.md`
- [ ] Sync `docs/ARCHITECTURE.md` with shared-infra model (still describes per-tenant mongo/redis)

### P3 — Hardening

- [ ] Multi-host / managed DB migration path
- [ ] Secrets rotation runbook (platform + per-tenant JWT)
- [ ] Rate limits on `/public/tenant/*` verified under load
- [ ] Snyk/security scan in CI for worker and API images

---

## 18. Critical Improvements / Recommendations

### 18.1 Architecture fixes (ordered)

1. **Unify service discovery hostnames** — Single convention: either all `stockix-*` or all `shared-*` with Docker aliases.
2. **Fix POS provision path** — Align `module-stacks.ts` with slim `pos-tenant-stack`; inject tenant env file.
3. **Traefik config single mount** — Bind-mount host directory shared by Traefik and worker.
4. **Enforce Redis isolation** — Prefix all BullMQ queue names: `${REDIS_KEY_PREFIX}bigcapital_sync`.
5. **Deprovision completeness** — Module stacks + org MySQL DBs + Redis prefix cleanup.
6. **Shared Nginx** — Implement `infra/shared/nginx/` with `map $host $tenant_upstream` for static Finance UI, or serve static from NestJS.

### 18.2 Missing components

| Component | Status |
|-----------|--------|
| Shared Nginx gateway | Referenced, not in repo |
| `infra/shared/mysql/init` | Volume mount exists, directory empty |
| Per-tenant backup/restore | Platform postgres only (`db-backup` service) |
| Mongo RS monitoring | No dedicated exporter |

### 18.3 Best-practice upgrades

- Move from single-node compose to **managed MySQL/Mongo** with private networking
- Replace `host.docker.internal` Traefik upstream with **Docker network IP** or **Traefik Docker labels** on tenant `server`
- Use **HashiCorp Vault** or cloud secret manager for `SHARED_MYSQL_ROOT_PASSWORD` rotation
- Add **integration tests** that provision two slugs and assert Mongo/Redis/MySQL isolation
- Enable `check:tenant-scope`, `check:routes` in deploy pipeline (already in CLAUDE.md)

---

## Appendix A — Local Development Environment

| Component | Path | Notes |
|-----------|------|-------|
| Platform DB | `infra/dev/docker-compose.yml` | Postgres `54330`, Redis `6379` |
| Shared infra | Optional: start `infra/shared` locally for prod-parity | |
| Finance | `infra/tenant-stack/docker-compose.local-*.yml` overlays | |
| Worker | Run against local API + Docker socket | |
| Env sync | `pnpm env:sync-prod` copies prod → root `.env` for worker fallback | |

Local dev **does not** automatically mirror full `stockix-shared` + Traefik; developers often run Finance directly via `services/stockix-finance` compose.

---

## Appendix B — Key Source Files

| Concern | Path |
|---------|------|
| Provision orchestration | `infra/worker-service/src/provision-runtime.ts` |
| DB provision/deprovision | `infra/worker-service/domain/provisioner.ts` |
| Tenant env | `infra/worker-service/domain/provisioning/tenant-env.ts` |
| Traefik YAML | `infra/worker-service/domain/traefik-config.ts` |
| POS provision | `infra/worker-service/src/module-stacks.ts` |
| Shared infra compose | `infra/shared/docker-compose.yml` |
| Prod control plane | `infra/prod/docker-compose.yml` |
| Finance tenant DB naming | `services/stockix-finance/packages/server/src/services/Tenancy/TenantDBManager.ts` |
| Control plane app | `apps/api/src/app/create-control-plane-app.ts` |
| Prior architecture doc | `docs/ARCHITECTURE.md` (partially stale) |

---

## Appendix C — Environment Variable Reference (per-tenant `.env`)

| Variable | Pattern |
|----------|---------|
| `DB_HOST` | `{SHARED_MYSQL_HOST}` default `shared-mysql` |
| `SYSTEM_DB_NAME` | `stockix_{slug}_system` |
| `TENANT_DB_NAME_PREFIX` | `stockix_{slug}_` |
| `MONGODB_URI` | `mongodb://{SHARED_MONGO_HOST}:27017/{slug}_pos?replicaSet=rs0&directConnection=true` |
| `REDIS_URL` | `redis://{TENANT_REDIS_HOST}:6379/0` |
| `REDIS_KEY_PREFIX` | `tenant:{slug}:` |

---

*This document is the architecture validation source of truth for the shared-infrastructure migration. Update it when blockers in §17 are resolved.*
