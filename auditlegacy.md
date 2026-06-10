# Stockix Finance — Technical Audit (Docker-Aware)

**Date:** 2026-06-09  
**Method:** Container inspection + compose/Dockerfile analysis. Docker is the source of truth for runtime; source tree alone is not.

---

## Audit summary

Stockix runs as a **Docker-based shared infrastructure model**:

| Layer | Compose file | What actually runs |
|-------|--------------|-------------------|
| **Control plane** | `infra/prod/docker-compose.yml` | `api`, `api-bullmq`, `dashboard`, `infra-worker`, Traefik, Postgres, control-plane Redis |
| **Shared tenant infra** | `infra/shared/docker-compose.yml` | MySQL, ProxySQL, MongoDB (rs0), tenant Redis — one stack for all tenants |
| **Per-tenant Finance** | `infra/tenant-stack/docker-compose.yml` | `server` + one-shot `database_migration` only |
| **Per-tenant POS** | `infra/pos-tenant-stack/docker-compose.yml` | `pos-backend`, `pos-frontend`, 2 workers |
| **Per-tenant PMS** | `infra/pms-tenant-stack/docker-compose.yml` | `pms-api`, `pms-frontend` |

**Finance production traffic** is served by **`stockix-server:local`** containers provisioned per tenant. Verified live:

```
Image:   stockix-server:local
CMD:     node ./packages/server/build/index.js
Entry:   src/main.ts → NestFactory.create(AppModule)
Health:  GET /api/ping → {"status":"ok"}
```

**NestJS runs inside Docker** — not outside. Legacy Express (`src/server.ts` → `loaders/express.ts` → `src/api/**`) is **not in the webpack bundle** (0 matches for `loaders/express` in `build/index.js`) and **not reachable** from any production container.

**Legacy source is still shipped** in the server image (~20 MB `packages/server/src/`) but the Express path is not executed. The webpack entry is exclusively `src/main.ts`.

**Root CI does not type-check Finance server.** `deploy.yml` runs `@stockix/server test` only; `transpileOnly: true` in webpack means ~2,200 legacy TS errors do not block image builds.

**Shared code coupling:** `packages/shared` is **copied** (not symlinked) into `services/stockix-finance/packages/shared` at `pnpm docker:prebuild`. The infra worker imports `@repo/shared` from the monorepo root — **no import of Finance `src/api` or `src/services`**.

---

## Docker Shared Infrastructure Architecture

### Before → after (tenant isolation)

```
BEFORE (per-tenant, deprecated — services/stockix-finance/docker-compose.prod.yml):
  nginx + webapp + server + mysql + mongo + redis = 6 containers/tenant

AFTER (shared infra model):
  Shared: stockix-mysql + stockix-mysql-proxy + stockix-mongo + stockix-redis
  Finance tenant: server + database_migration = 2 ephemeral containers/tenant
  POS tenant:     pos-backend + pos-frontend + 2 workers = 4 containers/tenant
```

### Runtime diagram (text)

```
                         Internet (TLS)
                              │
                         [ Traefik ]
                    stockix_public network
           ┌──────────────────┼──────────────────┐
           │                  │                  │
    api.{domain}         app.{domain}     {slug}.{domain}
           │                  │                  │
      [ stockix-api ]   [ stockix-dashboard ]   Traefik dynamic
      node dist/index.js   Next.js :3000       routes to host port
      :4000                                      │
           │                                     ▼
      [ api-bullmq ]              stockix-{slug}-server-1  (per tenant)
      RUN_BULLMQ=true             stockix-server:local
           │                      node packages/server/build/index.js :3000
           │                      NestJS + bundled Vite SPA (webapp-dist)
           │                                     │
      [ infra-worker ]                            │
      node worker.js :9090                        │
      docker compose provisioner                  │
           │                                      │
           ├──────────── stockix-shared network ──┤
           │                                      │
    [ stockix-mysql-proxy:6033 ]          [ stockix-mongo:27017 ]
           │                                      │
    [ stockix-mysql:3306 ]                DB: {slug}_pos
    DB: stockix_{slug}_finance
    user: tenant_{slug}

    [ stockix-redis:6379 ]
    keys: tenant:{slug}:queue:* | tenant:{slug}:agenda:*

Control plane only (stockix_internal):
    [ postgres:5432 ]  stockix_platform
    [ control-plane-redis ]
```

