# Platform Audit Report

**Date:** Friday, May 22, 2026  
**Codebase root:** `C:\Users\Jad\Desktop\stokcix\stockixnew`  
**Method:** Read-only inspection of source, `package.json`, Dockerfiles, and compose files (no modifications).

---

## Executive Summary

Stockix has a **working multi-tenant control plane** centered on **Finance**: a Hono API (`apps/api`), Next.js owner dashboard (`apps/dashboard`), Postgres schema (`packages/db`), and a worker that provisions per-tenant Docker stacks from `infra/tenant-stack/docker-compose.yml` (Finance server, webapp, MySQL, Mongo, Redis, nginx). License/plan management, owner RBAC, audit log, API keys, tenant lifecycle (provision/suspend/impersonate), and Finance user admin are **implemented and wired**.

**POS** is a large, separate Nx monorepo (`services/posnew`) with its **own** platform API on Express/MongoDB and a **duplicate** owner UI (`apps/saas-dash`) that must be removed after feature migration. **PMS** is **not** merged: two unrelated apps live under `services/pmsfull` with no Stockix hooks. **Chatwoot** exists as a full Rails tree under `services/chatlive` but is **not connected** to provisioning or the control-plane API.

The **biggest gap** is a single owner dashboard and API surface for POS/PMS/Chatwoot; today only Finance is orchestrated end-to-end. **Production-ready for the first Finance tenant:** largely yes. **Production-ready as the full multi-product platform described in the audit brief:** no.

---

## 1. Services Inventory

| Service | Location | Framework | DB | Auth | Docker? | State |
|---------|----------|-----------|-----|------|---------|-------|
| Owner API | `apps/api` | Hono 4 | PostgreSQL (Drizzle) | Jose session JWT + cookies; `PLATFORM_API_SECRET` / `WORKER_SECRET` gates | ✅ `apps/api/Dockerfile`; in `infra/prod` | **Active** — Finance provisioning, licenses, tenants |
| Owner Dashboard | `apps/dashboard` | Next.js 16 | — (BFF via `/api/*` routes) | HTTP-only session cookie via API | ✅ `apps/dashboard/Dockerfile`; in `infra/prod` | **Active** — primary owner UI |
| Worker | `infra/worker-service` | Node/TS | Uses control-plane Postgres | `WORKER_SECRET` | ✅ `infra/worker-service/Dockerfile`; in `infra/prod` | **Active** — `tenant.provision` jobs |
| POS Backend | `services/posnew/apps/pos-backend` | Express 4 | MongoDB (+ Redis/BullMQ) | Own JWT (`jsonwebtoken`) + platform API keys | ✅ `apps/pos-backend/Dockerfile`; `docker-compose.production.yml` (port **8010**) | **Active** — tenant POS runtime + **separate** `/api/platform/v1` |
| POS Frontend | `services/posnew/apps/pos-frontend2` | Next.js (`studio-admin`) | — | POS session/cookies | ❌ No Dockerfile in repo | **Active** — restaurant UI |
| POS saas-dash | `services/posnew/apps/saas-dash` | Next.js 16 (port **3010**) | — | POS platform JWT (via `/api/platform/v1`) | ❌ | **Active but REMOVE** — duplicate owner UI |
| PMS (pesan-pms) | `services/pmsfull/pesan-pms` | Next.js 15 | SQLite (`better-sqlite3`) | better-auth (+ passkeys) | ✅ `Dockerfile` + `docker-compose.yml` (standalone) | **Standalone** — not integrated |
| PMS (RentTools) | `services/pmsfull/RentTools.io` | Next.js 16 | PostgreSQL (Prisma) | App auth (separate product) | ❌ deploy scripts/docs only | **Standalone** — iCal/channel sync STR tool |
| Finance Server | `services/stockix-finance/packages/server` | NestJS | MySQL per tenant + system DB | Passport local + JWT; internal `x-internal-secret` | ✅ `packages/server/Dockerfile` | **Active** — provisioned in tenant stack |
| Finance Webapp | `services/stockix-finance/packages/webapp` | React/Vite + Blueprint | — | JWT via Finance API | ✅ `packages/webapp/Dockerfile` | **Active** — provisioned in tenant stack |
| Chatwoot | `services/chatlive` | Rails (Chatwoot) | PostgreSQL (typical) | Chatwoot native | ✅ `docker/Dockerfile` (upstream) | **Vendored source** — **not wired** to Stockix |

