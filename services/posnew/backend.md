═══════════════════════════════════════════════════════════
                   DATABASE & API AUDIT REPORT
                   POS Backend (apps/pos-backend) — 2026-04-21
═══════════════════════════════════════════════════════════

SUMMARY
───────
Initial audit totals:
- 🚨 Critical Issues:     5
- ❌ High Issues:         7
- ⚠️  Medium Issues:      9
- 💡 Low/Suggestions:     4

Recheck status after remediation (2026-04-21):
- 🚨 Critical unresolved: 0
- ❌ High unresolved:     0
- ⚠️  Medium unresolved:  1 (deferred: money-field storage migration)
- 💡 Low unresolved:      0

Scope covered: routes, controllers, middlewares, services, models, config, workers under `apps/pos-backend`.
Method: static code audit only (no runtime/DB execution). Query-plan-specific scan certainty is limited without `explain()`.

───────────────────────────────────────────────────────────
CRITICAL ISSUES — RECHECK STATUS
───────────────────────────────────────────────────────────

✅ RESOLVED | Tenant enforcement optional in main tenant stack
✅ RESOLVED | IDOR risk on order resource lookups
✅ RESOLVED | Cross-tenant table pivot in order flows
✅ RESOLVED | Client-injected tenant in order creation path
✅ RESOLVED | Cross-tenant foreign reference injection

───────────────────────────────────────────────────────────
HIGH ISSUES — RECHECK STATUS
───────────────────────────────────────────────────────────

✅ RESOLVED | Multi-step order mutations non-transactional
✅ RESOLVED | POS cookie-auth mutation CSRF/origin exposure
✅ RESOLVED | In-memory only rate-limit store
✅ RESOLVED | Global upload namespace
✅ RESOLVED | Webhook signature over parsed JSON
✅ RESOLVED | Last-admin guard not tenant-scoped
✅ RESOLVED | Unbounded list fallbacks

───────────────────────────────────────────────────────────
MEDIUM ISSUES — RECHECK STATUS
───────────────────────────────────────────────────────────

✅ RESOLVED | Tenant location fallback not org-bound
✅ RESOLVED | Multi-instance inventory scheduler duplication
✅ RESOLVED | Platform metrics silent per-org failure
✅ RESOLVED | Platform JWT via query parameter
✅ RESOLVED | Usage metering race condition
✅ RESOLVED | Fire-and-forget metering promises
✅ RESOLVED | Missing process fatal handlers
✅ RESOLVED | Unbounded platform inventory feed params
⚠️ DEFERRED | Monetary fields still use floating `Number` in key models

───────────────────────────────────────────────────────────
DUPLICATION OF DATA & LOGIC
───────────────────────────────────────────────────────────

❌ DUPLICATION | File: `app.js:264-267`  
Same routers mounted under duplicate aliases (`/api/order` + `/api/orders`, `/api/table` + `/api/tables`)  
→ Recommendation: keep one canonical route and add explicit redirect/deprecation strategy.

❌ DUPLICATION | File: `routes/authRoute.js:25-28` and `routes/userRoute.js:9-10`  
Same login/logout logic exposed via two route groups  
→ Recommendation: consolidate auth surface into one route module to avoid divergence.

⚠️ DUPLICATION | File: `controllers/menuItemController.js:70-91`, `ingredientController.js:25-45`, `tableController.js:192-220`, `reportController.js:223-243`, `staffController.js:91-112`  
Repeated pagination fallback pattern (return-all when not active), implemented inconsistently  
→ Recommendation: extract shared pagination policy helper enforcing safe defaults.

───────────────────────────────────────────────────────────
SCALABILITY & INFRA OBSERVATIONS
───────────────────────────────────────────────────────────

⚠️ SCALABILITY | File: `services/abuseSignals.js:17-29`  
Signup velocity uses in-memory `Map`; resets on restart and doesn’t work cross-instance  
→ Fix: Redis TTL counters.

⚠️ SCALABILITY | File: `services/jobQueue.js:137-155`  
Queue listing fetches broad windows and per-job state serially (high Redis round-trips)  
→ Fix: bounded queue-by-queue pagination and batched state reads.

💡 CONNECTION POOLING status  
- DB/Redis connection reuse appears process-global (`services/jobQueue.js:3`, `20-47`; DB initialized once in `app.js:33`).  
- Could not verify runtime pool sizing behavior without executing workload benchmarks.

───────────────────────────────────────────────────────────
AUTHORIZATION COVERAGE NOTES
───────────────────────────────────────────────────────────

- Most tenant routes are guarded by `authedTenant` or `authedTenantLocation`.
- Public endpoints exist intentionally (`/api/public/*`, health/metrics, webhook verification).
- Highest authorization risk remains object-level ownership checks in order/table flows and org-optional tenant stack.

───────────────────────────────────────────────────────────
RECOMMENDED FIXES — PRIORITY ORDER
───────────────────────────────────────────────────────────
1. [Done] Enforce mandatory tenant binding on all POS authenticated routes.
2. [Done] Refactor order/table access with tenant-scoped ownership predicates.
3. [Done] Add org-scoped validation for foreign references.
4. [Done] Add transaction boundaries on critical order/self-order flows.
5. [Done] Apply CSRF/origin defense for cookie-auth write endpoints.
6. [Done] Move rate limiting/abuse counters to Redis-backed stores where planned.
7. [Done] Tenant-namespace uploads and route compatibility hardening.
8. [Done] Fix webhook raw-body signature verification path.
9. [Done] Standardize default/max pagination policy.
10. [Deferred] Convert money fields from floating `Number` to cents/Decimal128 with migration.