### Networks

| Network | Owner | Members |
|---------|-------|---------|
| `stockix-shared` | `infra/shared/docker-compose.yml` | MySQL, ProxySQL, Mongo, Redis, all tenant app containers |
| `stockix_public` | `infra/prod/docker-compose.yml` | Traefik, api, dashboard, tenant servers (routed) |
| `stockix_internal` | `infra/prod/docker-compose.yml` | Postgres, control-plane Redis, api, worker (not tenant apps) |
| `socket_proxy_network` | prod | Traefik ↔ docker-socket-proxy, infra-worker |

### Volume mounts (coupling check)

| Service | Host mount | Purpose | Legacy coupling? |
|---------|------------|---------|------------------|
| `infra-worker` | `/opt/stockix/stockixnew:ro` | Compose file paths, `STOCKIX_TENANT_APP_ROOT` | **No runtime import** — orchestration only |
| `infra-worker` | `/opt/stockix/tenants` | Per-tenant `.env` files | Env injection only |
| `infra-worker` | Traefik dynamic dir | Route registration | None |
| Finance `server` | **None** (read-only root FS + tmpfs) | Fully baked image | **Isolated** |
| Shared MySQL/Mongo/Redis | Named Docker volumes | Persistent data | Shared by design |

**No shared `node_modules` volume** between tenants. Each tenant gets its own container filesystem from the image.

### Shared modules across containers

| Package / artifact | Used by | Distribution |
|--------------------|---------|--------------|
| `@repo/config`, `@repo/db`, `@repo/auth`, `@repo/shared` | api, infra-worker | Baked into respective images at build |
| `packages/shared` → Finance `packages/shared` | Finance Docker build | **`cpSync` at prebuild** — duplicate copy, must stay in sync manually |
| `shared/bigcapital-utils`, `email-components`, `pdf-templates`, `sdk-ts` | Finance server/webapp image | Copied into Finance workspace at Docker build |
| `stockix-mysql-proxy`, `stockix-mongo`, `stockix-redis` | All Finance + POS tenants | DNS on `stockix-shared` |

---

## Docker runtime truth map

### Control plane (`infra/prod/docker-compose.yml`)

| Service | Image | CMD / entry | Serves |
|---------|-------|-------------|--------|
| `api` | `stockix-api:latest` | `node dist/index.js` | Platform API `:4000` via Traefik |
| `api-bullmq` | same | same + `RUN_BULLMQ_CONSUMERS=true` | Background jobs |
| `dashboard` | `stockix-dashboard:latest` | Next.js `:3000` | `app.{ROOT_DOMAIN}` |
| `infra-worker` | `stockix-infra-worker:latest` | `node worker.js` | Tenant provision/deprovision via Docker API |
| `postgres` | `postgres:16-alpine` | default | `stockix_platform` |
| `control-plane-redis` | `redis:7-alpine` | default | Sessions, BullMQ (platform) |
| `traefik` | `traefik:v3.4` | — | TLS + routing |

Build: `apps/api/Dockerfile` → `pnpm --filter api build` → `node dist/index.js`. **Separate from Finance.**

### Shared infrastructure (`infra/shared/docker-compose.yml`)

| Service | Hostname | Port | Tenant usage |
|---------|----------|------|--------------|
| `stockix-mysql` | `stockix-mysql` | 3306 | Worker DDL only (root) |
| `stockix-mysql-proxy` | `stockix-mysql-proxy` | 6033 | Finance/POS app connections |
| `stockix-mongo` | `stockix-mongo` | 27017 | `{slug}_pos` per tenant |
| `stockix-mongo-rs-init` | one-shot | — | `rs.initiate()` |
| `stockix-redis` | `stockix-redis` | 6379 | `tenant:{slug}:*` key prefix |

### Per-tenant Finance (`infra/tenant-stack/docker-compose.yml`)

| Service | Image | CMD | Notes |
|---------|-------|-----|-------|
| `server` | `stockix-server:local` | `node ./packages/server/build/index.js` | **Production API + SPA** |
| `database_migration` | `stockix-database-migration:local` | `node ./scripts/run-system-migrate.mjs` | One-shot; Knex native (not webpack `commands.js`) |