---

## 2. Main Dashboard — What Exists

**Stack:** Next.js 16, Tailwind 4, shadcn 4, `@base-ui/react`, `@repo/ui` (minimal), local `components/ui/*` (full shadcn set). Dev port **3000**.

**Route map** (`apps/dashboard/app/**/page.tsx`):

| Route | Purpose | APIs (via dashboard BFF `/api/*` → `apps/api`) | Data shown |
|-------|---------|-----------------------------------------------|------------|
| `(auth)/login` | Owner login | `POST /api/auth/login` → API `/auth/login` | Credentials, MFA challenge |
| `(auth)/forgot-password` | Reset request | `POST /api/auth/password/forgot` | Email |
| `(auth)/reset-password` | Reset with token | `POST /api/auth/password/reset` | New password |
| `(auth)/accept-invite` | Accept owner invite | Invite accept on API | Invite token |
| `(dashboard)/` | Overview KPIs | `GET /api/tenants`, `GET /api/licenses/analytics` | Tenant/license counts, expiring licenses |
| `(dashboard)/tenants` | Tenant directory | `GET /api/tenants`, provision poll/stream | List, create wizard, export |
| `(dashboard)/tenants/[id]` | Tenant detail | `GET/PATCH/DELETE /api/tenants/:id`, licenses, events, `retry-provision`, `suspend`, `reactivate`, `impersonate`, `provision-stop` | Deployment status, licenses, finance users panel, org access |
| `(dashboard)/tenants/[id]/organizations/[orgId]` | Sub-org under tenant | Tenant org CRUD on API | Org name, status, ports/URLs |
| `(dashboard)/licenses` | License list + analytics | `GET /api/licenses`, `GET /api/licenses/analytics`, `GET /api/plans` | Keys, status, filters, CSV export |
| `(dashboard)/licenses/[id]` | License detail | `GET/PATCH /api/licenses/:id`, history, extend, revoke, deactivate activation, blacklist fingerprint | Plan limits, activations, audit trail |
| `(dashboard)/plans` | Plan catalog (admin) | `GET/POST /api/plans`, `PATCH/DELETE /api/plans/:id` | Plan limits, pricing metadata |
| `(dashboard)/owners` | Team & access | `GET/POST/PATCH/DELETE /api/owners`, invite | Platform operators, roles |
| `(dashboard)/audit-log` | Platform audit | `GET /api/audit-log` | Admin actions |
| `(dashboard)/api-keys` | Platform API keys | `GET/POST/DELETE /api/api-keys` | Key metadata, scopes |
| `(dashboard)/settings` | Security & settings | Auth MFA routes (`/api/auth/mfa/*`, reconfirm) | MFA setup, session security |
| `dashboard/page.tsx` | Legacy redirect route | — | Redirect |

**Also:** `components/tenant-users-panel.tsx` — Finance users per tenant via `GET/POST/PATCH/DELETE /api/tenants/:tenantId/users/*` (proxies to Finance internal API through `apps/api`).

**Not present in main dashboard:** POS organizations, POS devices, POS metrics/reports, webhooks, feature flags, BullMQ job console, platform notifications, POS global users, compliance deletion jobs, developers/OpenAPI browser.

---

## 3. Main API (`apps/api`) — Routes & Gaps

**Stack:** Hono, `jose` for tokens, Drizzle/Postgres, `@repo/config`, `@repo/db`.

**Auth:** `buildAuthRoutes` mounted at `/auth` — login, MFA, logout, invite accept, password reset, session validate. Middleware: `PLATFORM_API_SECRET` bearer for server-to-server; owner **session cookie** for dashboard; `WORKER_SECRET` for `/internal/jobs/*`.

