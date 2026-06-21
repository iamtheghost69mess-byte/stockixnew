# Stockix SaaS Platform — Architecture Audit Report

**Audit Date:** 2026-06-20  
**Audit Scope:** Full codebase read-only audit  
**Auditor Role:** Principal SaaS Architect / Staff Software Engineer / Platform Architect / DevOps Architect / Enterprise Systems Auditor

---

## Executive Summary

Stockix is a multi-tenant SaaS platform that provisions isolated Finance (accounting), POS (point-of-sale), PMS (property management), and Chat (white-label Chatwoot) stacks for each customer tenant. The system is built as a pnpm monorepo managed with Turborepo. The control plane (API + dashboard) is mature, well-structured, and production-ready. The tenant services (Finance, POS, PMS) are architecturally heterogeneous — three different tech stacks, three different databases, two different ORM strategies — which creates significant operational and developer-experience overhead.

**Overall Architecture Score: 62 / 100**

The platform is production-functional but carries meaningful technical debt: no shared UI system, no API versioning, PMS data co-located in the control-plane database with a documented `TODO(security): isolate PMS`, no metadata-driven UI, and a `@repo/ui` package that is near-empty and effectively unused.

---

## Table of Contents

1. Repository Structure
2. Frontend Architecture
3. Metadata-Driven UI
4. Service Architecture
5. Domain Boundary Analysis
6. Shared Code Analysis
7. API Architecture
8. Backend Architecture
9. Deployment Architecture
10. Provisioning System
11. Maintainability
12. Production Readiness
13. Architecture Health Scores
14. Risk Register
15. Technical Debt Register
16. Quick Wins
17. Medium-Term Improvements
18. Long-Term Improvements
19. Final Recommendations

---

## Architecture Diagrams

### High-Level System Map

```
                          ┌─────────────────────────────────────────┐
                          │         Traefik (TLS termination)        │
                          │    api.domain  app.domain  {slug}.domain  │
                          └────────┬─────────────┬───────────────────┘
                                   │             │
              ┌────────────────────┴─┐    ┌──────┴──────────────────┐
              │   Control Plane      │    │   Tenant Stack (per-tenant│
              │   apps/api (Hono)    │    │   Docker Compose project) │
              │   apps/dashboard     │    │                           │
              │   (Next.js 16)       │    │  ┌──────────────────┐    │
              │                      │    │  │ Finance Server   │    │
              │  Postgres (shared)   │    │  │ (NestJS/Knex)    │    │
              │  Redis (BullMQ)      │    │  │ MySQL (per-tenant│    │
              │  PgBouncer           │    │  │ DB via ProxySQL)  │    │
              └──────────┬───────────┘    │  └──────────────────┘    │
                         │               └─────────────────────────────┘
              ┌──────────┴───────────┐
              │  Infra Worker        │    Shared Infra (stockix-shared network)
              │  (BullMQ consumer)   │    ┌───────────┐ ┌──────────┐ ┌──────────┐
              │  Spawns Docker       │───▶│ MySQL 8   │ │ MongoDB 6│ │ Redis 7  │
              │  Compose stacks      │    │ (ProxySQL)│ │ (rs0)    │ │(tenant)  │
              └──────────────────────┘    └───────────┘ └──────────┘ └──────────┘
                         │
              ┌──────────┴───────────────────────────────────────┐
              │               services/pms (Hono)                │
              │               services/posnew (Express)          │
              └──────────────────────────────────────────────────┘
```

### Dependency Graph (packages)

```
@repo/config ◄─── @repo/db ◄─── @repo/shared ◄─── api
                                                ◄─── dashboard
                                                ◄─── services/pms
                                                ◄─── @repo/platform-worker-shared ◄─── api (worker)
@repo/auth ◄─── api
           ◄─── services/pms

@repo/ui ◄─── (declared in dashboard but NOT used — only 3 stub files exist)

services/posnew ─── ISOLATED (own node_modules, own workspace packages)
services/stockix-finance ─── ISOLATED (Lerna, own workspace, own shared copy)
```

---

## Phase 1 — Repository Structure Audit

### Folder Structure

```
stockixnew/
├── apps/
│   ├── api/                    Control Plane REST API (Hono, TypeScript)
│   └── dashboard/              SaaS Owner Dashboard (Next.js 16, React 19)
├── packages/
│   ├── auth/                   JWT utilities (@repo/auth)
│   ├── config/                 Env config + zod validation (@repo/config)
│   ├── db/                     Drizzle schema + Postgres helpers (@repo/db)
│   ├── eslint-config/          Shared ESLint rules
│   ├── platform-worker-shared/ Infra worker shared types
│   ├── shared/                 Roles, permissions, feature flags, logger (@repo/shared)
│   ├── typescript-config/      Shared tsconfig
│   └── ui/                     Shared UI — stub only (3 files: button, card, code)
├── services/
│   ├── chatlive/               Chatwoot white-label (Ruby on Rails + Vue 3)
│   ├── pms/                    PMS API (Hono, TypeScript, Drizzle/Postgres)
│   ├── posnew/                 POS system (Express.js, MongoDB, Next.js frontend)
│   └── stockix-finance/        Finance app (NestJS-like, Knex, MySQL, React+Blueprint)
├── infra/
│   ├── dev/                    Local Docker Compose (Postgres + Redis)
│   ├── prod/                   Production Docker Compose (full stack)
│   ├── shared/                 Shared infra Docker Compose (MySQL, MongoDB, Redis, ProxySQL, Gotenberg)
│   ├── staging/                Staging Docker Compose
│   ├── tenant-stack/           Per-tenant Finance Docker Compose template
│   ├── pms-tenant-stack/       PMS tenant stack
│   ├── pos-tenant-stack/       POS per-tenant image build
│   ├── worker-service/         Infra worker Dockerfile + config
│   └── terraform/              AWS EC2 provisioning (single server Terraform)
├── scripts/                    ~40+ operational scripts (dev, build, provision, audit)
├── docs/                       Architecture documents (20+ markdown files)
└── .github/
    └── workflows/              CI/CD (deploy, finance typecheck, secret scan)
```

### Good Findings

