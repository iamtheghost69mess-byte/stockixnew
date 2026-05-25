# Architecture Debt Audit

**Date:** 2026-05-25  
**Scope:** Read-only pass — five specific problems  
**Method:** Repository scans (`grep`, line counts, file listing). No files modified except this report.

---

## Executive summary

| # | Problem | Severity | One-line finding |
|---|---------|----------|------------------|
| 1 | God file `apps/api/src/index.ts` | **High** | **5,314 lines**, **125** inline route registrations; ~**2,780** lines tenant/provision block still inline |
| 2 | Three package managers | **Medium** | Root **pnpm**, POS **npm** workspaces, Finance **Lerna + pnpm**; no single install script |
| 3 | Worker coupled to API source | **High** | **3** direct imports from `apps/api/src/`; worker bundle via `apps/api/tsup.worker.config.ts` |
| 4 | PMS on shared Postgres | **Medium** | **18** `pms_*` tables in platform schema; FK to `tenants`; background iCal sync on same DB |
| 5 | Stale documentation | **Medium** | **`saas-dash`** still referenced in POS docs/lockfile; **`PROVISION_MODULE_GATING`** docs vs code default diverge |

---

## Problem 1: God File (`apps/api/src/index.ts`)

### 1.1 Measure the damage

| Metric | Value | Command / evidence |
|--------|-------|-------------------|
| **Total lines** | **5,314** | `(Get-Content apps/api/src/index.ts).Count` |
| **Inline route handlers** (`app.get/post/put/patch/delete`) | **125** | `grep` on `index.ts` |
| **No section markers** | 0 | No `// ===`, `// SECTION`, `// MARK` comments in file |

**Keyword hit counts** (lines containing term — *not* LOC; many hits are imports, strings, or comments):

| Concern | Keyword matches in `index.ts` |
|---------|------------------------------|
| Auth (`auth`, `login`, `logout`, `session`, …) | 66 |
| Tenants / provision | 1,051 |
| License / plan / activate | 114 |
| Finance | 76 |
| POS | 147 |
| PMS | 3 |
| Worker `/internal/` | 19 |
| User / owner / role | 290 |

### 1.2 What already exists as separate files

**`apps/api/src/routes/` tree:**

| File | Lines | Mounted on live app? |
|------|-------|----------------------|
| `routes/auth/index.ts` | 419 | ✅ `app.route("/auth", …)` at **line 593** |
| `routes/pos-proxy-http.ts` | 153 | ✅ `registerPosProxyRoutes` at **5283** |
| `routes/pms-proxy-http.ts` | 51 | ✅ `registerPmsProxyRoutes` at **5284** |
| `routes/jobs/index.ts` | 219 | ❌ **`buildJobsRouter` never imported in `index.ts`** |
| `routes/audit-log.ts` | (handler only) | ✅ used by `GET /audit-log` in `index.ts` |

**Sibling `*-http.ts` registrars (bottom of `index.ts` lines 5279–5284):**

| File | Lines | Routes (approx) | Notes |
|------|-------|-----------------|-------|
| `license-http.ts` | **1,829** | 21 | Includes **`/plans`** CRUD (lines 172–330) |
| `finance-users-http.ts` | 391 | 9 | Finance user admin + repair link |
| `pos-credentials-http.ts` | 195 | 6 | POS PIN credentials |
| `tenant-modules-http.ts` | 260 | 6 | `add-module` / `remove-module` |

**Other extracted modules (not route files):**

- `pos-proxy.ts`, `pms-proxy.ts`, `finance-license.client.ts`, `org-provision.ts`
- `middleware/auth.ts`, `middleware/rbac.ts`, `middleware/idempotency.ts` — **exist but production app uses inline middleware in `index.ts` (lines 621–977), not `createAuthGate` / `createRbacMiddleware`**

**`index.ts` structure (registrations and first routes):**

```text
593:  app.route("/auth", buildAuthRoutes(db))
621+: middleware (cors, security, auth gate, actor, idempotency, rbac)
979:  GET /health
981:  GET /public/tenant-orgs/:tenantId
1018: POST /internal/jobs/claim
…     internal job complete/fail/requeue (through ~1964)
1965: GET /owners … owner CRUD
2307: GET /admin/orphan-check, /audit-log, /api-keys
2498: GET /tenants … (bulk of file through ~5087)
5088: GET /search
5279: registerLicenseApi, registerTenantFinanceUsersApi, …
5309: serve()
```

### 1.3 Concerns mixed in one file