**Route groups (verified in `src/index.ts`, `license-http.ts`, `finance-users-http.ts`, `routes/audit-log.ts`):**

| Group | Examples | Provisions / connects |
|-------|----------|------------------------|
| Health | `GET /health` | — |
| Public | `GET /public/tenant-orgs/:tenantId` | Tenant org list for external consumers |
| Internal jobs | `POST /internal/jobs/claim`, heartbeat, complete, fail, requeue, dead | Worker ↔ control plane |
| Internal org patch | `PATCH /internal/organizations/:controlPlaneOrgId` | Worker updates org record |
| Owners | `GET/POST/PATCH/DELETE /owners`, invite | Platform operators |
| Admin | `GET /admin/orphan-check` | Ops |
| Audit | `GET /audit-log` | Postgres `admin_audit_log` |
| API keys | `GET/POST/DELETE /api-keys` | Platform keys |
| Tenants | CRUD, export CSV, provision status/stream/stop, retry, suspend, reactivate, stop, impersonate, events | Enqueues `tenant.provision` jobs; Docker compose project per tenant |
| Tenant orgs | `GET/POST/PATCH/DELETE /tenants/:id/organizations` | Sub-organizations (Finance stack scoped) |
| Org access | Support-agent scoped org access | `owner_organization_access` |
| Search | `GET /search` | Tenants, licenses, owners |
| Plans | `GET/POST/PATCH/DELETE /plans` | Plan catalog |
| Licenses | generate, list, analytics, export, activate, verify-offline, assign, extend, revoke, activations, blacklist | Sync to Finance via `finance-license.client.ts` |
| Finance users | `GET/POST/PATCH/DELETE /tenants/:tenantId/users/*` | Proxies to Finance internal HTTP on tenant `internalPort` |

**Service connections in API code:**

- **Finance:** Strong — license sync, user CRUD, impersonation URL to Finance webapp, provisioning via worker.
- **POS / PMS / Chatwoot:** **No routes, clients, or env wiring found** in `apps/api/src`.

**Missing (relative to platform goal):**

- PMS provision/deprovision routes and schema
- POS platform proxy routes (orgs, devices, metrics, webhooks, flags)
- Chatwoot account provisioning
- Unified “product entitlements” on tenant (which of POS/PMS/Chat/Finance is enabled)

---

## 4. POS saas-dash — Migration Plan

**Location:** `services/posnew/apps/saas-dash` (Next.js, `src/app/`).  
**API base:** `platformApiBaseUrl()` → **`/api/platform/v1`** on **POS backend** (default `http://localhost:8010`), **not** Stockix `apps/api`.

**Pages (19 routes):**

| Page | Feature | Calls (POS platform API) |
|------|---------|---------------------------|
| `login` | Platform operator login | `POST /auth/login`, refresh |
| `/` | Overview metrics | `/metrics/summary`, `/metrics/kpis`, `/metrics/analytics` |
| `organizations` | List/create POS orgs | `GET/POST /organizations`, health-summary |
| `organizations/[id]` | Org detail, license dates, lifecycle | `GET/PATCH/DELETE /organizations/:id`, provisioning retry, observability |
| `users`, `users/[id]` | Global POS users | `/users/global` |
| `devices` | Terminal device approval | `/devices`, approve/revoke/nickname |
| `jobs`, `jobs/[queue]/[id]` | BullMQ job admin | `/jobs` |
| `notifications` | Operator notifications | `/notifications` |
| `reports` | Control-plane metrics reports | `/metrics/*` (explicitly not tenant financial reports) |
| `audits` | Platform audit log | `/audits` |
| `webhooks` | Webhook endpoints + outbox | `/webhooks/*` |
| `compliance` | Export/deletion requests | `/compliance/*` |
| `api-keys` | Platform API keys | `/auth/api-keys` |
| `developers` | OpenAPI / dev tools | `/openapi.json` |
| `flags` | Feature flags | `/flags` |
| `system` | Owner system settings | `/system-settings` |
| `team` | Invitations | `/invitations` |
| `unauthorized` | RBAC gate | — |