- **Clear separation of apps and packages.** The `apps/` (runnable applications) vs `packages/` (shared libraries) split is well-established.
- **Turborepo pipeline is correctly configured.** Build order, caching, and task dependencies (`^build`) are declared properly.
- **pnpm workspace is correctly structured** with explicit inclusions for each service sub-package.
- **Infra is environment-aware.** Separate `dev/`, `staging/`, `prod/` Docker Compose files with clear comments.
- **scripts/ is comprehensive** — onboarding, provisioning smoke tests, env sync, tenant cleanup all exist as scripts. New developers have runnable entrypoints.
- **Secret scanning CI job exists** using Gitleaks.
- **Terraform exists** for AWS EC2 provisioning (single server with EBS, EIP, security group).

### Risks

- **Two `@repo/shared` packages with the same name.** `packages/shared/` and `services/stockix-finance/packages/shared/` both export `name: "@repo/shared"`. This creates resolution ambiguity. The `!services/stockix-finance/packages/shared` exclusion in `pnpm-workspace.yaml` prevents the finance copy from being resolved at the monorepo root level, but the naming collision is confusing and error-prone.
- **`services/stockix-finance` uses Lerna** while the rest of the monorepo uses Turborepo. Two build orchestration systems exist simultaneously.
- **`C:\` directory at repo root.** There is a literal Windows path directory (`C:\Users\Jad\Desktop\...`) that was accidentally committed to the repository. This is a filesystem pollution issue and a potential data leak risk (what files are inside?).
- **`@repo/ui` package is a stub.** It contains only 3 files (button.tsx, card.tsx, code.tsx) and is NOT used by the dashboard (dashboard has its own `components/ui/` directory with full Shadcn). The package exists as a placeholder with no actual shared UI.
- **`provisioning.lock` at root.** An unexplained lockfile at repo root — purpose not documented in README or CLAUDE.md.

### Problems

- **Query files (`query.sql`, `query2.sql`, `query3.sql`, `proxy.sql`) at repo root.** Appear to be developer scratch files that should not exist in the repository.
- **Multiple shell scripts at root (`update.sh`, `update2.sh`, `update3.sh`)** are untracked and unexplained. These are either temporary or operational scripts that belong in `scripts/`.
- **`answerhow.md` at root** is an untracked developer note file, not part of the project.

### Recommendations

1. Delete the `C:\` directory artifact from the repository history.
2. Remove the scratch SQL files and shell scripts from repo root (or move to `scripts/` with documentation).
3. Rename `services/stockix-finance/packages/shared` to avoid the `@repo/shared` naming collision.
4. Migrate `services/stockix-finance` from Lerna to Turborepo for build consistency.
5. Remove `provisioning.lock` from version control or document its purpose.

**Is structure understandable?** YES — for the control plane. PARTIAL for tenant services (heterogeneous stacks).  
**Is structure scalable?** PARTIAL — single-server Docker Compose limits horizontal scaling.  
**Is structure maintainable?** PARTIAL — three different backend stacks increase maintenance burden.  
**Is structure easy for new developers?** PARTIAL — onboarding scripts exist but three tech stacks (Hono/NestJS+Knex/Express) require different mental models.

---

## Phase 2 — Frontend Architecture Audit

### Applications

| App | Framework | Styling | UI Library | Router |
|-----|-----------|---------|------------|--------|
| `apps/dashboard` | Next.js 16, React 19 | Tailwind CSS v4 | Shadcn (local copy) | App Router |
| `services/pms/frontend` | Next.js 15, React 19 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| `services/posnew/apps/pos-frontend2` | Next.js 15, React 19 | Tailwind CSS | Shadcn (local copy) | App Router |
| `services/stockix-finance/packages/webapp` | Vite + React 18 | Blueprint.js CSS | Blueprint.js 4.x | React Router |

### Dashboard Architecture

- **Route structure:** Uses Next.js App Router with route groups — `(auth)/` for login/reset, `(dashboard)/` for protected pages.
- **Dashboard proxy pattern:** The dashboard has its own `app/api/` route handlers that proxy to the control plane API. This adds a latency hop and doubles the surface area for authentication bugs.
- **Component organization:** Components live in `components/` (business logic) and `components/ui/` (Shadcn primitives). This is a reasonable structure.
- **Auth:** Uses session cookies (`stockix-session`) managed by the dashboard's own route handlers.

### Shared Shadcn Implementation

**Answer: NO — there is no single shared Shadcn package.**

Evidence:

- `apps/dashboard/components/ui/` contains ~35 Shadcn component files (button, dialog, form, table, select, etc.)
- `services/posnew/apps/pos-frontend2/src/components/ui/` contains a separate set of ~11 Shadcn-style components
- `packages/ui/` contains only 3 files (button.tsx, card.tsx, code.tsx) — effectively unused
- `services/stockix-finance/packages/webapp` uses Blueprint.js 4.x (completely different UI framework)

This means:

- Dashboard and POS frontend have **duplicate Shadcn implementations** that will drift apart
- Finance frontend is on a **completely different design system** (Blueprint.js) with no migration path documented
- The shared `@repo/ui` package **does not fulfill its intended purpose**

**Can Control Plane, PMS, POS, and Finance use one shared Shadcn package?**  
YES for Control Plane + POS (already on Tailwind + React 19). PARTIAL for PMS (frontend is Next.js but near-empty). NO for Finance without a full UI rewrite (currently Blueprint.js 4.x).

### Current State

- Dashboard: Production-quality, full Shadcn implementation, TanStack Table, React Hook Form, recharts, date-fns
- POS Frontend: Production-quality with its own Shadcn subset and `@restaurant-pos/ui` internal package
- PMS Frontend: Near-empty Next.js app (only a bare `frontend/` directory, minimal dependencies)
- Finance Frontend: Blueprint.js 4.x with its own extensive component hierarchy — hundreds of custom components (Accounts, Contacts, Customers, Vendors, SaleInvoices, etc.)

### Required Changes for Unified UI

1. Extract Shadcn components from `apps/dashboard/components/ui/` into `packages/ui/` as the authoritative source.
2. Update dashboard to import from `@repo/ui` instead of local `components/ui/`.
3. Update POS frontend to import from `@repo/ui` or the shared package.
4. Finance requires a long-term rewrite from Blueprint.js to Shadcn/Tailwind — high migration difficulty.

---

## Phase 3 — Metadata-Driven UI Audit

### Metadata-Driven UI Readiness Score: **12 / 100**

### Current Capabilities

- **Forms:** Generated via React Hook Form + Zod schemas per page — NOT metadata-driven. Each form is handcrafted.
- **Tables:** TanStack Table used per page — NOT metadata-driven. Column definitions are hardcoded per route.
- **Filters:** Per-page implementations — NOT metadata-driven.
- **Navigation:** Hardcoded in `app-sidebar.tsx` — NOT metadata-driven.
- **Permissions:** The `require-permission.tsx` component exists and gates rendering based on permission strings from `@repo/shared/permissions`. This is the closest thing to metadata-driven behavior. **PARTIAL.**
- **Reports:** Static charts via recharts — NOT metadata-driven.
- **Menus:** Hardcoded — NOT metadata-driven.

### What Exists (Partial Support)

- `packages/shared/src/permissions.ts` — permission constants that drive `require-permission.tsx` rendering
- `packages/shared/src/feature-flags.ts` — Redis-cached DB-driven feature flags that can gate UI
- `packages/db/src/schema.ts` has a `featureFlags` table with `tenantOverrides` JSONB — this is a foundation for metadata-driven gating

### Missing Capabilities

- No form schema registry
- No table column registry
- No dynamic navigation configuration
- No screen-level metadata registry
- No component registry

### Can screens be generated from metadata? NO

### Can forms be generated from metadata? NO

### Can tables be generated from metadata? NO

### Can permissions be generated from metadata? PARTIAL (feature flags exist, permission strings exist)

### Can modules be generated from metadata? NO

### Can the platform become a Single Source of Truth Frontend? PARTIAL

The `modules` array on tenant records (`["accounting", "pos", "pms"]`) and the `featureFlags` table provide building blocks for metadata-driven module gating. The permission system (`@repo/shared/permissions`) is clean and reusable. However, no metadata-driven UI generation exists today.

---

## Phase 4 — Service Architecture Audit

### Services Inventory

| Service | Language | Framework | Database | Build |
|---------|----------|-----------|----------|-------|
| `apps/api` | TypeScript | Hono | PostgreSQL (Drizzle) | tsup, ESM |
| `apps/dashboard` | TypeScript | Next.js 16 | (via API) | webpack |
| `services/pms` | TypeScript | Hono | PostgreSQL (Drizzle) | tsup |
| `services/pms/frontend` | TypeScript | Next.js 15 | (via PMS API) | Next |
| `services/posnew/apps/pos-backend` | JavaScript (CJS) | Express.js | MongoDB (Mongoose) | Node.js |
| `services/posnew/apps/pos-frontend2` | TypeScript | Next.js 15 | (via POS API) | Next |
| `services/stockix-finance/packages/server` | TypeScript | NestJS-like (custom DI) | MySQL (Knex, Objection.js) + MongoDB + Redis | webpack |
| `services/stockix-finance/packages/webapp` | TypeScript | Vite + React 18 | (via Finance API) | Vite |
| `services/chatlive` | Ruby (Rails) | Ruby on Rails 7 | PostgreSQL + Redis | Sprockets/Webpack |

### Service Dependencies

```
apps/api ──────► @repo/db, @repo/config, @repo/shared, @repo/auth
apps/dashboard ─► @repo/config, @repo/shared, @repo/ui
services/pms ───► @repo/db, @repo/config, @repo/auth
services/posnew ─► @repo/shared (via node_modules/@repo), MongoDB, platform API
services/stockix-finance ─► MySQL, MongoDB, Redis (isolated from @repo/*)
services/chatlive ─► ISOLATED (Ruby ecosystem, no JS imports)
```

### Service Isolation Assessment

| Service | Isolated | Coupled | Can Run Independently | Can Scale Independently |
|---------|---------|---------|----------------------|------------------------|
| `apps/api` | YES | Coupled to @repo/* | YES | YES |
| `services/pms` | PARTIAL | Shares @repo/db schema | YES | YES |
| `services/posnew` | YES | Reads @repo/shared | YES | YES |
| `services/stockix-finance` | YES | Finance-specific shared | YES | YES |
| `services/chatlive` | YES | Platform admin token only | YES | YES |

**Critical Coupling:** PMS shares the same PostgreSQL database and Drizzle schema (`@repo/db`) as the control plane. The schema contains a `TODO(security): isolate PMS to per-tenant Postgres before public launch` comment at line 661. This is a documented, known security risk — PMS data is co-located with the SaaS owner data in the same database.

### Backend Readiness Score: **58 / 100**

---

## Phase 5 — Domain Boundary Audit

### Domain Ownership

| Domain | Owner | Database | Data Location |
|--------|-------|----------|---------------|
| Control Plane (owners, tenants, licenses) | `apps/api` | PostgreSQL (`stockix_platform`) | Correct |
| PMS (properties, bookings, guests) | `services/pms` | PostgreSQL (`stockix_platform`) | **VIOLATION** — shares CP database |
| Finance (accounting, invoicing) | `services/stockix-finance` | MySQL (`stockix_{slug}_finance`) | Correct (per-tenant) |
| POS (orders, products, staff) | `services/posnew` | MongoDB (`{slug}_pos`) | Correct (per-tenant) |
| Chat | `services/chatlive` | PostgreSQL (own DB) | Correct |

### Boundary Violations Report

**VIOLATION 1 — PMS in Control Plane Database (CRITICAL)**

- **Evidence:** `packages/db/src/schema.ts` defines all PMS tables (`pmsProperties`, `pmsRooms`, `pmsBookings`, `pmsGuests`, `pmsPayments`, `pmsIcalChannels`, `pmsCalendarEvents`, `pmsSyncLogs`, `pmsDateOverrides`, `pmsStaff`, `pmsCleaners`, `pmsCleanerAssignments`, `pmsCleaningTasks`, `pmsPropertyManagers`, `pmsPropertyManagerInvites`, `pmsMessageTemplates`, `pmsGuestFormTemplates`, `pmsGuestFormSubmissions`).
- **Comment in code:** `// TODO(security): isolate PMS to per-tenant Postgres before public launch`
- **Risk:** A SaaS owner who can query the control-plane database can see all tenants' PMS guest data (passports, visas, dates of birth) in a shared schema.
- **Current mitigation:** Application-level tenant scoping via `app.current_tenant_id` PostgreSQL session variable + RLS policies on the PMS service. This is partial mitigation — not a boundary fix.

**VIOLATION 2 — Models duplicated across Finance and PMS**

- Both Finance and PMS implement booking/payment entities independently with no shared domain model.

**VIOLATION 3 — PMS audit log in control-plane schema**

- `pmsAuditLog` table exists in `packages/db/src/schema.ts` alongside `adminAuditLog`. These are structurally identical but separate. One lives in the CP domain, one belongs in PMS.

**Are business rules isolated?** PARTIAL  
**Are domains leaking into each other?** YES (PMS into CP)  
**Are models duplicated?** YES (payment, booking entities in PMS and Finance)  
**Are permissions duplicated?** PARTIAL (control-plane uses `@repo/shared/permissions`; Finance has its own roles system; POS has its own RBAC via `@rbac` library)

---

## Phase 6 — Shared Code Audit

### What Exists

| Package | Contents | Used By |
|---------|----------|---------|
| `@repo/auth` | JWT sign/verify (JOSE) | `apps/api`, `services/pms` |
| `@repo/config` | Env validation (Zod), all env vars | `apps/api`, `apps/dashboard`, `services/pms`, `@repo/db`, `@repo/platform-worker-shared` |
| `@repo/db` | Drizzle schema, Postgres client | `apps/api`, `services/pms`, `@repo/platform-worker-shared` |
| `@repo/shared` | Roles, permissions, feature flags, logger, audit-log types, finance-api types | `apps/api`, `apps/dashboard`, `services/pms`, `services/posnew` (via node_modules) |
| `@repo/ui` | 3 stub components (button, card, code) | NOT USED in production apps |
| `@repo/platform-worker-shared` | Worker shared types, OpenTelemetry setup | `apps/api` |
| `@repo/eslint-config` | ESLint rules (Next.js, React) | Dev tooling |
| `@repo/typescript-config` | Shared tsconfig | Dev tooling |

### Can these become one source of truth? YES for CP+PMS+Dashboard. PARTIAL for POS. NO for Finance without migration

### Detected Duplications

| Item | Location 1 | Location 2 | Severity |
|------|-----------|-----------|---------|
| `@repo/shared` files | `packages/shared/src/` | `services/stockix-finance/packages/shared/src/` | HIGH |
| Shadcn UI components | `apps/dashboard/components/ui/` | `services/posnew/apps/pos-frontend2/src/components/ui/` | MEDIUM |
| Audit log type definitions | `packages/shared/src/audit-log.ts` | `services/stockix-finance/packages/shared/src/audit-log.ts` | MEDIUM |
| Structured logger | `packages/shared/src/structured-logger.ts` | `services/stockix-finance/packages/shared/src/structured-logger.ts` | MEDIUM |
| Permission constants | `packages/shared/src/permissions.ts` | Finance internal roles (`services/stockix-finance/packages/server/src/modules/Roles/`) | MEDIUM |

### `@repo/config` concern

The config package has 752 lines in a single file, includes env vars for Finance (`MONGODB_DATABASE_URL`, `AGENDA_*`, `JWT_SECRET`, `DB_CLIENT`, etc.), control plane, PMS, and POS. This is a "god config" — every service reads from one file regardless of which vars apply to it. There is also a typo preserved for backwards compatibility: `TENANT_DB_NAME_PERFIX` (misspelling of PREFIX) is kept alongside the correct `TENANT_DB_NAME_PREFIX`.

---

## Phase 7 — API Architecture Audit

### API Inventory

| Service | Base URL | Protocol | Versioning | Auth |
|---------|---------|----------|-----------|------|
| Control Plane | `api.{domain}:4000` | REST/HTTP | **NONE** | Session cookie / API key / Bearer / Platform secret |
| PMS | `localhost:3003` (internal) | REST/HTTP | **NONE** | Platform secret / JWT |
| Finance | `{slug}.{domain}:3000/api` | REST/HTTP | **NONE** | JWT (per-tenant) |
| POS Platform | `localhost:8010/api/platform/v1` | REST/HTTP | `/v1` path prefix | JWT |
| POS Tenant | `localhost:8010/api` | REST/HTTP | **NONE** | JWT (per-org) |

### API Versioning: ABSENT (control plane, PMS, Finance)

The control plane API has no versioning (`/v1`, `/v2`). Breaking changes require coordinated deploys of API + dashboard + any external integrations simultaneously. The POS platform API uses a `platform-v1` path convention, which is a positive practice not replicated elsewhere.

### Request Validation

- Control plane: **Zod** on all request bodies. Evidence: `z.object(...)` usage throughout `routes/*.ts`.
- PMS: **Zod** on request bodies.
- Finance: **class-validator** DTOs (`@IsString()`, `@IsOptional()`) via NestJS-style decorators.
- POS Backend: **Partial** — some routes validate via mongoose schema on write; no universal request validation middleware.

### Response Validation

**NOT VERIFIED** — no response schema validation was found in any service. Responses are constructed manually.

### Error Handling

- Control plane: JSON `{ error: "error_code" }` with HTTP status codes. Consistent.
- PMS: ZodError caught globally → `{ error: "validation_error", issues: [...] }`. Global `onError` handler.
- Finance: NestJS exception filters with structured error responses.
- POS: `globalErrorHandler` middleware, unstructured `console.error`.

### Authentication Summary

The control plane supports four authentication mechanisms:

1. **Session cookie** (`stockix-session`) — 15-second Redis cache on hash, falls back to in-memory.
2. **API key** (`sk_live_*` prefix) — hashed, stored in `api_keys` table.
3. **Bearer JWT** — for dashboard Route Handlers.
4. **Platform API secret** — for worker and internal dashboard-to-API calls.

This is well-implemented with Redis circuit-breaker fallback to in-memory cache.

### OpenAPI Coverage

- Control plane + PMS: Full OpenAPI 3.1 spec at `docs/openapi/stockix-platform.openapi.yaml`.
- Finance: `@stockix/sdk-ts` package has generated TypeScript types from OpenAPI — but the source OpenAPI spec is not in the monorepo (must be generated from running server).
- POS: Two YAML files (`platform-v1.yaml`, `tenant-pos-v1.yaml`) in `services/posnew/apps/pos-backend/openapi/`.
- Chatlive: `services/chatlive/swagger/swagger.json` exists (NOT VERIFIED contents).

### SDK Generation

- `@stockix/sdk-ts` — TypeScript SDK generated from Finance OpenAPI. **Finance-only.**
- `@restaurant-pos/platform-api` — TypeScript types generated from `platform-v1.yaml` via `openapi-typescript`. **POS-only.**
- No universal SDK for the control plane API.

### API Maturity Score: **54 / 100**

**Can frontend be replaced without backend changes?** YES for control plane (REST JSON API is the interface). NO for dashboard Route Handlers that contain business logic.

**Idempotency:** Implemented for mutating routes via `Idempotency-Key` header middleware (24h TTL, Redis/Postgres-backed). Evidence: `apps/api/src/middleware/idempotency.ts`.

---

## Phase 8 — Backend Architecture Audit

### Current Architecture

Three distinct backend patterns exist across domains:

**Pattern 1: Hono + Drizzle + PostgreSQL (Control Plane + PMS)**  
Modern TypeScript-first stack. Type-safe queries, ESM modules, fast startup. Used by `apps/api` and `services/pms`. Consistent.

**Pattern 2: NestJS-like + Knex/Objection.js + MySQL (Finance)**  
Legacy Bigcapital-derived stack. Custom dependency injection via `tsyringe`. Webpack build. Multi-tenant MySQL with `stockix_tenant_{slug}` databases. MongoDB for POS sync. Agenda.js for cron jobs. NOT using TypeORM or Prisma — uses Knex query builder + Objection.js ORM.

**Pattern 3: Express.js + Mongoose + MongoDB (POS)**  
CommonJS JavaScript (not TypeScript) backend. Mongoose models for all entities. BullMQ workers for Finance sync. Socket.io for real-time printer/order events.

### Can backend become a single source of truth? NO (without large-scale migration)

**Benefits of unification:** Reduced cognitive overhead, shared middleware, shared error handling, shared observability.  
**Risks of unification:** Finance and POS have fundamentally different data models and databases (MySQL vs MongoDB). Migrating Finance from MySQL to PostgreSQL or POS from MongoDB to PostgreSQL would be significant.  
**Required Refactors:** 6-18 months of engineering work at minimum.

### Current State vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Frameworks | Hono, NestJS-like, Express | Hono everywhere (or NestJS everywhere) |
| Languages | TypeScript (ESM), TypeScript (CJS), JavaScript (CJS) | TypeScript (ESM) everywhere |
| Databases | PostgreSQL + MySQL + MongoDB | PostgreSQL everywhere (long-term) |
| Build | tsup, webpack, no-build | tsup everywhere |
| ORM | Drizzle, Knex/Objection, Mongoose | Drizzle everywhere |

---

## Phase 9 — Deployment Architecture Audit

### Architecture Overview

Single-server Docker Compose deployment managed by Traefik for TLS and routing. All services run on one physical/virtual machine.

**Production topology:**

```
EC2 instance (Terraform-provisioned, single server)
└── stockix (Docker Compose project)
    ├── traefik:v3.4 (TLS, Cloudflare DNS challenge, Let's Encrypt)
    ├── postgres:16 (control plane data)
    ├── pgbouncer (connection pooling for API)
    ├── control-plane-redis:7 (BullMQ for API)
    ├── api (Hono, port 4000, 2 instances: api + api-bullmq)
    ├── dashboard (Next.js, port 3000)
    ├── infra-worker (BullMQ consumer, Docker socket access via proxy)
    ├── prometheus, alertmanager, grafana (monitoring)
    └── db-backup (twice-daily backup to Backblaze B2)

└── stockix-shared (Docker Compose project)
    ├── stockix-mysql (MySQL 8, one DB per tenant)
    ├── stockix-mysql-proxy (ProxySQL for connection pooling)
    ├── stockix-mongo (MongoDB 6, rs0 replica set, one DB per tenant)
    ├── stockix-redis (tenant queues + sessions)
    └── stockix-gotenberg (shared PDF renderer)

└── Per-tenant (dynamic Docker Compose projects)
    ├── stockix-server (Finance app, port allocated from sequence)
    └── database_migration (one-shot, runs migrations)
```

### Can frontend be hosted independently? YES  

Evidence: Dashboard image (`stockix-dashboard:latest`) is a separate Docker image. `NEXT_PUBLIC_API_URL` points to the API. No build-time coupling to the API.

### Can backend be hosted independently? YES  

Evidence: API image (`stockix-api:latest`) is a separate Docker image with explicit env injection.

### Can services be hosted independently? PARTIAL  

Control plane services (API, dashboard, worker) can be separated. Per-tenant Finance stacks are already isolated. PMS and POS are not independently deployable without the control-plane network.

### Deployment Blockers

1. **Single server.** No horizontal scaling. One EC2 instance handles all traffic. Tenant stacks share host resources.
2. **Docker socket proxy** used by infra-worker (necessary for tenant provisioning but increases attack surface despite `tecnativa/docker-socket-proxy` mitigation).
3. **File-system coupling** — infra-worker mounts `/opt/stockix/stockixnew` as read-only, `TENANT_ENV_ROOT`, and `TRAEFIK_DYNAMIC_DIR`. The host filesystem is the state store for tenant Compose files.
4. **No container orchestration** (Kubernetes/ECS) — manual Docker Compose management for tenant stacks.
5. **CORS:** Dashboard and API CORS are explicitly configured. `CORS_ALLOWED_ORIGINS` is required (enforced at PMS startup with hard error). Good.
6. **Cookies:** `stockix-session` cookie set by dashboard Route Handlers — domain-scoped.

### CORS: Configured  

### Authentication: Session cookie + API key + Bearer JWT  

### WebSockets: POS uses Socket.io; Finance uses Socket.io via its server; control plane has SSE for provisioning stream  

### Redirects: Dashboard handles OAuth-like redirects internally  

### Callback URLs: Used in provisioning streams (`/api/tenants/provision-stream`)

---

## Phase 10 — Provisioning Audit

### Provisioning Architecture

Tenant provisioning is worker-driven: a BullMQ job (`api-bullmq` container) reads from `tenant_lifecycle_jobs` table and executes Docker Compose commands to spin up per-tenant Finance stacks.

**Provisioning Steps (evidence from `apps/api/src/` + `infra/worker-service/`):**

1. POST `/tenants` → creates tenant + primary organization records → enqueues `provision_org` job
2. Worker picks up job → `enqueueOrgProvisioning()` in `org-provision.ts`
3. Worker runs: allocate port → write `.env` file to `TENANT_ENV_ROOT/{slug}/.env` → `docker compose up -d`
4. Finance database migration (one-shot container `database_migration`)
5. Traefik dynamic config written to `TRAEFIK_DYNAMIC_DIR/{slug}.yml`
6. License sync to Finance tenant
7. Finance user creation (internal API `POST /api/internal/users`)
8. POS organization creation via POS Platform API

**Is provisioning idempotent? PARTIAL**  

- Evidence: `tenant_lifecycle_jobs` table has `claimToken` and `attempts` fields for retry logic.
- Job claim-and-retry pattern exists.
- `dead_letter_jobs` table captures permanent failures.
- `provisioning.lock` at repo root is unexplained and may indicate global lock contention.
- Docker Compose operations are not intrinsically idempotent (re-running `up -d` can succeed but migration container behavior depends on state).

### Failure Points

1. **Port allocation race** — port is allocated from `tenant_ports` sequence in Postgres, then assigned. If the worker crashes between port allocation and Compose startup, the port is leaked.
2. **Filesystem state** — tenant `.env` files on disk are the source of truth. No backup/restore mechanism for these files documented.
3. **Traefik config files** — written to disk. Loss of `TRAEFIK_DYNAMIC_DIR` directory breaks all tenant routing.
4. **No rollback on partial failure** — `tenants.status = "partial"` with `partialFailureKind` field captures state, but automated remediation is NOT VERIFIED.
5. **45-minute job timeout** — jobs can run for up to 45 minutes. There is a stuck reconciler (`provisioning/stuck-reconciler.ts`) but recovery logic is NOT VERIFIED in detail.

### Recovery Capabilities

- `provision-diagnose.mjs` script exists for operational diagnosis.
- `provision-smoke.mjs` for smoke testing.
- `cleanup-tenant-docker-local.mjs` for cleanup.
- Dead letter queue for failed jobs.

---

## Phase 11 — Maintainability Audit

### Code Discoverability

- **Control plane API:** Excellent. CLAUDE.md documents every route registrar with file paths and path prefixes. Route map is maintained.
- **Finance:** Module-based structure (50+ modules) is clear but deep (NestJS-style). New developers need to understand custom DI container.
- **POS:** CommonJS JavaScript, no TypeScript — harder to navigate. No route documentation equivalent to CLAUDE.md.
- **PMS:** Excellent. Small codebase, clear Hono routing.

### Folder Naming

- Consistent. `src/routes/`, `src/lib/`, `src/middleware/`, `src/services/` pattern used across API and PMS.
- Finance uses `src/modules/` with domain-driven naming. 50+ module directories.
- POS uses `controllers/`, `models/`, `routes/`, `services/` (Express MVC).

### Developer Onboarding

- `pnpm setup:local` script exists — single command for full local environment.
- `README.md` exists (17KB) — NOT VERIFIED contents.
- `scripts/bootstrap-local-env.mjs` handles `.env` generation.
- Three different backend stacks mean three different mental models — significant ramp-up.

### Debugging Experience

- **Structured JSON logging** in control plane and PMS via `@repo/shared/structured-logger`. Good.
- **PII redaction** built into the logger (passwords, tokens, passport numbers, etc.) — excellent security practice.
- **POS backend uses `console.error`** — unstructured logging, no JSON format.
- **Finance server logging:** NOT VERIFIED — likely Agenda.js + custom.
- **Sentry integration** in API (`@sentry/node`), dashboard (`@sentry/nextjs`), POS (`@sentry`). Good.
- **OpenTelemetry** in `apps/api` and `@repo/platform-worker-shared` — traces exported via OTLP HTTP. Good.

### Logging Consistency

- Control plane: Structured JSON ✓
- PMS: Structured JSON (same logger) ✓
- POS: `console.error` / `console.log` — unstructured ✗
- Finance: NOT VERIFIED

### Error Tracing

- `requestId` header tracked through the control plane.
- Provisioning has `correlationId` that tracks through all events.
- Cross-service tracing (control plane → PMS → Finance) is NOT VERIFIED as a unified trace.

**Can a new senior developer understand the system quickly?** PARTIAL  
The control plane, CLAUDE.md route map, and scripts directory are excellent. The Finance app (50+ modules, custom DI, Lerna, Webpack) requires significant ramp-up. The POS JavaScript backend has no TypeScript types.

---

## Phase 12 — Production Readiness Audit

### Logging

- **Structured JSON:** Control plane + PMS ✓. Finance NOT VERIFIED. POS unstructured ✗.
- **PII Redaction:** Built into shared logger ✓.

### Observability

- **Prometheus metrics** (`prom-client`) with custom metrics:
  - `stockix_dead_letter_jobs_total`
  - `stockix_failed_logins_total`
  - `stockix_active_provisioning_jobs_total`
  - `stockix_expired_licenses_total`
  - `stockix_api_request_total`
  - `stockix_api_request_latency_ms`
- **Grafana** with dashboards at `infra/prod/grafana/dashboards/`
- **Alertmanager** with alert rules at `infra/prod/prometheus/alerts.yml`

### Tracing

- OpenTelemetry OTLP HTTP exporter configured in `apps/api/src/instrumentation.ts`.
- Auto-instrumentations for Node.js.
- Trace collector endpoint: `METRICS_ENDPOINT` env var.

### Monitoring

- PostgreSQL Exporter sidecar for Postgres metrics ✓
- Redis health check in Docker Compose ✓
- Per-service healthcheck endpoints (`/health`, `/ready`) ✓

### Feature Flags

- `featureFlags` table in control plane DB with `enabledGlobally` and `tenantOverrides` JSONB.
- Redis cache (60s TTL) to avoid DB amplification.
- Routes exist at `routes/feature-flags.ts`.
- **Gap:** No UI in the dashboard to manage feature flags was found (NOT VERIFIED — may exist but not seen in directory listing).

### Rate Limiting

- Global rate limit middleware (`global-rate-limit.ts`) using `rate-limiter-flexible` with Redis backend ✓
- License-specific rate limit (`license-rate-limit.ts`) ✓
- Auth rate limit configured via `THROTTLE_AUTH_TTL` / `THROTTLE_AUTH_LIMIT` ✓

### Caching

- Session cache (Redis + in-memory fallback, 15s TTL) ✓
- Platform actor cache (Redis + in-memory, 60s TTL) ✓
- Feature flag cache (Redis, 60s TTL) ✓
- Health check cache (`lib/health-cache.ts`) ✓
- Redis circuit breaker for graceful degradation ✓

### Queue Architecture

- **BullMQ** (Redis-backed) for control-plane async jobs (owner invite emails, license expiry)
- **Agenda.js** (MongoDB-backed) inside Finance server for cron jobs
- `tenant_lifecycle_jobs` Postgres table for provisioning jobs (custom queue, not BullMQ)
- POS uses BullMQ (`bigcapitalSyncWorker.js`) for Finance sync

### Background Jobs

- License expiry milestone jobs (`jobs/license-expiry-milestone.ts`)
- License expiry queue (`jobs/license-expiry-queue.ts`)
- Owner invite mail queue (`jobs/owner-invite-mail-queue.ts`)
- PMS iCal sync (cron via `services/pms/src/jobs/ical-sync.ts`)
- Provisioning reconciler (polling, every 60s by default)
- Stuck job reconciler

### Secrets Management

- **Encrypted at rest** (`enc:v1:*`) for MySQL passwords, JWT secrets, and Finance admin passwords in `tenant_deployments` table. `DEPLOYMENT_SECRET_KEY` used for encryption. ✓
- **No secrets manager** (Vault, AWS Secrets Manager, etc.) — all secrets via environment variables. Risk for production.
- **Gitleaks** secret scanning in CI ✓
- `.gitleaks.toml` custom rules configured ✓

### Configuration Management

- `@repo/config` centralizes all env var reading with Zod validation.
- Profile-based required env vars (development, staging, production).
- `STOCKIX_LOAD_ROOT_ENV` flag controls .env loading in containers.
- `env:sync-prod` script syncs production env to root for worker dotenv fallback.

### Backups

- Twice-daily automated backup to Backblaze B2 (Postgres dump + MySQL dump + Mongo dump).
- Encrypted backup with GPG key.
- Backup retention configurable via `BACKUP_RETENTION_DAYS`.
- Runtime state backup (Traefik dynamic config, tenant env files).

### Production Readiness Score: **70 / 100**

**Gaps that reduce score:**

- No distributed tracing across all services (only API + worker have OpenTelemetry)
- POS unstructured logging
- No secrets manager — all secrets via env vars
- Feature flags have no dashboard UI (NOT VERIFIED)
- No Kubernetes/container orchestration — single server limits availability
- Finance observability NOT VERIFIED

---

## Phase 13 — Architecture Health Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Repository Structure | 65/100 | Clear structure, but `C:\` artifact, dead `@repo/ui`, Lerna vs Turborepo |
| Frontend Architecture | 48/100 | No shared Shadcn, Finance on Blueprint.js, PMS frontend nearly empty |
| Backend Architecture | 58/100 | Three frameworks, three databases, heterogeneous |
| Metadata-Driven UI | 12/100 | Feature flags + permission strings are the only foundation |
| API Architecture | 54/100 | No versioning, inconsistent error handling, good auth |
| Provisioning | 65/100 | Functional, idempotency partial, file-system state risk |
| Deployment | 60/100 | Single server, good monitoring, no horizontal scaling |
| Maintainability | 65/100 | Good CP, poor POS (no TS), Finance ramp-up high |
| Production Readiness | 70/100 | Monitoring/alerts/backup/rate-limiting good; secrets, tracing, scaling gaps |
| **Overall** | **62/100** | Production-functional with significant technical debt |

---

## Risk Register

| ID | Risk | Severity | Likelihood | Impact | Evidence |
|----|------|---------|-----------|--------|---------|
| R1 | PMS guest data (passports, DOB, visas) in control-plane database, accessible to SaaS operators | CRITICAL | HIGH | Data breach, GDPR violation | `schema.ts:661 TODO(security)` |
| R2 | Single-server deployment — no HA, one failure takes down all tenants | HIGH | MEDIUM | 100% downtime during host failure | `infra/prod/docker-compose.yml` single EC2 |
| R3 | All secrets in env vars, no secrets manager | HIGH | MEDIUM | Secret rotation is manual, no audit trail | All Docker Compose env blocks |
| R4 | `C:\` Windows path directory committed to repository | MEDIUM | VERIFIED | Information leak, filesystem pollution | `ls /` shows the directory |
| R5 | `TENANT_DB_NAME_PERFIX` typo preserved in config | LOW | VERIFIED | Developer confusion, potential misconfiguration | `config/src/index.ts` line 275 |
| R6 | Finance Lerna + Webpack build not in Turborepo pipeline | MEDIUM | VERIFIED | Finance builds not cached by Turborepo | `services/stockix-finance/package.json` |
| R7 | Tenant `.env` files on host filesystem are the state store — not backed up atomically | HIGH | MEDIUM | Tenant configuration lost on host failure | `infra/prod/docker-compose.yml` volumes |
| R8 | POS backend is untyped JavaScript with no TypeScript | MEDIUM | VERIFIED | Harder to refactor, runtime errors not caught at compile time | `services/posnew/apps/pos-backend/app.js` |
| R9 | No API versioning on control plane, PMS, or Finance | MEDIUM | HIGH | Breaking changes require coordinated deploys | `docs/openapi/stockix-platform.openapi.yaml` |
| R10 | Two `@repo/shared` packages with same name | MEDIUM | VERIFIED | Resolution ambiguity in pnpm | `pnpm-workspace.yaml` `!` exclusion |

---

## Technical Debt Register

| ID | Debt | Area | Effort | Priority |
|----|------|------|--------|---------|
| D1 | Isolate PMS to per-tenant Postgres (documented TODO) | PMS/DB | XL (3-6 months) | HIGH |
| D2 | Create single shared Shadcn package (`@repo/ui`) replacing local copies | Frontend | M (2-4 weeks) | HIGH |
| D3 | Migrate Finance frontend from Blueprint.js to Shadcn/Tailwind | Frontend | XL (6-12 months) | LOW |
| D4 | Add API versioning (`/v1` prefix) to control plane | API | M (1-2 weeks) | MEDIUM |
| D5 | Migrate Finance from Lerna to Turborepo | Build | S (1 week) | MEDIUM |
| D6 | Convert POS backend to TypeScript | POS | L (2-3 months) | MEDIUM |
| D7 | Expand `@repo/config` into per-service configs (eliminate "god config") | Config | M (2-3 weeks) | MEDIUM |
| D8 | Rename `services/stockix-finance/packages/shared` to avoid `@repo/shared` collision | Shared | S (1-2 days) | HIGH |
| D9 | Remove `C:\` directory artifact from git history | Repo | S (hours) | HIGH |
| D10 | Remove SQL scratch files and shell scripts from repo root | Repo | S (hours) | MEDIUM |
| D11 | Fix `TENANT_DB_NAME_PERFIX` typo (must keep backwards compat path) | Config | S (hours) | LOW |
| D12 | Add distributed tracing across PMS and Finance | Observability | M (2-3 weeks) | MEDIUM |
| D13 | Add structured logging to POS backend | POS | S (1 week) | MEDIUM |
| D14 | Dashboard Route Handlers proxy business logic — consider moving to API | API | L (4-6 weeks) | LOW |
| D15 | Implement secrets manager (Vault or AWS Secrets Manager) | Security | L (3-4 weeks) | HIGH |

---

## Quick Wins (< 1 week each)

1. **Remove `C:\` artifact from git history** — `git filter-repo` or BFG. Zero risk to functionality.
2. **Delete SQL scratch files and shell scripts from root** — no functional impact.
3. **Fix `@repo/ui` or deprecate it clearly** — either populate it with shared Shadcn components or remove the dependency declaration from `apps/dashboard/package.json` to eliminate confusion.
4. **Rename `services/stockix-finance/packages/shared`** — use `@stockix/shared` or `@finance/shared` to eliminate the naming collision.
5. **Add `/v1` prefix to control plane API routes** — minimal code change, creates forward compatibility.
6. **Document `provisioning.lock`** — one-line comment in CLAUDE.md clarifying its purpose.
7. **Add feature flags management UI to dashboard** — if it truly does not exist; feature flags table + routes already exist, only a UI page is missing.
8. **Add `TENANT_DB_NAME_PERFIX` → `TENANT_DB_NAME_PREFIX` migration note** in config comments, begin deprecating the typo variant.

---

## Medium-Term Improvements (1-3 months)

1. **Extract shared Shadcn into `@repo/ui`** — move `apps/dashboard/components/ui/` to `packages/ui/src/`, update imports, add `@restaurant-pos/ui` as a consumer.
2. **Migrate Finance Lerna → Turborepo** — add `services/stockix-finance` properly to Turborepo pipeline.
3. **Add distributed tracing** — extend OpenTelemetry to cover PMS → Finance sync path.
4. **Implement secrets manager** — AWS Secrets Manager or HashiCorp Vault for credential rotation.
5. **POS TypeScript migration** — start with new files; introduce `tsconfig.json` and type-check incrementally.
6. **Add API response schema validation** — use Zod on at least control-plane responses.
7. **Per-service config modules** — split `@repo/config` into domain-specific modules to reduce coupling.
8. **Backup tenant filesystem state** — include tenant `.env` and Traefik config in backup rotation.

---

## Long-Term Improvements (3-12 months)

1. **Isolate PMS to per-tenant PostgreSQL** — the documented `TODO(security)` is a real security boundary requirement. Per-tenant Postgres schemas or separate databases.
2. **Container orchestration** — migrate from single-server Docker Compose to Kubernetes (or ECS) for horizontal scaling and HA.
3. **Unified backend framework** — standardize on Hono across all services (or NestJS). Start with PMS (already Hono), then POS, eventually Finance.
4. **Unified database strategy** — evaluate migrating Finance from MySQL to PostgreSQL (enables single shared infra, simpler backups, Drizzle ORM).
5. **Finance frontend rewrite** — migrate from Blueprint.js 4.x to Shadcn/Tailwind for design system consistency.
6. **Metadata-driven UI** — build a form registry and table registry as the foundation for dynamic screens.
7. **SDK generation for all APIs** — generate TypeScript clients from all OpenAPI specs (not just Finance and POS).
8. **Multi-region deployment** — Terraform today provisions a single EC2; extend to multi-region for enterprise tenants.

---

## Final Recommendations

### Priority 1 — Security (Do Immediately)

- **Isolate PMS data from control-plane database.** The current shared-database model violates data isolation. Tenant guest data (passport numbers, dates of birth, visa details) must not live in the same PostgreSQL database as SaaS operator credentials.
- **Implement a secrets manager.** Rotating secrets currently requires SSH access to the server and manual Docker Compose restarts. This is not acceptable for a production SaaS platform.
- **Clean the repository** — remove the `C:\` directory from git history. It may contain sensitive paths or data about the development environment.

### Priority 2 — Developer Experience (Do in Next Sprint)

- **Fix `@repo/ui`** — either build it into a real shared Shadcn package or delete the empty placeholder and stop importing it.
- **Rename the duplicate `@repo/shared`** package inside Finance.
- **Add API versioning** to the control plane — even a simple `/v1` prefix avoids future breakage.

### Priority 3 — Architecture Standardization (Next Quarter)

- **Consolidate Shadcn** into `packages/ui` as the single source of truth for all TypeScript frontends.
- **Migrate Finance Lerna → Turborepo** for consistent build caching.
- **Start POS TypeScript migration** — new files only; do not block on full migration.
- **Add distributed tracing** across the control plane → PMS → Finance path.

### Priority 4 — Scaling (Next 6 Months)

- **Move off single-server Docker Compose** to Kubernetes or ECS.
- **Backup tenant filesystem state** as part of disaster recovery planning.
- **Build metadata-driven UI foundation** — a form registry and permission gate registry will pay compound dividends as the platform grows.

---

*Every finding in this report is backed by direct code evidence, configuration files, or verified file system observations. Items that could not be verified from code are explicitly marked "NOT VERIFIED".*