───────────────────────────────────────────────────────────
MISSING INFRASTRUCTURE
───────────────────────────────────────────────────────────
- [x] Redis-backed rate limiter store (tenant/user/ip aware)
- [x] POS-wide CSRF/origin enforcement for cookie-auth mutations
- [x] Mandatory tenant scope middleware (hard-fail on missing org)
- [x] Transaction wrapper policy for critical multi-document business flows
- [x] Tenant-scoped file storage strategy (upload namespace + access control)
- [x] Global process crash handlers (`unhandledRejection`/`uncaughtException`)
- [x] Background scheduler leader election / singleton worker strategy
- [x] Centralized pagination guard (default + max hard limits)
- [ ] Query-plan verification pipeline (`explain`) in CI for critical endpoints

───────────────────────────────────────────────────────────
REMEDIATION RECHECK (2026-04-21)
───────────────────────────────────────────────────────────

Resolved in code (Critical/High + Medium/Low plan scope):
- Platform JWT query-token path removed; bearer/cookie only.
- Platform inventory feed now validates/clamps `limit` and `skip`.
- Tenant inventory request paths now enforce org-scoped location resolution.
- Usage metering check/increment race replaced with atomic guarded consume path.
- Post-response metering promises handled explicitly (`allSettled` + logging).
- Process-level fatal handlers added for `unhandledRejection` / `uncaughtException`.
- Platform metrics now surface partial failure metadata and warning logs per org.
- Inventory alert scheduler guarded by distributed lock; execution tenant-scoped.
- Queue listing path bounded and optimized to reduce broad fetch/state overhead.
- Abuse velocity counters moved from memory-only map to Redis TTL counters.
- Supporting indexes added for stock movement/category/stock lot query paths.
- Duplicate route aliases/auth surfaces consolidated with compatibility deprecation headers.
- Pagination fallback standardized via shared helper and consistent list response shape.

Deferred:
- Monetary fields still rely on floating `Number` in key models. This needs a schema + migration rollout (cents/Decimal128), data backfill, and API compatibility cutover to avoid ledger/report drift.

Validation evidence:
- Lint diagnostics on touched files: clean.
- Targeted OpenAPI tests pass.
- Full `npm test` remains blocked by existing script issue (`tests/unit` module path), not by remediation changes.

═══════════════════════════════════════════════════════════
Yes — checked carefully. Here’s the exact truth of your API surface now:

\/api/orders`and`/api/order` point to the **same router** (orderRoute`).

\/api/orders`` is canonical.
\/api/order`is legacy alias and now returnsX-Deprecated-Route` header.
Source: \apps/pos-backend/app.js``.
\/api/tables`and`/api/table` are also the **same router** (tableRoute`).

\/api/tables`` is canonical.
\/api/table`` is legacy alias with deprecation header.
Source: \apps/pos-backend/app.js``.
\/api/auth`vs`/api/user`` are not fully the same, but partially overlapping:

\/api/auth`` owns auth endpoints: login/logout/refresh/session/register/invitation.
\/api/user`` has:
GET /api/user/ = current user data (this is unique, not duplicate)
POST /api/user/login\`` + POST /api/user/logout`` = deprecated wrappers that call auth controller.
Source: \apps/pos-backend/routes/authRoute.js`and`apps/pos-backend/routes/userRoute.js``.
\/api/users`is **different** from`/api/user``.

\/api/users`` = staff management CRUD (list/create/update/delete staff).
Source: \apps/pos-backend/routes/staffRoute.js``.
So your intuition is correct: not all “similar names” are duplicates.
Current state is:

True duplicate aliases kept for backward compatibility (order/orders, table/tables).
Auth overlap exists intentionally as deprecation wrappers (/api/user/login|logout -> /api/auth/...).
user vs users represent different domains (profile/me vs staff admin).



Professional End-State (Target Contract)
Keep only one canonical surface per domain:

POST/GET/PATCH/DELETE /api/orders/* (canonical)
POST/GET/PUT/DELETE /api/tables/* (canonical)
POST /api/auth/login|logout|refresh, GET /api/auth/session (canonical auth)
GET /api/user = current authenticated principal profile/me
GET/POST/PATCH/DELETE /api/users/* = staff admin resource
So:

api/order and api/table should be temporary legacy aliases only.
api/user/login|logout should be temporary wrappers only.
api/user and api/users are not duplicates; they represent different resources.
SaaS Multi-Tenant Rules (must be non-negotiable)
Tenant resolution is server-only

never trust tenant/org from body/query/path for protected operations.
Every tenant resource query must include organization scope

{ _id, organization: req.tenantOrganizationId } pattern everywhere.
One middleware gate for tenant binding

fail fast if tenant context missing on tenant routes.
Canonical API + compatibility window

old aliases return X-Deprecated-Route + sunset date.
track alias usage in logs/metrics by tenant/client app version.
One-Time Professional Repair Plan
API Governance Baseline

Create an ADR/API policy doc: canonical routes, naming conventions, deprecation lifecycle, tenant scoping rules.
Make OpenAPI the single source of truth (no undocumented alias behavior).
Deprecation Pipeline (not ad-hoc)

Phase A: aliases active + deprecation headers + usage telemetry.
Phase B: warning responses in non-prod, dashboards for remaining consumers.
Phase C: remove aliases after zero-usage window (or approved tenant exceptions).
Contract Enforcement in CI

Contract tests fail if:
duplicate first-class mounts are introduced
auth endpoints are reintroduced under non-canonical groups
tenant-scoped handlers miss org predicate patterns.
Tenant-Safety Regression Suite

IDOR/cross-tenant tests for orders/tables/staff/auth routes.
Explicit tests for legacy alias and canonical endpoint equivalence during transition.
Operational Controls

versioned deprecation notices per endpoint
release notes + tenant communication
hard removal date committed in roadmap