Navigation source: `services/posnew/apps/saas-dash/src/navigation/platform-sidebar-items.ts`.

### saas-dash vs main dashboard — feature matrix

| saas-dash feature | In main dashboard? | Action needed |
|-------------------|-------------------|---------------|
| Organization list | ❌ (Stockix **tenants**, not POS Mongo orgs) | **MIGRATE** — needs POS API bridge or unified tenant model |
| Organization create | ❌ | **MIGRATE** |
| Organization detail + license window on org | ⚠️ Partial (Stockix licenses are tenant-scoped, different model) | **MIGRATE** — align semantics |
| Org provisioning status / retry | ⚠️ Partial (Finance docker provision only) | **MIGRATE** for POS stack when POS is provisioned |
| Global Users (POS) | ⚠️ Partial (Finance users per tenant only) | **MIGRATE** |
| Devices (POS terminals) | ❌ | **MIGRATE** |
| Jobs (queue admin) | ❌ | **MIGRATE** (or **SKIP** if ops-only via CLI) |
| Notifications | ❌ | **MIGRATE** |
| Reports (platform metrics) | ⚠️ Partial (home KPIs differ) | **MIGRATE** |
| Audits | ✅ (audit-log page) | **DUPLICATE** — merge sources or **SKIP** POS audit if retiring POS dash |
| Webhooks | ❌ | **MIGRATE** |
| Compliance export/deletion | ⚠️ Partial (tenant CSV export) | **MIGRATE** |
| API keys | ✅ | **DUPLICATE** — Stockix keys ≠ POS platform keys; consolidate policy |
| Developers / OpenAPI | ❌ | **SKIP** (low) or link externally |
| Feature flags | ❌ | **MIGRATE** or **SKIP** |
| System settings | ⚠️ Partial (`/settings` MFA only) | **MIGRATE** |
| Team / invitations | ⚠️ Partial (owner invites) | **MIGRATE** |
| Overview metrics/KPIs | ⚠️ Partial | **MIGRATE** POS-specific cards |
| Impersonation | ✅ (Finance tenant impersonate) | **DUPLICATE** — product-specific |
| Login/session | ✅ (separate auth realm) | **REPLACE** with Stockix owner session when retired |

### Features to MIGRATE (priority)

1. **POS Organizations** → `apps/dashboard` section “POS tenants” proxying `platformV1` or new `apps/api` routes.
2. **Devices** → new dashboard page + API proxy.
3. **POS metrics/reports** → extend overview or product tab.
4. **Webhooks / compliance** → settings or tenant detail tabs (if POS stays separate service).
5. **Jobs / notifications** → ops section (optional MVP).

### Features to SKIP

- **Developers** page — can link to POS OpenAPI in docs.
- **Duplicate API keys/audits** — keep Stockix-native; deprecate POS platform keys when single API.

### Features already covered (no action)

- Owner authentication concept (both have login/MFA patterns; consolidate to Stockix).
- High-level “operator dashboard” shell (main dashboard already has sidebar, RBAC).

### POS backend — tenant/license ownership

**Verified:** POS backend implements full **platform** org/license lifecycle in MongoDB (`platformOrgController.js`, `platformV1Route.js`) — **separate from Stockix Postgres**. Includes:

- Organizations with `licenseStartsAt` / `licenseEndsAt`, entitlements, lifecycle, subdomain (`pos.zerox.cloud` suffix in saas-dash)
- Metrics, webhooks, flags, impersonation, devices, global users, audits

**Delegate to Stockix API (target state):**

- New Stockix routes that call POS platform API with service credentials, **or** move org/license authority into `packages/db` and shrink POS platform API to runtime-only.

**Ports:** default from `config.port` (8010 in production compose). **Docker:** `services/posnew/apps/pos-backend/Dockerfile` exists.

---

## 5. PMS (`services/pmsfull`)

**Not merged.** Two products in one folder:

| App | Purpose | DB | Auth | Docker | Stockix link |
|-----|---------|-----|------|--------|--------------|
| `pesan-pms` | Hotel/property PMS (bookings, rooms, guests, payments) | SQLite + Drizzle | better-auth | ✅ Dockerfile | **None** |
| `RentTools.io` | Short-term rental **iCal sync** (Airbnb, Booking, etc.) | Postgres + Prisma | Own Next auth | Deploy docs | **None** |

**pesan-pms pages (sample):** dashboard, bookings, rooms, guests, properties, payments, reports, settings — classic PMS UI (`app/dashboard/**`).

**RentTools:** iCal/channel sync is **core** (per README); no grep hits under `pmsfull` for `ical` in TS from this audit path — feature lives in RentTools `src/`.

**Missing for platform:**

- Control-plane tenant record for PMS
- Provision job in worker
- JWT/license handshake with `apps/api`
- Owner dashboard pages for PMS tenants

---

## 6. Chatwoot (`services/chatlive`)

- **Content:** Full Chatwoot Rails application (standard directories: `app`, `config`, `docker`, `spec`).
- **White-label:** No Stockix-specific brand env found in repo grep for `chatwoot|chatlive` outside `services/chatlive`.
- **Provisioning:** **Not referenced** in `apps/api`, `infra/worker-service`, or `infra/tenant-stack`.
- **Deployment model:** Upstream `docker/Dockerfile` — typical **Docker image** deployment, not embedded in Next.js.
- **Tenant auto-create:** **Not implemented** in Stockix control plane.

---

## 7. Stockix Finance (`services/stockix-finance`)

**Dockerfiles (verified):**

- `packages/server/Dockerfile` (app + migration targets)
- `packages/webapp/Dockerfile`
- `docker/mariadb`, `redis`, `nginx`, `migration` — supporting images

**Tenant stack (`infra/tenant-stack/docker-compose.yml`):** nginx, webapp, server, database_migration, mysql, mongo, redis — **Finance only**.

**Internal API modules (verified under `packages/server/src/modules/Internal/`):**

- `Internal.controller.ts`, `Internal.module.ts`
- `InternalLicense.controller.ts`
- `InternalOrg.controller.ts`
- `InternalProvision.controller.ts` (`POST /internal/provision-user`)
- `InternalUsers.controller.ts`
- `guards/InternalSecret.guard.ts`

**License module:** `packages/server/src/modules/License/` — `LicenseGuard.middleware.ts`, `License.service.ts`.

**Provisioning E2E:** Worker `provision-runtime.ts` runs compose against `STOCKIX_TENANT_APP_ROOT`, syncs license via `sync-finance-license.ts`. API completes jobs and triggers Finance license sync. **Status: implemented for Finance.**

**Gaps:** None critical for Finance-only MVP; multi-product billing on Finance license fields is documented in `finance-license.client.ts` comments.

---

## 8. Infra

| Path | Contents |
|------|----------|
| `infra/dev/docker-compose.yml` | **Postgres only** (port 54330) — control-plane DB |
| `infra/prod/docker-compose.yml` | Traefik, socket-proxy, **postgres**, **api**, **dashboard**, **worker** — full control plane |
| `infra/tenant-stack/docker-compose.yml` | Per-tenant **Finance** stack |
| `infra/worker-service` | Job runner, Docker compose provision, Traefik dynamic routes |

**Worker provisions:** Finance tenant Docker project (not POS/PMS/Chatwoot).

**POS in tenant stack:** ❌  
**PMS in tenant stack:** ❌  
**Chatwoot in tenant stack:** ❌  

**POS production compose:** `services/posnew/docker-compose.production.yml` — `pos-backend` + `platform-worker` + redis (separate from Stockix infra).

---

## 9. Shared Packages