| Concern | Line range (approx) | ~LOC | Already extracted? | Target file (proposed) |
|---------|---------------------|------|--------------------|-------------------------|
| Imports + domain helpers | 1–325 | 325 | ❌ | `lib/provision-helpers.ts`, `lib/organization-helpers.ts` |
| App init, caches, crypto, docker cleanup | 326–619 | 294 | ❌ | `lib/provision-runtime-api.ts` |
| Middleware stack | 621–978 | 357 | ⚠️ partial (`middleware/*` unused in prod) | Wire `middleware/auth.ts` + `rbac.ts` + `idempotency.ts` |
| Health + public | 979–1017 | 38 | ❌ | `routes/health.ts` |
| **Worker internal jobs** | 1018–1964 | **946** | ❌ duplicate in `routes/jobs/index.ts` | `routes/internal/jobs.ts` |
| **Owners** | 1965–2306 | **341** | ❌ | `routes/owners.ts` |
| Admin / audit / API keys | 2307–2497 | 190 | ⚠️ audit handler extracted | `routes/admin.ts`, `routes/api-keys.ts` |
| **Tenants + orgs + provision + search** | 2498–5278 | **~2,780** | ⚠️ `org-provision.ts` enqueue only | `routes/tenants.ts`, `routes/organizations.ts` |
| Registrar + `serve()` | 5279–5314 | 35 | N/A | keep thin `index.ts` |

| Concern | Status |
|---------|--------|
| Auth HTTP routes | ✅ `routes/auth/index.ts` (middleware still inline) |
| Licenses + **plans** | ✅ `license-http.ts` — **do not duplicate** |
| Finance user admin | ✅ `finance-users-http.ts` |
| POS proxy | ✅ `routes/pos-proxy-http.ts` |
| PMS proxy | ✅ `routes/pms-proxy-http.ts` |
| POS credentials / modules | ✅ dedicated `*-http.ts` |

### Unused duplicate — recommended action

**File:** `apps/api/src/routes/jobs/index.ts`  
**Evidence:** `buildJobsRouter` is only defined here; `grep buildJobsRouter` across repo finds **no** import from `index.ts`. Live worker protocol is **inline** at `index.ts` lines **1018–1964** (`/internal/jobs/*`).  
**Action:** **DELETE** after extracting inline handlers to `routes/internal/jobs.ts` (or mount router at `app.route("/internal/jobs", buildJobsRouter(db))` and delete duplicate logic — pick one).

### Route inventory (mounted)

| Source | Handler count |
|--------|---------------|
| `index.ts` (inline) | 125 |
| `license-http.ts` | 21 |
| `routes/auth/index.ts` | 16 |
| `routes/pos-proxy-http.ts` | 18 |
| `finance-users-http.ts` | 9 |
| `tenant-modules-http.ts` | 6 |
| `pos-credentials-http.ts` | 6 |
| `routes/pms-proxy-http.ts` | 2 |
| **Total mounted (approx)** | **~203** |
| `routes/jobs/index.ts` | 5 (unmounted) |

### Split plan (target layout)

```text
apps/api/src/
  index.ts                    ← <200 lines: createApp(), middleware wire-up, serve()
  routes/
    auth/index.ts             ← EXISTS
    tenants.ts                ← lines ~2498–5278 (tenants, provision, SSE, lifecycle)
    organizations.ts          ← org CRUD/access under /tenants/:id/organizations*
    owners.ts                 ← lines ~1965–2306
    internal/
      jobs.ts                 ← lines ~1018–1964 (replace duplicate jobs/index.ts)
    admin.ts                  ← orphan-check, search
    api-keys.ts               ← lines ~2372–2497
    health.ts                 ← /health, /public/*
    pos-proxy-http.ts         ← EXISTS
    pms-proxy-http.ts         ← EXISTS
  license-http.ts             ← EXISTS (licenses + plans)
  finance-users-http.ts       ← EXISTS
  pos-credentials-http.ts     ← EXISTS
  tenant-modules-http.ts      ← EXISTS
```

**`index.ts` imports (lines 1–100):** 35+ imports from `@repo/db/schema`, crypto, drizzle, mail, finance clients, provision trace — another sign the file is doing orchestration + HTTP + domain logic in one place.

---

## Problem 2: Three Package Managers

### 2.1 Map of package managers