Provisioner: `infra/worker-service` writes tenant `.env` via `tenant-env.ts`, runs `docker compose -f infra/tenant-stack/docker-compose.yml`.

**Required images** (`required-tenant-images.ts`): `stockix-server:local`, `stockix-database-migration:local`.

Build pipeline: `pnpm docker:prebuild` → syncs `packages/shared` → `docker build --target app|migration` from `services/stockix-finance/packages/server/Dockerfile`.

### Per-tenant POS (`infra/pos-tenant-stack/docker-compose.yml`)

| Service | Image | CMD |
|---------|-------|-----|
| `pos-backend` | `stockix-pos-backend:local` | `node app.js` |
| `pos-platform-worker` | same image | `node workers/platformWorker.js` |
| `pos-bigcapital-worker` | same image | `node workers/bigcapitalWorker.js` |
| `pos-frontend` | `stockix-pos-frontend:local` | nginx/static |

Mongo/Redis: shared infra hostnames (no per-tenant mongo/redis containers).

### Finance server image contents (verified `stockix-server:local`, 2026-06-09)

| Path | Size | Runtime role |
|------|------|----------------|
| `packages/server/build/index.js` | ~49 MB | **Executed** — NestJS webpack bundle |
| `packages/server/build/commands.js` | present | Not main CMD; CLI bundle |
| `packages/server/webapp-dist/` | ~8.8 MB | **Served** — Vite SPA via `ServeStaticModule` |
| `packages/server/src/` | ~19.8 MB | **Shipped, mostly dead** — migration/seed scripts, legacy Express source |
| `node_modules/` | ~1.3 GB | Runtime deps |
| `packages/server/build/database/tenant/migrations/` | compiled | Tenant migrations at runtime |

Fresh image: `webapp-dist/index.html` exists. Older e2e containers may lack `webapp-dist` if built before SPA bundling — rebuild with `pnpm docker:prebuild:force`.

### Is legacy Express reachable?

| Check | Result |
|-------|--------|
| Webpack entry | `./src/main.ts` only (`webpack.config.js`) |
| `loaders/express` in `build/index.js` | **0 matches** |
| `src/api/index.ts` in bundle | **Not statically imported from main.ts** |
| Nest modules import `@/api` | **0 matches** |
| Container has `src/server.ts`, `src/api/` on disk | Yes — **files present, not executed** |
| Separate Express process in compose | **None** |

**Conclusion:** Legacy Express is **C) LEGACY BUT INCLUDED** in the image filesystem; **not A) ACTIVE PRODUCTION**.

---

## Classification (A–E)

### A) ACTIVE PRODUCTION (running in Docker)

| Component | Evidence |
|-----------|----------|
| Finance NestJS API | `CMD node ./packages/server/build/index.js`; `/api/ping` OK; `NestFactory` ×27 in bundle |
| Finance Vite webapp | `webapp-dist/` in image; `ServeStaticModule` + SPA controller in `App.module.ts` |
| Finance migrations | `database_migration` → `run-system-migrate.mjs` |
| Platform API | `apps/api` → `node dist/index.js` |
| Platform dashboard | `apps/dashboard` image |
| Infra worker | `node worker.js`; provisions tenant stacks |
| Shared MySQL/ProxySQL/Mongo/Redis | `infra/shared` compose |
| POS backend + workers | `node app.js` / worker scripts |
| POS frontend | `stockix-pos-frontend:local` |
| PMS stack | `stockix-pms:local`, `stockix-pms-frontend:local` |

### B) SHARED INFRASTRUCTURE (cross-container)

| Component | Consumers |
|-----------|-----------|
| `stockix-shared` Docker network | All tenant Finance + POS containers |
| `stockix-mysql-proxy:6033` | Finance server, POS (tenant DB creds) |
| `stockix-mongo:27017` | POS (`{slug}_pos`); Finance env `MONGODB_DATABASE_URL` |
| `stockix-redis:6379` | BullMQ, Agenda, `REDIS_KEY_PREFIX=tenant:{slug}:` |
| `@repo/shared` (deployment-secrets, finance-api types) | api, worker; **copy** into Finance at prebuild |
| `packages/config`, `packages/db`, `packages/auth` | api, worker |
| Traefik dynamic routing | Worker writes upstream to tenant `PUBLIC_PROXY_PORT` |

### C) LEGACY BUT INCLUDED (shipped, not executed as HTTP)