| Package | Role | Notes |
|---------|------|-------|
| `packages/db` | Control-plane Postgres schema | Tables: `owners`, `tenants`, `organizations`, `tenant_deployments`, `licenses`, `plans`, `license_activations`, jobs, audit, api_keys, etc. **No PMS/POS tables.** |
| `packages/config` | Central env (`apiConfig`, secrets, CORS, mail) | Finance/tenant paths; **no POS/PMS-specific env** found in `src/index.ts` |
| `packages/shared` | Roles, shared types | Used by API + dashboard |
| `packages/ui` | **3 components** (`button`, `card`, `code`) | Dashboard uses its own extensive `components/ui` |
| `packages/eslint-config`, `typescript-config` | Tooling | — |

---

## 10. Pattern Inconsistencies

| Concern | Main Dashboard / API | POS | PMS (pesan-pms) | Finance |
|---------|---------------------|-----|-----------------|---------|
| Auth method | Jose session cookie + `PLATFORM_API_SECRET` | JWT + platform API keys | better-auth (SQLite) | Nest JWT + Passport + internal secret |
| UI library | shadcn + Tailwind 4 | shadcn + Tailwind 4 (`@restaurant-pos/ui`) | shadcn/Radix + Tailwind 3 | BlueprintJS 4 |
| Backend framework | Hono | Express | Next API routes | NestJS |
| Database | PostgreSQL | MongoDB | SQLite | MySQL (+ Mongo in stack) |
| JWT shared? | ❌ — separate secrets per product | ❌ | ❌ | ❌ |
| Owner dashboard | `apps/dashboard` | `saas-dash` (**duplicate**) | Own app UI | Tenant webapp (customer-facing) |

---

## 11. What Each Service Needs

### `apps/api`

- ✅ Done: Tenants, orgs, licenses, plans, owners, audit, API keys, auth/MFA, worker jobs, Finance user proxy, license→Finance sync, impersonation, search
- ❌ Missing: POS/PMS/Chatwoot routes; product flags on tenant; cross-product provision jobs
- ⚠️ Improve: Single API surface for migrated saas-dash features; document POS vs Stockix tenant ID mapping

### `apps/dashboard`

- ✅ Done: Full Finance operator UX, licenses/plans, tenant wizard, finance users, impersonation, audit, API keys, MFA settings
- ❌ Missing: POS orgs/devices/metrics/webhooks/flags/jobs/notifications; PMS tenant views; Chatwoot admin
- ⚠️ Improve: Product switcher or unified tenant detail tabs per product

### `services/posnew`

- ✅ Done: Mature POS runtime + platform API + saas-dash + production Docker for backend
- ❌ Missing: Integration with Stockix control plane; Dockerfile for frontend/saas-dash in Stockix infra
- ⚠️ Improve: Deprecate platform org/license in Mongo when Stockix owns entitlements
- 🗑️ Remove: `apps/saas-dash` after migration; redundant platform owner UX

### `services/pmsfull`

- ✅ Done: Two standalone PMS/codebases with Docker (pesan-pms)
- ❌ Missing: Merge decision, Stockix schema, provisioning, auth bridge, dashboard pages
- ⚠️ Improve: Clarify whether RentTools iCal sync is the “PMS” product or pesan-pms is

### `services/chatlive`

- ✅ Done: Vendored Chatwoot source + Docker patterns
- ❌ Missing: All Stockix wiring (provision, white-label env, dashboard links)
- ⚠️ Improve: Submodule/fork strategy and image publish pipeline

### `services/stockix-finance`

- ✅ Done: Internal APIs, license guard, Docker, tenant stack
- ❌ Missing: N/A for Finance MVP
- ⚠️ Improve: Keep internal API contract stable while control plane adds products

---

## 12. Missing From Main Dashboard

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| POS organization management | P1 | Large | Different data model; needs API bridge |
| POS device management | P1 | Medium | saas-dash fully built — proxy pattern |
| POS platform metrics/reports | P2 | Medium | `/metrics/*` on POS API |
| Webhooks admin | P2 | Medium | POS-only today |
| Feature flags | P3 | Small–Medium | Optional for MVP |
| BullMQ jobs UI | P3 | Medium | Ops-focused |
| Notifications inbox | P3 | Small | POS platform API exists |
| PMS tenant provisioning UI | P1 | Large | No backend yet |
| Chatwoot instance per tenant | P2 | Large | Docker + account API |
| Unified product entitlements on tenant | P1 | Medium | Schema + UI |