| Workspace | Tooling | Evidence |
|-----------|---------|----------|
| **Root (control plane + PMS)** | **pnpm** 9.15.9 + **Turborepo** | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json` `"packageManager": "pnpm@9.15.9"` |
| **POS** `services/posnew` | **npm** workspaces + **Nx** | `package-lock.json` exists; `pnpm-lock.yaml` **missing**; `nx.json` exists; `workspaces: ["apps/*","packages/*"]`; declares `packageManager: pnpm@9.0.5` but lock is npm |
| **Finance** `services/stockix-finance` | **Lerna** (independent) + **pnpm** client | `lerna.json` `"npmClient": "pnpm"`; `package-lock.json` **missing** at finance root |
| **Chat** `services/chatlive` | **Bundler (Ruby)** | `Gemfile` exists |
| **PMS** | In **root pnpm** workspace | `services/pms`, `services/pms/frontend` in `pnpm-workspace.yaml` |

**Root `pnpm-workspace.yaml` does NOT include:** `services/posnew`, `services/stockix-finance`, `services/chatlive`.

### 2.2 Dependency drift (same package, different versions)

| Package | Root / control plane | POS | PMS | Finance server | Notes |
|---------|---------------------|-----|-----|----------------|-------|
| **drizzle-orm** | `^0.45.1` (root, api, db, pms) | — | `^0.45.1` | — | POS does not use Drizzle |
| **jose** | `@repo/auth`: `^5.0.0`; **api**: `6.2.3` | — | — | — | **Major drift** between auth package and API |
| **zod** | `^3.24.1` (root, config, api) | `^3.23.8` | `^3.23.0` | `^3.23.8` | Minor range drift |
| **typescript** | `5.9.2` (root, api, db, pms) | `^5.9.3` | `5.9.2` | `^5.1.3` (server), `^4.8.3` (webapp) | Finance webapp on TS 4.x |
| **Node** | `>=20.9.0` in root `package.json` | — | — | Finance `>=18 <=22` in finance `package.json` | `.nvmrc` **not found** at repo root |

### 2.3 Install / build instructions for new developers

**Documented in `README.md`:**

1. `pnpm install` (root)
2. `pnpm bootstrap:env`
3. `pnpm db:up && pnpm db:wait && pnpm db:migrate && pnpm db:seed:local`
4. **`pnpm dev:pos:install`** → `npm install --prefix services/posnew` (separate npm install)
5. `pnpm dev`

**Not documented in root README as required for full stack:**

- `services/stockix-finance`: Lerna/pnpm install + `pnpm dev` inside finance (optional for tenant Docker path)
- `services/chatlive`: Ruby/bundler setup (prod Docker only for most operators)

**Root `package.json`:** No `postinstall` that installs POS or Finance sub-workspaces. **No single `install:all` script.**

| Question | Answer |
|----------|--------|
| How many separate install commands? | **Minimum 2** (`pnpm install` + `npm install` in posnew); **3+** if developing Finance or Chat locally |
| Documented? | Partially — POS install called out; Finance local dev in README env section only |
| Single script for everything? | **No** |

---

## Problem 3: Worker Coupled to API Source Code

### 3.1 Direct imports from `apps/api`

| File | Line | Import |
|------|------|--------|
| `infra/worker-service/src/worker.ts` | 19 | `processLicenseExpiryFollowUp` from `../../../apps/api/src/license-expire-followup.js` |
| `infra/worker-service/src/provision-runtime.ts` | 35 | `getLicenseExpiry`, `getPlanLimits` from `../../../apps/api/src/license-utils.js` |
| `infra/worker-service/src/provision-runtime.ts` | 36 | `sendPosWelcomeEmail` from `../../../apps/api/src/mail/send.js` |

**No** `from 'apps/api'` path alias in worker source — uses **relative** paths into API tree.

### 3.2 Transitive bundle (via `license-expire-followup`)

`license-expire-followup.ts` imports:

- `license-utils.js`
- `license-finance-sync.js` → Finance + POS license side effects
- `mail/send.js` → nodemailer templates
- `pos-license-sync.js`

**Evidence in built artifact:** `infra/worker-service/.runtime/worker.js` contains inlined sections labeled `license-expire-followup`, `license-utils`, `mail/send`, `license-expired` templates.

### 3.3 Build configuration

| Item | Location | Detail |
|------|----------|--------|
| Worker entry | `apps/api/tsup.worker.config.ts` | `entry: ["../../infra/worker-service/src/worker.ts"]` |
| Output | `infra/worker-service/.runtime/worker.js` | ESM bundle |
| Bundled | `@repo/*`, `jose` | `noExternal: [/^@repo\//, "jose"]` |
| External | `nodemailer` | Comment: listed in root `package.json` for runtime |
| `infra/worker-service/package.json` | `{ "type": "module" }` only | **No** own build script — API package owns tsup |

Root scripts:

- `pnpm infra:worker:build` → `pnpm --filter api exec tsup --config tsup.worker.config.ts`
- `pnpm infra:worker:run` → `node infra/worker-service/.runtime/worker.js`

### 3.4 Shared concerns worker needs (today pulled from API)

| Concern | API files | Used by worker |
|---------|-----------|----------------|
| License expiry follow-up | `license-expire-followup.ts` | `worker.ts` scan loop |
| Plan limits / expiry | `license-utils.ts` | `provision-runtime.ts` |
| POS welcome email | `mail/send.ts` | `provision-runtime.ts` |
| (transitive) Finance license sync | `license-finance-sync.ts` | via expire follow-up |
| (transitive) POS license suspend | `pos-license-sync.ts` | via expire follow-up |

Worker **also** uses correctly shared packages: `@repo/config`, `@repo/db`, `@repo/db/schema`, `drizzle-orm`.

### 3.5 Proposed `packages/provisioning` (or `packages/platform-worker-shared`)

| Module | Contents |
|--------|----------|
| `mail` | `sendPosWelcomeEmail`, license email helpers (from `apps/api/src/mail/`) |
| `license` | `getPlanLimits`, `getLicenseExpiry`, `processLicenseExpiryFollowUp`, `insertLicenseHistory` |
| `contracts` | Job payload types shared with API internal routes |
| `clients` | Optional: thin Finance internal client if duplicated |

**57** TypeScript files under `infra/worker-service/` (provision domain is already well-factored); coupling is specifically **API application layer** imports.

---

## Problem 4: PMS on Shared Postgres

### 4.1 Schema footprint

| Metric | Value | Evidence |
|--------|-------|----------|
| **PMS table exports** | **18** | `grep "export const pms"` in `packages/db/src/schema.ts` |
| **Migrations mentioning PMS** | 4 files | `0029_pms_tables.sql` (103 lines), `0035_pms_upgrade.sql`, `0037_pms_schema_upgrade.sql`, `0038_pms_guest_forms.sql` |
| **FK to control plane** | Yes | e.g. `pms_properties.tenant_id` → `tenants.id` (`schema.ts` ~483–485) |

**PMS tables (from schema exports):**  
`pmsProperties`, `pmsRooms`, `pmsGuests`, `pmsBookings`, `pmsPayments`, `pmsIcalChannels`, `pmsCalendarEvents`, `pmsSyncLogs`, `pmsDateOverrides`, `pmsStaff`, `pmsCleaners`, `pmsCleanerAssignments`, `pmsCleaningTasks`, `pmsPropertyManagers`, `pmsPropertyManagerInvites`, `pmsMessageTemplates`, `pmsGuestFormTemplates`, `pmsGuestFormSubmissions`.

### 4.2 How PMS uses the database

| Check | Result | Evidence |
|-------|--------|----------|
| PMS imports `@repo/db` | Yes | `services/pms/src/db.ts` → `createDb` |
| Drizzle query usages in `services/pms/src` | **~119** matches | `db.`, `.select`, `.insert`, etc. across route files |
| SQL **transactions** (`db.transaction`) | **None found** | Only `transactionId` field on payments (unrelated) |
| Queries **control plane** tables | **`tenantDeployments` only** | `services/pms/src/lib/finance-sync.ts` lines 1–37 — reads Finance IDs for bridge |
| Joins to `owners` / `licenses` / `plans` | **None found** in PMS src |

**`tenantId` scoping:** **~117** references across PMS route/lib files — tenant scoping is pervasive in routes (via `_utils.ts` `tenantId(c)` pattern).

### 4.3 Data volume / background load risk

| Risk area | Detail |
|-----------|--------|
| High-growth tables | `pms_bookings`, `pms_calendar_events`, `pms_sync_logs`, `pms_guests` (inferred from domain) |
| Background job | **`startIcalSyncJob`** — `setInterval` in `services/pms/src/jobs/ical-sync.ts` line 29; calls `syncAllTenants(db)` on **`pmsConfig.icalSyncIntervalMs`** |
| Finance bridge | `lib/finance-sync.ts` writes to Finance HTTP using `tenantDeployments` — adds cross-service load, not extra DB tables |

**Connection pool:** `packages/db/src/index.ts` uses `postgres(connectionString)` with **default** postgres.js pool — **no** explicit `max` documented in repo.

### 4.4 Isolation effort estimate

| Question | Answer |
|----------|--------|
| Tables to move | **18** PMS tables (+ indexes/FKs); must keep or replace FK to `tenants` |
| Queries control plane? | **Minimal** — `tenantDeployments` for Finance sync; schema FK to `tenants` |
| App changes | New `DATABASE_URL` for PMS, duplicate `createDb` or PMS-owned schema package, migrate data |
| Difficulty | **Medium–high** — FK coupling to `tenants` means true isolation needs **tenant registry API** or shared read-only `tenants` slice, not a dumb DB split |
| RLS alternative | **Lower effort** — Postgres RLS on `pms_*` + separate DB role; not implemented today |

---

## Problem 5: Stale Documentation References

### 5.1 `saas-dash` references

| Location | Count / note |
|----------|----------------|
| `services/posnew/POS_ARCHITECTURE_AUDIT.md` | **5** matches — lists `saas-dash` as active app |
| `services/posnew/mdfiles/*.md` | **Many** (`worfkflow.md`, `uiux.md`, `stocktodo.md`, `saasowner2.md`, …) |
| `services/posnew/package-lock.json` | Stale workspace entry `"apps/saas-dash"` |
| `docs/PLATFORM_REFERENCE.md` | Correctly states **removed** / migrated |
| `docs/ARCHITECTURE.md` | States absent |

**Filesystem:**

```text
services/posnew/apps/
  pos-backend
  pos-frontend2
```

**`saas-dash`:** **CORRECTLY DELETED** — docs/lockfile still reference it.

### 5.2 Other documentation drift

| Topic | Finding |
|-------|---------|
| **`routes/jobs/index.ts`** | Mentioned in `docs/ARCHITECTURE.md` as unmounted; **not** mentioned in `README.md` or `PLATFORM_REFERENCE.md` |
| **Port 3010 (old saas-dash)** | **No** matches in `docs/` or `README.md` |
| **`pmsfull` as active** | `docs/PLATFORM_REFERENCE.md` correctly marks **legacy / not integrated**; `docs/ARCHITECTURE.md` agrees |
| **`PROVISION_MODULE_GATING` default** | **Doc drift:** `docs/PROVISIONING_REFERENCE.md` describes local default `=0`; **code** in `packages/config/src/index.ts` lines 525–526: `enabled` when `!== "0"` → **unset env = gating ON**. `.env.example` has `PROVISION_MODULE_GATING=1` |

### 5.3 Port references (`README.md` vs config)

| Service | README default | Notes |
|---------|----------------|-------|
| Dashboard | `:3000` | Matches `DASHBOARD_PORT` / dev script |
| API | `:4000` | Matches `PORT` |
| PMS API | `:3003` | Matches `PMS_PORT` |
| PMS tenant UI | `:3004` | Matches `PMS_FRONTEND_PORT` |
| POS API | `:8010` | Documented |
| POS UI | `:3001` | Documented |
| Finance vs API port clash | Documented in `PLATFORM_REFERENCE.md` | Same **4000** in different contexts — still a footgun |

---

## Cross-problem priority matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Extract `index.ts` tenant + internal job blocks | Large | Maintainability, testability |
| P0 | Delete or mount `routes/jobs/index.ts` | Small | Remove duplicate dead code |
| P1 | Create `packages/platform-shared` for worker/API mail + license | Medium | Break worker↔API coupling |
| P1 | Document `install:all` (pnpm + pos npm) | Small | Onboarding |
| P2 | Align `jose` versions (auth package vs api) | Small | Security/consistency |
| P2 | Update POS `mdfiles/` + `POS_ARCHITECTURE_AUDIT.md` for saas-dash removal | Medium | Doc hygiene |
| P3 | PMS DB isolation or RLS | Large | Scale / blast radius |
| P3 | Fix PROVISION_MODULE_GATING docs vs `.env.example` | Small | Operator confusion |

---

## Files referenced (evidence index)

| Path | Role in audit |
|------|----------------|
| `apps/api/src/index.ts` | Problem 1 god file |
| `apps/api/src/routes/jobs/index.ts` | Problem 1 dead duplicate |
| `apps/api/tsup.worker.config.ts` | Problem 3 worker build |
| `infra/worker-service/src/worker.ts` | Problem 3 imports |
| `infra/worker-service/src/provision-runtime.ts` | Problem 3 imports |
| `pnpm-workspace.yaml` | Problem 2 boundaries |
| `packages/db/src/schema.ts` | Problem 4 PMS tables |
| `services/pms/src/jobs/ical-sync.ts` | Problem 4 background load |
| `services/pms/src/lib/finance-sync.ts` | Problem 4 `tenantDeployments` usage |
| `packages/config/src/index.ts` | Problem 5 module gating default |
| `README.md` | Problem 2 install, Problem 5 ports |

---

*End of audit. No repository source files were modified.*