| Component | Evidence |
|-----------|----------|
| `src/api/**` (~108 files) | On disk in image; not in webpack bundle; not mounted by Express |
| `src/server.ts`, `loaders/express.ts` | On disk; webpack entry is `main.ts` only |
| `src/services/**` CRUD + subscribers (~600+ files) | Mostly not statically imported from Nest entry; **exceptions below** |
| `src/subscribers/**` (legacy typedi) | Not loaded — Nest uses `@OnEvent` |
| `packages/webapp/Dockerfile` (standalone nginx) | **Not used** by tenant provisioner |
| `services/stockix-finance/docker-compose.prod.yml` | Marked **DEPRECATED** |
| `build/commands.js` in server image | Present; server CMD uses `index.js`, migration uses Knex script |

### D) DEAD CODE (safe to delete after validation)

| Component | Preconditions |
|-----------|---------------|
| `src/api/**` entire tree | Confirm no external callers to old Express routes |
| `src/server.ts`, `loaders/express.ts`, `loaders/eventEmitter.ts` (legacy path) | After removing `npm run inspect` legacy dev path |
| `src/services/**` CRUD services | Only referenced from `src/api` — verify webpack graph |
| `src/subscribers/**` (legacy typedi) | After Nest event migration verified |
| `modules/Bills/BillPdf.ts` | Not registered in any Nest module |
| Standalone `packages/webapp/Dockerfile` nginx image | If no external deployment uses it |
| `docker-compose.prod.yml` (finance standalone) | Reference only |

### E) RISK ZONE (unclear coupling / dangerous)

| Risk | Detail | Severity |
|------|--------|----------|
| **Legacy services in Nest bundle** | `BillAllocatedLandedCostTransactions.service.ts` imports `TenancyService`, `I18nService` via typedi — pulls legacy model graph into webpack | High — validate landed-cost flows |
| **`src/services/*/constants` in models** | `Account.model.ts`, `Expense.model.ts`, `Bill.ts` import `DEFAULT_VIEWS` | Medium — active but should migrate to module-local constants |
| **`packages/shared` duplicate copy** | Prebuild `cpSync` into Finance tree; `deployment-secrets.ts` has manual sync comment | Medium — drift risk |
| **No Finance server typecheck in root CI** | `deploy.yml` tests only; webpack `transpileOnly: true` | High — type errors ship silently |
| **Full `src/` + `node_modules` in image** | ~1.35 GB image; attack surface + confusion | Medium |
| **`BillPdf.ts` (Nest)** | Imports legacy PDF services but unregistered — dead import path if ever wired | Low |
| **Stale tenant images** | E2e containers missing `webapp-dist` on old builds | Medium — enforce prebuild before provision |
| **Finance `.github/workflows/typecheck.yml`** | Lives under `services/stockix-finance/` — may not run on monorepo `push` to root | Medium |

### Active legacy `src/services` imports from Nest (E → partial A)

| Import | Nest consumer | Status |
|--------|---------------|--------|
| `@/services/Accounts/constants` | `Account.model.ts` | **Active** |
| `@/services/Expenses/constants` | `Expense.model.ts` | **Active** |
| `@/services/Purchases/constants` | `Bill.ts` | **Active** |
| `@/services/Tenancy/TenancyService` | `BillAllocatedLandedCostTransactions.service.ts` | **Active (risky)** |
| `@/services/I18n/I18nService` | same | **Active (risky)** |
| `@/services/PDF/*`, `ExchangeRatesService` | `modules/Bills/BillPdf.ts` | **Dead file** (not in module graph) |

---

## 1. Legacy code usage (`src/api` + `src/services`)

### Production entrypoint (Docker-proven)

```
infra/tenant-stack/docker-compose.yml
  → image: stockix-server:local
    → CMD: node ./packages/server/build/index.js
      → webpack entry: src/main.ts
        → NestFactory.create(AppModule)
          → /api/* (Nest controllers in src/modules/**)
          → webapp-dist/* (ServeStaticModule + SPA fallback)
```

### Legacy Express path (not in production containers)

```
src/server.ts  (dev: npm run inspect only)
  → loaders/express.ts
    → src/api/index.ts
```