---

## 13. Docker Images — Current State

| Service | Has Dockerfile? | In compose (Stockix prod / tenant) | Production ready? |
|---------|-----------------|-----------------------------------|-------------------|
| apps/api | ✅ | ✅ `infra/prod` | ✅ |
| apps/dashboard | ✅ | ✅ `infra/prod` | ✅ |
| worker-service | ✅ | ✅ `infra/prod` | ✅ |
| Finance server/webapp | ✅ | ✅ `infra/tenant-stack` | ✅ (primary tenant runtime) |
| Finance data images | ✅ | ✅ tenant stack | ✅ |
| POS backend | ✅ | ✅ `posnew/docker-compose.production.yml` only | ⚠️ Separate deploy |
| POS frontend | ❌ | ❌ | ⚠️ PM2/host per posnew compose comments |
| POS saas-dash | ❌ | ❌ | ❌ |
| pesan-pms | ✅ | Standalone `docker-compose.yml` | ⚠️ Not in Stockix tenant stack |
| RentTools | ❌ | ❌ | ⚠️ Script/deploy docs |
| Chatwoot | ✅ upstream | ❌ | ⚠️ Not orchestrated by Stockix |

---

## 14. Docker Images — What Needs Building

1. **POS frontend** — Dockerfile + optional inclusion in tenant or edge stack if POS is tenant-scoped.
2. **POS saas-dash** — **Do not build**; deprecate. If interim needed, single image until UI retired.
3. **PMS (chosen product)** — production Dockerfile aligned with `infra/tenant-stack` pattern.
4. **Chatwoot** — pinned image build (or official image) + compose service block in tenant stack; env for `BRAND_*` / white-label.
5. **Unified tenant compose** — extend `infra/tenant-stack` beyond Finance when products are selected (today Finance-only).

---

## 15. Recommended Build Order

### Priority 1 — Critical (blocks everything else)

1. **Architecture decision:** Stockix tenant = Finance only today; define how POS org IDs map to Stockix tenants.
2. **POS → Stockix API bridge** (read-only proxy minimum) for org list + health — unblocks dashboard migration.
3. **Retire saas-dash login path** — force operators through `apps/dashboard` once parity pages exist.

### Priority 2 — High (MVP multi-product)

4. Migrate **Devices** and **Organizations** UI to main dashboard.
5. Add **product flags** on tenant (`finance` | `pos` | `pms` | `chat`) in `packages/db` + API.
6. **PMS:** choose pesan-pms vs RentTools; one provision path.
7. **Chatwoot:** docker service template + manual/auto account creation API.

### Priority 3 — Medium (production hardening)

8. Webhooks, compliance, jobs, notifications pages (or defer with CLI).
9. POS + PMS Docker in tenant stack; Traefik routes in worker.
10. Consolidate audit logs and API key policy across products.

### Priority 4 — Low (polish)

11. Developers/OpenAPI page, advanced reports, feature flags UI polish.
12. Expand `packages/ui` or document that dashboard owns shadcn primitives.

---

## 16. Final Verdict

| Question | Answer |
|----------|--------|
| **Production ready (Finance-first tenant)?** | **YES** — with ops discipline on `infra/prod`, secrets, worker, and tenant stack paths. |
| **Production ready (full platform: Finance + POS + PMS + Chat)?** | **NO** |
| **Biggest blocking issue** | **Two control planes** (Stockix API vs POS `platformV1`) and **no provision/integration** for PMS or Chatwoot. |
| **Estimated gaps before “first tenant” per product** | **Finance:** ~0–1 week ops hardening · **POS:** 4–8 weeks (API bridge + UI migration + deploy) · **PMS:** 8+ weeks (product pick + greenfield integrate) · **Chatwoot:** 2–4 weeks (Docker + provision script) |

---

*End of read-only audit.*
