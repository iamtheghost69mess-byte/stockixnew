# Stockix Platform — Architecture & Build Reference

Single source of truth for: what we built, how it works, and decisions made.

**Last consolidated:** 2026-05-24  
**Supersedes:** `ARCHITECTURE_AUDIT.md`, `PLATFORM_AUDIT.md`, `REBUILD_VERIFICATION_REPORT.md`, `MASTER_AUDIT.md`, `IMPLEMENTATION_PLAN.md`, `architecutreimprove.md`, `explain2.md`, `VERIFICATION_REPORT.md`

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Architecture Decisions (final)](#2-architecture-decisions-final)
3. [Service Map](#3-service-map)
4. [Module System](#4-module-system)
5. [Build History (phases completed)](#5-build-history-phases-completed)
6. [Multi-Organization Architecture](#6-multi-organization-architecture)
7. [Finance Product Roadmap (fork gaps)](#7-finance-product-roadmap-fork-gaps)
8. [Known Improvements & Open Questions](#8-known-improvements--open-questions)
9. [Production Readiness Summary](#9-production-readiness-summary)

---

## 1. Platform Overview

Stockix is a **multi-tenant SaaS control plane** that provisions and operates product stacks per customer tenant:

| Layer | Components |
|-------|------------|
| **Control plane** | `apps/api` (Hono), `apps/dashboard` (Next.js 16), `packages/db` (Postgres/Drizzle), `infra/worker-service` |
| **Tenant runtimes** | Stockix Finance (Bigcapital fork), POS (`services/posnew`), PMS (`services/pms`), Chatwoot (shared prod stack) |
| **Orchestration** | Async `tenant.provision` jobs → Docker Compose per module → Traefik dynamic routes |

### Executive summary (current state)

- **Finance-first provisioning:** Fully wired — tenant stack, license sync, Finance user admin, impersonation, sub-organizations.
- **Multi-product rebuild (May 2026):** `@repo/auth` product JWT, `tenants.modules` / `licenses.modules`, POS/PMS proxies, Chatwoot account provisioning, module-gated stacks (`PROVISION_MODULE_GATING`).
- **POS control plane:** Legacy `saas-dash` removed; operators use main dashboard + `/api/pos/*` BFF proxy.
- **POS + Finance bridge:** Async BullMQ sync exists; auto-wire at provision for `accounting+pos` (see [INTEGRATION_REFERENCE.md](./INTEGRATION_REFERENCE.md)).
- **Production-ready:** Code + automated tests green for merged platform; live staging sign-off still required before cutover.

### Monorepo structure

| Item | Value |
|------|-------|
| Type | **Turborepo** (`turbo.json`, turbo ^2.9.7) |
| Package manager | **pnpm** 9.15.9 |
| Node | `>=20.9.0` (root); Finance allows `>=18 <=22` |
| TypeScript | 5.9.2 at root; presets in `packages/typescript-config` |
| pnpm workspaces | `apps/*`, `packages/*`, `services/pms`, `services/pms/frontend` |
| Finance sub-repo | `services/stockix-finance` — **Lerna monorepo**, not in root `pnpm-workspace.yaml` |

### Turbo pipelines

| Task | Behavior |
|------|----------|
| `build` | Depends on `^build`; outputs `.next/**`, `dist/**` |
| `dev` | Persistent, no cache |
| `lint` | Depends on `^lint` |
| `check-types` | Depends on `^check-types` |

Root scripts orchestrate Postgres + Redis (`db:up`, `db:migrate`), `@repo/auth` build (CJS for POS), worker build/run, and `concurrently` for API + dashboard + worker + **POS stack** (`scripts/dev-pos-stack.mjs`: API **8010**, restaurant UI **3001**). Skip POS with `STOCKIX_DEV_SKIP_POS=1 pnpm dev`. First-time POS deps: `pnpm dev:pos:install`.

---

## 2. Architecture Decisions (final)

| Decision | Why | Status |
|----------|-----|--------|
| **Single control plane** (`apps/api` + `apps/dashboard`) owns tenants, licenses, provisioning | Eliminates duplicate POS `saas-dash` operator UI; one Postgres source of truth | **FINAL** |
| **Finance in separate Lerna monorepo** vendored under `services/stockix-finance` | Upstream Bigcapital fork; isolated NestJS/MySQL tenant DBs | **FINAL** |
| **Per-tenant Docker stacks** for Finance (and POS/PMS when gated) | Strong isolation; worker writes `{TENANT_ENV_ROOT}/{slug}/.env` | **FINAL** |
| **`@repo/auth` product JWT** with `modules[]` claim | Unified license gating across POS, PMS; separate from owner session HMAC | **FINAL** |
| **`PROVISION_MODULE_GATING=0` locally, `=1` in prod** | Safe default: always provision Finance until module-only paths validated | **FINAL** (revisable after staging) |
| **POS staff auth stays POS JWT + PIN**, not Stockix JWT | Stockix JWT verify exists but does not hydrate `req.user`; PIN optimized for floor devices | **FINAL** |
| **Finance webapp UI: incremental Blueprint migration (Option B)** | ~920 Blueprint files; full rewrite 52–78 weeks; shell-first incremental approach | **FINAL** (long-term) |
| **PMS product:** `services/pms` (Hono + Postgres control-plane DB), not legacy `pmsfull` | RentTools/pesan-pms standalone; new PMS integrated with Stockix | **FINAL** |
| **Chatwoot:** shared stack in `infra/prod`, account per tenant with `chat` module | Not embedded in tenant-stack compose | **FINAL** |
| **Async POS→Finance bridge** via BullMQ + internal receipts API | POS owns ingredient inventory; Finance owns financial inventory/GL | **FINAL** |
| **Three-layer env model** (platform / worker-generated tenant / finance local dev) | Root `.env` is not copied wholesale to tenants; worker generates per-slug secrets | **FINAL** — see [ENV_REFERENCE.md](./ENV_REFERENCE.md) |

### POS saas-dash → main dashboard (migration)

| saas-dash area | Main dashboard | Action |
|----------------|----------------|--------|
| Organizations (POS Mongo) | Tenants + Finance orgs (Postgres) | **MIGRATE** — proxy via `/api/pos/*` |
| Devices, metrics, webhooks, flags, jobs | — | **MIGRATE** (ops UI optional) |
| Audits, API keys, impersonation | Partial duplicate | **CONSOLIDATE** to Stockix-native |
| Developers / OpenAPI | — | **SKIP** or external link |

---

## 3. Service Map

| Service | Path | Tech | Port (default) | Purpose | Status |
|---------|------|------|----------------|---------|--------|
| Owner API | `apps/api` | Hono 4, Drizzle/Postgres | 4000 | Tenants, licenses, auth, provisioning, POS/PMS proxies | **Active** |
| Owner Dashboard | `apps/dashboard` | Next.js 16, shadcn/Tailwind 4 | 3000 | Operator UI + BFF `/api/*` | **Active** |
| Worker | `infra/worker-service` | Node/TS (tsup bundle) | — | `tenant.provision`, Traefik, module stacks | **Active** |
| Finance Server | `services/stockix-finance/packages/server` | NestJS 10, MySQL/Knex | 3000 | Tenant accounting API `/api` | **Active** (tenant stack) |
| Finance Webapp | `services/stockix-finance/packages/webapp` | React 18, Vite, Blueprint 4 | 4000 | Tenant accounting UI | **Active** (tenant stack) |
| POS Backend | `services/posnew/apps/pos-backend` | Express, MongoDB, BullMQ | 8010 | Restaurant POS + platform API | **Active** |
| POS Frontend | `services/posnew/apps/pos-frontend2` | Next.js | 3001 | Restaurant UI | **Active** |
| PMS API | `services/pms` | Hono, Drizzle/Postgres | 3003 | Property/booking API | **Active** |
| PMS Frontend | `services/pms/frontend` | Next.js | — | Tenant PMS UI | **Active** |
| Chatwoot | `services/chatlive` (vendored) | Rails | 3200 | Shared chat stack (prod compose) | **Vendored** |
| Legacy PMS | `services/pmsfull/*` | Mixed | — | pesan-pms, RentTools — **not integrated** | **Standalone** |

**Note:** Finance webapp and control-plane API both default to port 4000 in local configs — run in different contexts (tenant stack vs platform).

### Shared packages (control plane)

| Package | Purpose |
|---------|---------|
| `@repo/config` | Root `.env` loading + Zod (`apiConfig`, `dashboardConfig`, `posConfig`, `pmsConfig`, `chatwootConfig`, `moduleGatingConfig`) |
| `@repo/db` | Platform Postgres schema + Drizzle migrations |
| `@repo/auth` | Product JWT sign/verify, module gating middleware |
| `@repo/shared` | Roles, shared constants |
| `@repo/ui` | Minimal shared React (3 primitives); dashboard owns full shadcn set |

### Infra compose files

| Path | Contents |
|------|----------|
| `infra/dev/docker-compose.yml` | Postgres only (port 54330) |
| `infra/prod/docker-compose.yml` | Traefik, postgres, api, dashboard, worker, Chatwoot |
| `infra/tenant-stack/docker-compose.yml` | Per-tenant **Finance** stack |
| `infra/pos-tenant-stack/docker-compose.yml` | Per-tenant POS + `pos-bigcapital-worker` (build: `pnpm pos:images:build`) |
| `infra/pms-tenant-stack/docker-compose.yml` | Per-tenant PMS |

### Pattern inconsistencies (by design today)

| Concern | Control plane | POS | PMS | Finance |
|---------|---------------|-----|-----|---------|
| Auth | Jose session + product JWT | POS JWT + platform JWT | Stockix JWT | Nest JWT + internal secret |
| UI | shadcn + Tailwind 4 | shadcn | shadcn | Blueprint 4 |
| DB | PostgreSQL | MongoDB | PostgreSQL (shared control plane) | MySQL per tenant |

---

## 4. Module System

### Schema

- **`tenants.modules`** — JSON text, default `'["accounting"]'`. Allowed: `accounting`, `pos`, `pms`, `chat`.
- **`licenses.modules`** — same shape; set on generate/provision.
- Migrations: `0027_tenant_modules.sql`, `0028_license_modules.sql`.

### `@repo/auth`

Exports: `verifyStockixToken`, `signStockixToken`, `createHonoAuthMiddleware`, `createExpressAuthMiddleware`, `hasModule`, `requireModule`, types `StockixModule`, `StockixTokenPayload`.

**Issuing:** `apps/api/src/services/auth/stockix-product-token.ts` → `signProductToken`.  
**Validation:** POS `tokenVerification.js` / `verifyStockixJWT.js`; PMS `createHonoAuthMiddleware('pms')`.

### `PROVISION_MODULE_GATING`

```ts
// infra/worker-service/src/module-stacks.ts
export function isModuleGatingEnabled(): boolean {
  return process.env.PROVISION_MODULE_GATING === "1";
}
```

| Value | Behavior |
|-------|----------|
| `0` (local default) | Finance stack always provisioned; POS/PMS/Chat run if in `modules[]` |
| `1` (prod) | Skip Finance when `accounting` ∉ modules; provision only selected stacks |

### Single source of truth verification (rebuild pass)

- [x] Tenant identity: Stockix Postgres only
- [x] License authority: Stockix Postgres (`licenses` + `plans`)
- [x] Product JWT: `@repo/auth` issue/validate
- [x] Module flags: `tenants.modules` + `licenses.modules` only
- [x] Operator dashboard: `apps/dashboard` only (`saas-dash` removed)

---

## 5. Build History (phases completed)

### Bigcapital SaaS gaps (May 2026) — Tasks 1–10

**Status: COMPLETE** (code + automated tests)

| Block | Items | Result |
|-------|-------|--------|
| Auth & Signup | 14 | Pass |
| Setup Wizard | 20 | Pass |
| License System | 24 | Pass |
| LemonSqueezy Removed | 8 | Pass |
| Platform User API | 22 | Pass |
| Organization Number | 9 | Pass |
| Multi-org Switcher | 11 | Pass |
| Sub-org Inheritance | 12 | Pass |
| License UI | 12 | Pass |
| Code Quality | 10 | Pass |
| Integration Connections | 7 | Pass |

**Tests:** `apps/api` 91+ vitest; finance server 21 Jest.  
**Remaining (ops only):** staging/prod migrations, worker redeploy, live E2E per [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md).

### Platform rebuild phases (May 2026)

| Phase | Name | Status | What was built |
|-------|------|--------|----------------|
| 1 | Foundation (auth, modules, JWT) | ✅ | `packages/auth`, `tenants.modules`, migrations 0027–0028, product token issuer |
| 2 | Kill duplicate control plane | ✅ | POS 403 on missing `pos` module; `saas-dash` deleted; POS proxy routes + dashboard pages |
| 3 | PMS service | ✅ | `services/pms`, frontend scaffold, iCal sync job, PMS tenant compose |
| 4 | Chatwoot | ✅ | `chatwoot_account_id`, `chatwoot-provision.ts`, prod compose services |
| 5 | Product-aware stacks | ✅ | `shouldProvisionFinanceStack()`, pos/pms tenant stacks |
| 6 | Final wiring | ✅ | Root `.env.example` multi-product block, production checklist |

**Rebuild verification:** 118 checks, 112 passed, 7 fixed in pass.  
**Tests at rebuild:** API 130 pass; finance 21 pass.

### Production hardening pass (May 2026)

Fixes applied to API security headers, Finance global exception filter, LicenseGuard 60s cache, system DB pool timeouts, process crash handlers.  
**Verdict at time:** Production ready **NO** until finance system/tenant migrations confirmed on prod, Resend SMTP set, worker healthchecks added. See §9.

### Migration system repair (May 2026)

- Root cause: silent `baselineMigrationJournal()` marked migrations applied without running SQL.
- Fix: proper `migrate.ts`, journal entry for `0014_clumsy_dagger`, idempotent `pnpm db:migrate` (31 migrations).
- **Rule:** Never `drizzle-kit push` for prod; never auto-baseline without `STOCKIX_MIGRATION_REPAIR=baseline`.

---

## 6. Multi-Organization Architecture

**Source:** Former `explain2.md` — control-plane multi-org (not Finance internals).

### Model

- Many **`organizations`** rows belong to one customer **`tenants`** row (`organizations.tenant_id` → `tenants.id`, CASCADE).
- Each sub-org gets **own Docker Compose stack** (`stockix-{slug}`) and subdomain `{slug}.{rootDomain}`.
- **Primary org** = first by `created_at` (no `is_primary` column); cannot suspend/delete primary without deleting tenant.

### Provision flow (sub-org)

1. Dashboard `POST /api/tenants/{tenantId}/organizations` → API inserts `organizations` (status `provisioning`) + enqueues `tenant.provision` job with `organizationId`.
2. Worker inserts **hidden** `tenants` row (`slug = org.slug`) for child stack; bootstraps Finance; optional parent settings inheritance.
3. API `POST /internal/jobs/:jobId/complete` sets `organizations.status = active`.

### Billing scope

- Licenses on parent **`tenants.id`**; `licenses.max_organizations` enforced via `plan-limits.ts`.
- No per-organization subscription row.

### Known gaps

1. **`organizations.id` vs Finance `organization-id`:** Job payload includes `organizationId` but worker `ProvisionInput` may not inject it — verify equality in Finance if strict UUID alignment required.
2. **Primary org implicit** (first `created_at`).
3. **Child provision events** may not appear on parent tenant events panel (filters by path tenant id).
4. **No detach/promote** API for child → standalone tenant.

### Dependency map

```
Owner browser → apps/dashboard (BFF) → apps/api (Postgres)
                    ↓ tenant_lifecycle_jobs
              infra/worker-service (docker, Traefik)
                    ↓ HTTP
              Stockix Finance (per-org container)
```

---

## 7. Finance Product Roadmap (fork gaps)

**Source:** Former `accountingmiss.md` — Stockix Finance fork (`services/stockix-finance/`) product gaps, not control-plane.

### Confirmed present (upstream + Stockix)

Double-entry GL, trial balance, P&L, balance sheet, cash flow, AR/AP aging, sales/purchasing, inventory (multi-warehouse, transfers), banking/reconciliation, manual exchange rates, broad import/export, RBAC, multi-tenant DB isolation, Stockix multi-org switcher, control-plane provisioning worker.

### Must build (high level)

| Area | Status |
|------|--------|
| Mandatory provisioning wizard on first login (DB completion flag) | Partial — worker pre-builds org |
| Sub-tenant inherits COA/tax/default accounts | Partial — metadata only via worker |
| Multi-currency reports (manual rates only; disable Open Exchange Rates) | Partial |
| FIFO/LIFO costing (schema hints; runtime AVG only) | Partial |
| Realized/unrealized FX gain/loss (server reports + GL) | Missing (UI shells only) |
| Full WMS (serial/lot, reorder, GRN workflow, bin locations) | Missing |
| Opening balance import (GL + inventory) | Missing |
| Payroll, fixed assets, project costing, approval workflows, 2FA | Missing |

### Development priority (Finance fork)

1. Disable external exchange rate API — manual-only rates.
2. Tenant provisioning wizard — mandatory first login, DB `setup_completed_at`.
3. Extend sub-tenant inheritance (COA template, tax, default accounts).
4. Trial balance multi-currency export.
5. FIFO costing wired to `InventoryComputeCost`.
6. Realized/unrealized FX reports + auto GL entries.

### Technical notes

- **Stack:** NestJS, Objection/Knex, MySQL per tenant, BullMQ, S3-compatible storage.
- **Exchange rates:** `ExchangeRatesService.getLatest()` calls Open Exchange Rates today — must gate to manual-only for product.
- **Costing:** `InventoryComputeCost.service.ts` uses average method only; `TCostMethod` supports FIFO/LIFO in schema.
- **Stockix integration:** Org list via `REACT_APP_STOCKIX_API_URL`; internal API `POST /api/internal/attach-user-to-tenant`; do not rely on `GET organization/all` (not implemented).

### Control-plane overlay gaps (related)

- License sync to finance: implemented via `finance-license.client.ts`.
- Platform user API: implemented (owner dashboard Finance users).
- See [PROVISIONING_REFERENCE.md](./PROVISIONING_REFERENCE.md) for license/plan bugs.

---

## 8. Known Improvements & Open Questions

### From architecture audit

1. Modernize Bigcapital UI in place vs new Next.js tenant app?
2. Paying tenants disrupted by UI migration?
3. Timeline: cosmetic vs full design-system unification?
4. White-label per tenant affecting shadcn tokens?
5. Formik → react-hook-form included in migration scope?
6. Expand `@repo/ui` vs keep finance styling isolated?

### From platform audit (remaining dashboard gaps)

| Feature | Priority |
|---------|----------|
| Unified product entitlements UI on tenant detail | P1 |
| POS devices/metrics/webhooks polish | P1–P2 |
| Chatwoot admin links per tenant | P2 |
| Consolidated audit across products | P3 |

### Recommended build order (short)

1. Decide product boundary (all products in one dashboard vs Finance-only + consoles).
2. POS integration contract — proxy vs unified Postgres model (proxy **done**; org mapping ongoing).
3. Docker images for all tenant products (**done** for Finance/POS/PMS paths).
4. PMS: use `services/pms` (not `pmsfull`).
5. Chatwoot: image + provision job (**done** in prod compose).

### Finance UI migration (Blueprint → shadcn)

- **~920 files** import `@blueprintjs/core`; **VERY HIGH** effort (30–52+ weeks incremental).
- **Recommendation:** Option B — incremental page-by-page; auth/settings first; banking/inventory grids last.

---

## 9. Production Readiness Summary

| Area | Code ready | Go-live ready |
|------|------------|---------------|
| Finance SaaS gaps (Tasks 1–10) | **YES** (128/128 checks) | **YES** after live staging checklist |
| Multi-product rebuild | **YES** (TS + tests green) | **YES** after `db:migrate`, prod secrets, module-gating validation |
| Production hardening report | Partial fixes merged | **NO** until finance CLI migrations on prod, Resend live, worker healthcheck |
| POS + Finance integration | Bridge code **YES** | **YES*** after live burger smoke (*see integration doc) |

### Blocking items before prod cutover (consolidated)

1. `pnpm db:migrate` on control-plane Postgres (migrations through `0030+`).
2. Finance `cli:system:migrate:latest` + `cli:tenants:migrate:latest` on prod MariaDB.
3. `pnpm infra:worker:build` + redeploy worker on staging/prod.
4. `infra/prod/.env` secrets: `MAIL_PASSWORD`, `INTERNAL_API_SECRET`, `CF_DNS_API_TOKEN`, multi-product keys.
5. `PROVISION_MODULE_GATING=1` after validating three module scenarios.
6. Live E2E: signup 403, license 402, Finance users CRUD, POS integration smoke.

### Automated test baseline

| Suite | Result |
|-------|--------|
| `apps/api` (vitest) | 130–141 pass (varies by pass) |
| Finance server (jest) | 21 pass |
| POS backend | 99–102 pass |

---

## Appendix — Key file references

| Area | Path |
|------|------|
| Tenant schema | `packages/db/src/schema.ts` |
| Provision runtime | `infra/worker-service/src/provision-runtime.ts` |
| Module stacks | `infra/worker-service/src/module-stacks.ts` |
| Product JWT | `apps/api/src/services/auth/stockix-product-token.ts`, `packages/auth/src/index.ts` |
| License HTTP | `apps/api/src/license-http.ts` |
| Finance license sync | `apps/api/src/finance-license.client.ts` |
| Dashboard tenant wizard | `apps/dashboard/components/tenant-create-wizard.tsx` |
| Org provision | `apps/api/src/org-provision.ts`, `infra/worker-service/src/org-provision-runtime.ts` |
| Module provision test | `pnpm provision:modules` — see [PROVISIONING_REFERENCE.md](./PROVISIONING_REFERENCE.md) |
| POS image prebuild | `pnpm pos:images:build` → `scripts/build-pos-tenant-images.mjs` |