**Evidence:** Live container process = `node ./packages/server/build/index.js`. Bundle contains `NestFactory`, zero `loaders/express`. Nest `src/modules/**` has zero `@/api` imports.

### `src/services` breakdown (unchanged logic, Docker-confirmed bundling)

Webpack bundles everything **statically reachable from `main.ts`**. Legacy CRUD services used only by `src/api` are not in the bundle. Constants and Tenancy chain are.

---

## 2. Production build output (Docker build context)

### Build pipeline

| Step | Command | Entry | Output in image |
|------|---------|-------|-----------------|
| Webapp | `pnpm --filter @stockix/webapp run build` | `src/index.tsx` | `packages/server/webapp-dist/` |
| App server | `pnpm run build:server` | `src/main.ts` | `packages/server/build/index.js` |
| CLI | `pnpm run build:commands` | `src/commands/index.ts` | `build/commands.js` (migration image) |
| Migrations compile | `compile-tenant-migrations.mjs` | `src/database/tenant/migrations/*.ts` | `build/database/tenant/migrations/*.js` |
| Prebuild sync | `prebuild-tenant-images.mjs` | `packages/shared` | `services/stockix-finance/packages/shared` (copy) |

### Dockerfile stages (`packages/server/Dockerfile`)

```
deps → build-webapp → build-app → app          (stockix-server:local)
deps → build-migration → migration              (stockix-database-migration:local)
```

Serialized builds (`build-webapp` before `build-app`) to avoid BuildKit OOM on Windows.

### TypeScript — not blocking Docker builds

```js
// packages/server/scripts/webpack.common.js
transpileOnly: true,
configFile: 'tsconfig.json',
```

| Build | Type-check? | TS errors block? |
|-------|-------------|------------------|
| Server webpack | `transpileOnly: true` | **No** |
| Webapp Vite | esbuild strip types | **No** |
| Root `deploy.yml` CI | api, worker, dashboard, packages | **Finance server excluded** |
| `services/stockix-finance` typecheck workflow | `pnpm run typecheck` | Yes, but **separate repo-path workflow** |
| Docker image build | None | **No** |

~2,200 server TS errors (mostly `src/api`, `src/services`) are **included in build context** but do not fail the image build.

---

## 3. React types — root cause and fix

*(Unchanged from prior audit — webapp types are a build-time/CI concern, not Docker runtime.)*

Not a true React 18 vs 19 version war. Finance is its own pnpm workspace; root overrides do not apply.

**Problem:** `@types/react@18.3.4` dual entry (`index.d.ts` vs `ts5.0/index.d.ts`) + TypeScript 5.6.3 → 238 webapp errors (mostly TS2786 Blueprint v4).

**Fix:** Pin overrides in `services/stockix-finance/package.json`; move types to devDependencies; align TypeScript version.

---

## 4. ESLint audit — signal vs noise

*(Unchanged — webapp lint is dev/CI signal, not container runtime.)*

Scope: `packages/webapp/src` — 818 issues (5 errors, 813 warnings).  
Server ESLint blocked: missing `eslint-plugin-prettier`.

Real production risk: ~45 hook/logic rules (`exhaustive-deps` in financial forms), not 537 unused-vars warnings.

---

## Risk table (Docker-aware)

| Tier | Component | Classification | Production impact |
|------|-----------|----------------|-------------------|
| **P0** | Finance server without CI typecheck | E | Broken types ship in every tenant image |
| **P0** | `transpileOnly: true` | Build config | ~2,200 TS errors invisible at build |
| **P1** | TenancyService typedi chain in Nest | E/A | Landed-cost + model graph bloat |
| **P1** | Stale `stockix-server:local` without `webapp-dist` | E | Tenant UI missing until force prebuild |
| **P2** | `packages/shared` copy drift | B/E | Secret handling divergence |
| **P2** | 1.3 GB Finance image (`node_modules` + dead `src/`) | C | Cost, confusion, attack surface |
| **P3** | 818 webapp lint warnings | Dev quality | Low direct runtime impact |
| **P3** | 238 webapp TS errors | Dev quality | Vite build still succeeds |

---

## Migration recommendations (Docker reality)

### Immediate (ops)

1. **Enforce image freshness:** Run `pnpm docker:prebuild:force` before tenant provision; worker already asserts `stockix-server:local` exists.
2. **Verify SPA in image:** `docker run --rm stockix-server:local ls packages/server/webapp-dist/index.html`.
3. **Start shared infra before tenants:** `infra/shared` → `infra/prod` → worker provisions tenants.

### CI / build hygiene

4. **Add Finance server typecheck to root `deploy.yml`:** `cd services/stockix-finance && pnpm --filter @stockix/server exec tsc --noEmit` (or scoped to `src/modules/**` first).
5. **Move or symlink Finance typecheck workflow** to root `.github/workflows/` so it runs on monorepo pushes.
6. **Consider `fork-ts-checker-webpack-plugin`** for Nest/modules path only — keep `transpileOnly` for speed but fail CI on module errors.

### Image slimming

7. **Multi-stage prune:** Final `app` stage should copy only `build/`, `webapp-dist/`, `public/`, compiled migrations, and production `node_modules` — **drop `packages/server/src/`** from runtime image (keep migration image separate).
8. **Remove deprecated compose:** Archive or delete `services/stockix-finance/docker-compose.prod.yml` and unused `packages/webapp/Dockerfile` nginx path.

### Legacy cleanup (post-validation)

9. **Delete `src/api/**`** after route parity sign-off (Nest controllers already serve `/api/*`).
10. **Migrate active constants** from `src/services/*/constants` into `src/modules/*/constants`.
11. **Refactor `BillAllocatedLandedCostTransactions`** off typedi `TenancyService`/`I18nService` onto Nest DI.
12. **Replace `packages/shared` copy** with workspace-aware Docker build from monorepo root (single source, no `cpSync`).

### Shared infrastructure hardening

13. **Document tenant key prefix contract** (`tenant:{slug}:`) — already in `tenant-env.ts`; add integration test in worker.
14. **ProxySQL health** as gate before Finance `database_migration` (worker preflight already resets system DB).

---

## Dependency graph (Docker-aware)

```
[Monorepo root]
├── apps/api ──────────────────► stockix-api:latest ──► Traefik api.{domain}
├── apps/dashboard ────────────► stockix-dashboard:latest
├── infra/worker-service ──────► stockix-infra-worker:latest
│     ├── @repo/config, @repo/db, @repo/auth, @repo/shared
│     ├── docker CLI (provision tenant compose)
│     └── reads: infra/tenant-stack, infra/pos-tenant-stack (from mounted repo)
│
├── infra/shared ──────────────► stockix-mysql, proxysql, mongo, redis
│
└── services/stockix-finance
      ├── prebuild: packages/shared ──cpSync──► packages/shared (duplicate)
      ├── packages/server/Dockerfile
      │     ├── target app ──► stockix-server:local
      │     │     CMD: node build/index.js (NestJS + webapp-dist)
      │     └── target migration ──► stockix-database-migration:local
      │           CMD: node scripts/run-system-migrate.mjs
      │
      ├── LEGACY (on disk in image, not HTTP):
      │     src/api/**, src/server.ts, loaders/express.ts
      │
      └── PARTIAL (in webpack bundle via Nest):
            src/services/*/constants, TenancyService, I18nService

[Per tenant @ provision time]
  worker → docker compose -f infra/tenant-stack/docker-compose.yml
         → server joins stockix-shared + stockix_public
         → env from tenant-env.ts (ProxySQL, mongo URL, redis prefix)
```

---

## Bottom line

- **Production Finance HTTP is NestJS inside `stockix-server:local` Docker containers** — confirmed by CMD, health check, and bundle analysis.
- **Legacy Express is not executed** in any production container; it remains as dead source in the image.
- **Shared infrastructure is real and working:** one MySQL/Mongo/Redis stack, per-tenant DB isolation, ProxySQL pooling, Redis key prefixes.
- **Services are not monolithic in disguise at runtime** — each tenant gets an isolated container; coupling is via shared network DNS and duplicated `packages/shared` copy at build time.
- **Biggest gap:** type safety is bypassed for Finance server in both Docker builds and root CI; legacy code bloats the image and obscures what actually runs.

---

*Evidence sources: `infra/*/docker-compose.yml`, `packages/server/Dockerfile`, live `docker inspect` / `docker exec` on `stockix-e2e-full-*-server-1`, `docker run stockix-server:local`, `deploy.yml`, `prebuild-tenant-images.mjs`, `webpack.config.js`, `required-tenant-images.ts`.*
