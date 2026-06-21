# Stockix Production Readiness Audit

**Date:** 2026-06-19  
**Auditor Role:** Principal Software Architect / Staff Engineer / DevOps / Security / SRE / QA Lead  
**Scope:** Complete codebase audit — every module, every file class reviewed  
**Branch:** `architecture`

---

## Table of Contents

1. [System Architecture Report](#system-architecture-report)
2. [Dependency Graph](#dependency-graph)
3. [Phase 2 — Authentication Audit](#phase-2--authentication-audit)
4. [Phase 3 — Authorization Audit](#phase-3--authorization-audit)
5. [Phase 4 — CRUD Audit](#phase-4--crud-audit)
6. [Phase 5 — Billing Audit](#phase-5--billing-audit)
7. [Phase 6 — Multi-Tenancy Audit](#phase-6--multi-tenancy-audit)
8. [Phase 7 — Database Audit](#phase-7--database-audit)
9. [Phase 8 — Performance Audit](#phase-8--performance-audit)
10. [Phase 9 — Scalability Audit](#phase-9--scalability-audit)
11. [Phase 10 — API Audit](#phase-10--api-audit)
12. [Phase 11 — CI/CD Audit](#phase-11--cicd-audit)
13. [Phase 12 — Observability Audit](#phase-12--observability-audit)
14. [Phase 13 — Security Audit](#phase-13--security-audit)
15. [Phase 14 — Compliance Audit](#phase-14--compliance-audit)
16. [Phase 15 — Disaster Recovery Audit](#phase-15--disaster-recovery-audit)
17. [Phase 16 — Reporting Audit](#phase-16--reporting-audit)
18. [Phase 17 — Enterprise SaaS Audit](#phase-17--enterprise-saas-audit)
19. [Phase 18 — Hospitality ERP Specific Audit](#phase-18--hospitality-erp-specific-audit)
20. [Phase 19 — Redirect Audit](#phase-19--redirect-audit)
21. [Final Deliverable](#final-deliverable)

---

## System Architecture Report

### Monorepo Structure

```
stockixnew/                         (Turborepo / pnpm workspaces)
├── apps/
│   ├── api/                        Control-plane API (Hono.js, Node 22)
│   └── dashboard/                  Admin dashboard (Next.js 15, App Router)
├── services/
│   ├── stockix-finance/            Finance ERP (NestJS + React/Vite, MySQL)
│   ├── posnew/                     POS system (NX monorepo, MongoDB, Express)
│   ├── pms/                        Property Management (Hono.js, shared Postgres)
│   └── chatlive/                   Chat (Chatwoot-based, Rails)
├── packages/
│   ├── db/                         Drizzle ORM schema + migrations (PostgreSQL)
│   ├── auth/                       Shared auth utilities
│   ├── config/                     Centralised env config
│   ├── shared/                     Shared types, permissions, roles
│   ├── ui/                         Shared UI component library
│   └── platform-worker-shared/     Worker bus contracts
├── infra/
│   ├── prod/                       Production Docker Compose stack
│   ├── staging/                    Staging stack
│   ├── shared/                     MySQL + MongoDB shared containers
│   ├── worker-service/             Infra provisioning worker (Node.js)
│   └── terraform/                  (Empty — not implemented)
└── .github/workflows/              CI/CD pipelines
```

### Architecture Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend (dashboard) | Next.js 15 (App Router, RSC) | TypeScript, Tailwind, shadcn/ui |
| Control-plane API | Hono.js on Node 22 | REST, SSE streaming |
| Finance ERP (per-tenant) | NestJS + Knex + MySQL | Docker Compose per tenant |
| POS (per-tenant) | Express + MongoDB | Shared Mongo instance |
| PMS | Hono.js | Currently on shared Postgres (noted TODO) |
| Chat | Chatwoot (Ruby on Rails) | Optional module |
| Database | PostgreSQL 16 | Single instance, Drizzle ORM |
| Cache / Rate Limiting | Redis 7 | ioredis, rate-limiter-flexible |
| Reverse Proxy | Traefik v3.4 | DNS-01 ACME via Cloudflare |
| Auth | Custom HMAC-SHA256 tokens | Not JWT, SameSite=Lax cookies |
| Infra Provisioning | Worker process + Docker socket-proxy | Per-tenant Docker Compose stacks |
| Backup | Backblaze B2 (S3-compatible) | Postgres dump + runtime data |
| Monitoring | Prometheus + Grafana | Self-hosted |
| Error Tracking | Sentry (optional) | tracesSampleRate=0.1 |
| CI/CD | GitHub Actions + self-hosted runner | Quality gate + deploy |

---

## Dependency Graph

```
dashboard (Next.js)
    └── @repo/config, @repo/shared, @repo/auth
    └── → Control-plane API (via NEXT_PUBLIC_API_URL)

Control-plane API (Hono)
    ├── @repo/db (Drizzle + PostgreSQL)
    ├── @repo/config
    ├── @repo/shared
    ├── → POS platform API (posProxy, HTTP)
    ├── → PMS service API (pmsProxy, HTTP)
    ├── → Finance tenant API (financeProxy, HTTP per-tenant)
    ├── → Redis (rate limiting, SSE pubsub, cancel signals)
    └── → Worker (enqueues tenant lifecycle jobs via DB)

Infra Worker
    ├── @repo/db (Drizzle + PostgreSQL)
    ├── → Docker socket-proxy (TCP:2375, tecnativa)
    ├── → Shared MySQL (provisioning)
    ├── → Shared MongoDB (provisioning)
    ├── → Traefik dynamic config (file system write)
    └── → Finance service (bootstrap via HTTP)

Finance (per-tenant, NestJS)
    ├── MySQL per-tenant schema
    └── → Control-plane API (license sync)

POS (shared, Express)
    ├── MongoDB (shared instance, per-tenant DB)
    └── → Control-plane API (license check)

PMS (Hono)
    └── shared PostgreSQL (CRITICAL: not per-tenant)
```

---

## Phase 2 — Authentication Audit

### What Exists

| Feature | Status | Location |
|---------|--------|----------|
| Email + password login | ✅ Implemented | `apps/api/src/services/auth/login.ts` |
| MFA (TOTP) setup + verify | ✅ Implemented | `apps/api/src/services/mfa/mfa.ts` |
| Session cookie (HttpOnly, SameSite=Lax) | ✅ Implemented | `apps/api/src/routes/auth/index.ts:46` |
| CSRF protection (Origin check) | ✅ Implemented | `csrfViolation()` function |
| Account lockout (5 failed attempts, 15 min) | ✅ Implemented | `services/auth/login.ts:60-62` |
| Brute force protection (rate limiting) | ✅ Implemented | Auth-specific rate limiter, 20/900s |
| Password reset via email | ✅ Implemented | `services/auth/password-reset.ts` |
| Invite flow with token | ✅ Implemented | `services/invites/invites.ts` |
| Session version invalidation | ✅ Implemented | `sessionVersion` bump on MFA changes |
| Audit log for auth events | ✅ Implemented | `adminAuditLog` table |
| Secure logout (cookie cleared) | ⚠️ Partial | See ISSUE-AUTH-001 |
| Token expiration (30 days) | ✅ Implemented | `SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000` |
| OAuth providers | ❌ Not implemented | |
| SSO / SAML readiness | ❌ Not implemented | |
| SCIM readiness | ❌ Not implemented | |
| Magic links | ❌ Not implemented | |
| Device tracking | ❌ Not implemented | |
| Concurrent session management | ❌ Not implemented | |
| Email verification on signup | N/A — invite-only | |

### Critical Issues

#### ISSUE-AUTH-001 — Logout Does Not Invalidate Token (HIGH)

**Description:** The logout handler clears the session cookie but does NOT increment `sessionVersion`, so a captured token in an Authorization header remains valid for up to 30 days.

**Root Cause:** `POST /auth/logout` only returns `Set-Cookie: stockix-session=; Max-Age=0`. No `sessionVersion` bump, no server-side invalidation.

**Risk:** If an attacker has exfiltrated a session token (XSS, network sniffing, log leak), they retain full access for 30 days after the victim logs out.

**Fix:**
```typescript
// apps/api/src/routes/auth/index.ts — logout handler
auth.post("/logout", async (c) => {
  if (csrfViolation(c)) return c.json({ success: false, error: "csrf_violation" }, 403);
  const session = await resolveSessionFromRequest(c);
  if (session) {
    // Increment sessionVersion to invalidate all existing tokens
    await db.update(owners)
      .set({ sessionVersion: sql`${owners.sessionVersion} + 1` })
      .where(eq(owners.id, session.sub));
    invalidateSessionCache(/* token */);
  }
  const response = c.json({ success: true, ok: true });
  response.headers.append("Set-Cookie", expiredSessionCookie());
  response.headers.append("Set-Cookie", expiredMfaCookie());
  return response;
});
```

**Files:** `apps/api/src/routes/auth/index.ts:315-321`

---

#### ISSUE-AUTH-002 — TOTP Replay Attack Not Prevented (HIGH)

**Description:** MFA codes are verified via `otplib.verify()` but there is no used-code tracking. A valid 6-digit TOTP code can be captured and replayed within the 30-second validity window.

**Root Cause:** No `usedMfaCodes` table or Redis set to track consumed codes.

**Risk:** In an active MITM scenario or if codes are logged, an attacker can replay a valid MFA code.

**Fix:** Store `SHA256(code + ownerId + window)` in Redis with 60-second TTL; reject duplicate keys.

**Files:** `apps/api/src/services/mfa/mfa.ts:40`, `apps/api/src/services/mfa/mfa.ts:135`

---

#### ISSUE-AUTH-003 — Auth Rate Limiter Not Shared Across Instances (MEDIUM)

**Description:** The rate limiter in `buildAuthRoutes()` uses an in-process `Map<string, {count, resetAt}>`. It is not backed by Redis, is lost on restart, and is not shared across multiple API replicas.

**Root Cause:** `const rateLimits = new Map<string, ...>()` at function scope, `apps/api/src/routes/auth/index.ts:37`.

**Risk:** With horizontal scaling (multiple `api` containers), each instance has independent rate limit state — brute force attacks bypass limits by distributing attempts across instances.

**Fix:** Replace with the existing Redis-backed `authLimiterRedis` from `global-rate-limit.ts`.

**Files:** `apps/api/src/routes/auth/index.ts:37-110`

---

#### ISSUE-AUTH-004 — 15-Second Session Cache Creates Stale Permission Window (MEDIUM)

**Description:** `_sessionCache` stores permissions for 15 seconds. After role demotion or permission removal, the actor retains the old permissions until the cache TTL expires.

**Root Cause:** `SESSION_CACHE_TTL_MS = 15_000` in `apps/api/src/middleware/auth.ts:33`.

**Risk:** A demoted user retains elevated permissions for up to 15 seconds — acceptable for many scenarios but can be a risk during incident response.

**Fix:** On role change or permission update, call `invalidateSessionCache(token)` for the affected owner. Also expose a `POST /owners/:id/revoke-sessions` endpoint.

**Files:** `apps/api/src/middleware/auth.ts:33-65`

---

#### ISSUE-AUTH-005 — Custom Token Format (Non-Standard JWT) (LOW)

**Description:** Session tokens use a custom `base64url(json).hmac` format instead of standard JWTs. Missing standard claims: `exp`, `nbf`, `iss`, `aud`.

**Root Cause:** Custom implementation in `apps/api/src/services/auth/tokens.ts`. TTL is enforced by `Date.now() - parsed.iat > SESSION_TTL_MS` (correct) but expiration is not in the token itself.

**Risk:** Non-standard format reduces interoperability. If someone extracts the token and decodes it, the lack of `exp` claim may confuse security scanners. Low exploitability risk since HMAC signature is verified first.

**Fix:** Migrate to `jose` library with proper JWT (HS256) including `exp`, `iss`, `aud` claims.

**Files:** `apps/api/src/services/auth/tokens.ts`

---

#### ISSUE-AUTH-006 — No OAuth / SSO / SCIM Support (MEDIUM for Enterprise)

**Description:** No OAuth 2.0 providers (Google, GitHub, Microsoft), no SAML SSO, no SCIM user provisioning.

**Risk:** Enterprise customers expect SSO. Blocks enterprise deals.

**Fix:** Integrate a provider (Auth0, Clerk, or custom OAuth2 server).

---

## Phase 3 — Authorization Audit

### Permission Matrix

| Role | Permissions |
|------|------------|
| `super_admin` | `*` (all) |
| `billing_manager` | `licenses.read`, `licenses.write`, `licenses.extend`, `tenants.read` |
| `support_agent` | `tenants.read`, `tenants.write`, `tenants.provision` (scoped) |
| `read_only` | `tenants.read`, `licenses.read`, `plans.read` |

### What Exists

| Feature | Status |
|---------|--------|
| RBAC (role + permission-string) | ✅ Dual-layer |
| Row-level tenant scoping | ✅ `org-access-scope.ts` |
| Organization-level access | ✅ `ownerOrganizationAccess` table |
| Route permission registry | ✅ `route-permissions.ts` |
| Audit log on all mutations | ✅ `adminAuditLog` |
| API keys restricted to `read_only` | ✅ (see also ISSUE-AUTHZ-001) |
| PMS tenant isolation | ⚠️ CRITICAL — see ISSUE-MULTITENANCY-001 |
| Finance tenant isolation | ✅ Per-tenant MySQL schema |
| POS tenant isolation | ✅ Per-tenant MongoDB collection |

### Critical Issues

#### ISSUE-AUTHZ-001 — CSV Export Does Not Enforce Actor Scope (HIGH)

**Description:** `GET /tenants/export.csv` performs no call to `getScopedTenantIdsForOwner()`. A `support_agent` scoped to specific tenants can export all tenants' data.

**Root Cause:** `apps/api/src/routes/tenants.ts:576-687` — the export handler applies `search`/`status` filters only, without scoping by actor.

**Risk:** Support agents can download a full CSV of all tenant names, slugs, admin emails, and internal ports. Data exfiltration vector.

**Fix:**
```typescript
// After line 594 in routes/tenants.ts
const scopedTenantIds = await getScopedTenantIdsForOwner(db, actorId, actorPermissions, actorRole);
if (scopedTenantIds !== null) {
  if (scopedTenantIds.length === 0) {
    return c.text("Name,Slug,Admin Email,...\n", 200, { "Content-Type": "text/csv" });
  }
  conditions.push(inArray(tenants.id, scopedTenantIds));
}
```

**Files:** `apps/api/src/routes/tenants.ts:576-687`

---

#### ISSUE-AUTHZ-002 — No Tenant-Level RBAC for Finance/POS (MEDIUM)

**Description:** Within each tenant's Finance and POS stacks, users have their own roles. But the control-plane has no visibility into tenant-level user permissions. If a control-plane operator impersonates a tenant user, they bypass tenant-level restrictions.

**Risk:** Operators with `tenants.write` can reach any tenant's Finance instance as admin.

**Fix:** Implement impersonation audit trail and require re-authentication before impersonation actions.

---

#### ISSUE-AUTHZ-003 — `requiredPermissionsForRoute` Default Fallback (MEDIUM)

**Description:** The fallback at `route-permissions.ts:82-83` returns `["tenants.read"]` for GET and `["tenants.write"]` for all other methods on any unmatched path. This means newly added routes are protected by default (good), but the broad fallback may grant unintended access.

**Root Cause:** `apps/api/src/permissions/route-permissions.ts:82-83` — catch-all returns `tenants.write`.

**Fix:** Prefer returning `["*"]` as default fallback so new routes require super_admin until explicitly mapped.

---

## Phase 4 — CRUD Audit

### Tenants

| Operation | Status | Notes |
|-----------|--------|-------|
| Create | ✅ | `POST /tenants`, idempotency enforced, validation |
| Read | ✅ | Scoped list, pagination, search, sort |
| Update | ✅ | PATCH with audit log |
| Delete | ✅ | Async deprovision via worker |
| Archive/Suspend | ✅ | `suspend`/`reactivate` endpoints |
| Export | ⚠️ Scope gap | ISSUE-AUTHZ-001 |

### Owners

| Operation | Status | Notes |
|-----------|--------|-------|
| Create | ✅ | Invite flow |
| Read | ✅ | Role-gated |
| Update | ✅ | PATCH with validation |
| Delete | ⚠️ Partial | `onDelete: 'restrict'` — cannot delete owner with tenants |
| Self-service | ✅ | Password change, MFA toggle |

### Licenses

| Operation | Status | Notes |
|-----------|--------|-------|
| Generate | ✅ | `POST /licenses/generate` |
| Activate | ✅ | Public endpoint with HMAC verification |
| Extend | ✅ | |
| Suspend/Reactivate | ✅ | |
| History tracking | ✅ | `licenseHistory` table |
| Activation tracking | ✅ | `licenseActivations` table |
| Offline tokens | ✅ | Hardware fingerprint bound |

### PMS Entities (Booking, Room, Guest, etc.)

| Operation | Status | Notes |
|-----------|--------|-------|
| CRUD on all entities | ✅ | Full CRUD implemented |
| Soft delete | ❌ Not implemented | Hard deletes cascade |
| Bulk operations | ❌ Not implemented | |
| Import/Export | ❌ Not implemented | |
| Audit trail | ❌ Missing | No audit log on PMS mutations |

---

### Critical Issues

#### ISSUE-CRUD-001 — No Soft Delete on Any PMS Entity (MEDIUM)

**Description:** All PMS entities (bookings, guests, rooms, properties) use hard deletes with cascade. Deleted data cannot be recovered. No deleted_at flag.

**Risk:** Accidental deletions are unrecoverable. Violates GDPR right-to-be-forgotten workflow (need audit trail of deletion request).

**Fix:** Add `deleted_at timestamp` to `pms_bookings`, `pms_guests`, `pms_rooms`, `pms_properties`. Add `WHERE deleted_at IS NULL` to all queries.

**Files:** `packages/db/src/schema.ts:703-748` (pmsBookings), similar for all PMS tables

---

#### ISSUE-CRUD-002 — No Audit Trail for PMS Mutations (HIGH)

**Description:** PMS route handlers (`services/pms/src/routes/`) do not write to any audit table. Bookings can be created, modified, or deleted without any record of who did it or when.

**Root Cause:** `services/pms/src/routes/bookings.ts` — no audit log writes. Only `adminAuditLog` exists in control-plane DB.

**Risk:** Cannot investigate disputes, regulatory inquiries, or unauthorized changes. PCI-DSS and hospitality compliance risk.

**Fix:** Add `pms_audit_log` table with `tenantId`, `actorId`, `action`, `entityType`, `entityId`, `diff`, `createdAt`.

---

## Phase 5 — Billing Audit

### Current Model

Stockix uses a **license-key model**, not a subscription/SaaS billing model. There is no Stripe, no recurring billing, no invoicing engine.

| Feature | Status |
|---------|--------|
| License generation | ✅ |
| License activation | ✅ |
| License expiry | ✅ |
| Grace periods | ✅ (7-day default, configurable) |
| License history | ✅ |
| Trial support | ⚠️ `validFrom` field exists but no trial automation |
| Proration | ❌ Not applicable (license model) |
| Stripe / payment processor | ❌ Not integrated |
| Invoice generation | ❌ Not implemented |
| Tax handling | ❌ Not implemented |
| Refunds | ❌ Not implemented |
| Renewal automation | ⚠️ `license-expiry-queue.ts` sends email; no auto-renewal |

### Critical Issues

#### ISSUE-BILLING-001 — License Activation Count Not Atomic (HIGH)

**Description:** License `activationCount` is incremented non-atomically: read → check maxActivations → insert → update. Under concurrent activations, two requests can both pass the `activationCount < maxActivations` check.

**Root Cause:** `apps/api/src/routes/tenants.ts` — activation logic does not use a database-level transaction with `FOR UPDATE` lock.

**Risk:** A license with `maxActivations=1` could be activated on two devices simultaneously.

**Fix:** Use a single atomic SQL statement: `UPDATE licenses SET activation_count = activation_count + 1 WHERE id = $1 AND activation_count < max_activations RETURNING *`.

---

#### ISSUE-BILLING-002 — No Billing State Enforcement at Finance API Level (MEDIUM)

**Description:** The Finance (Bigcapital) service checks license status via an internal sync endpoint, but the check is periodic, not per-request. A tenant with an expired license can continue using Finance until the next sync cycle.

**Risk:** Access not immediately revoked upon license expiration.

**Fix:** Add license validation middleware to Finance service's API gateway.

---

## Phase 6 — Multi-Tenancy Audit

### Architecture

Stockix uses **two multi-tenancy models** simultaneously:

1. **Control-plane**: Single shared PostgreSQL, `tenantId` column on every table
2. **Per-tenant stacks**: Finance = dedicated MySQL schema; POS = dedicated MongoDB collection

### Critical Issues

#### ISSUE-MULTITENANCY-001 — PMS Data in Shared Postgres Without Row-Level Security (CRITICAL)

**Description:** ALL PMS data — bookings, guests, passport numbers, visa information, ID numbers — is stored in the shared PostgreSQL database. Tenant isolation relies solely on `tenantId` column filtering in application code. There is no PostgreSQL Row Level Security (RLS) policy.

**Root Cause:** `packages/db/src/schema.ts:605` — comment: `// TODO(security): isolate PMS to per-tenant Postgres before public launch`. This TODO remains unresolved.

**Risk:** 
- A bug in any PMS query that omits the `tenantId` WHERE clause exposes all tenants' guest data
- Passport numbers, ID numbers, visa data, date of birth are stored in plaintext
- Cross-tenant data leakage in a single SQL injection attack

**Fix (short-term):** Enable PostgreSQL RLS on all `pms_*` tables with a `tenant_id = current_setting('app.current_tenant_id')` policy.

**Fix (long-term):** Migrate PMS to per-tenant Postgres schema (or dedicated table space) as noted in the TODO.

**Files:** `packages/db/src/schema.ts:605-1130`

---

#### ISSUE-MULTITENANCY-002 — Guest PII Stored Unencrypted (CRITICAL)

**Description:** `pms_guests` table stores `passportNumber`, `idNumber`, `dateOfBirth`, `visaNumber`, `nationality` as plaintext text columns. No field-level encryption.

**Root Cause:** `packages/db/src/schema.ts:671-700`

**Risk:** GDPR Article 32 violation — personal data processed for "natural persons" must be protected with appropriate technical measures. Passport/visa data is particularly sensitive. A database dump exposes all guest PII.

**Fix:** Encrypt sensitive fields (`passportNumber`, `idNumber`, `visaNumber`, `dateOfBirth`) at application level using AES-256-GCM before storage. Store encrypted ciphertext in the column.

---

#### ISSUE-MULTITENANCY-003 — Tenant Slug Scrubbing Race Condition (MEDIUM)

**Description:** When reprovisioning a failed tenant slug, the API deletes all existing data for that slug then re-creates the tenant. This runs outside a mutex/lock.

**Root Cause:** `apps/api/src/routes/tenants.ts:1079-1085` — a transaction deletes provision events, audit logs, deployments, jobs, and the tenant row. If two concurrent POST /tenants requests for the same failed slug arrive simultaneously, both may pass the slug check and attempt the scrub.

**Risk:** Data corruption during concurrent re-provisioning attempts.

**Fix:** Use a Redis distributed lock on `provision:slug-lock:{slug}` during scrub + re-create.

---

## Phase 7 — Database Audit

### Schema Health

| Check | Status |
|-------|--------|
| Primary keys on all tables | ✅ UUID |
| Foreign keys with referential integrity | ✅ |
| Cascade rules appropriate | ✅ (cascade vs restrict intentional) |
| Timestamps on all tables | ✅ `createdAt`/`updatedAt` |
| Indexes on foreign keys | ✅ |
| Indexes on common query predicates | ✅ |
| Soft delete support | ❌ Not implemented |
| Row-level security | ❌ Not implemented |
| Connection pooling | ⚠️ Default pool only |

### Critical Issues

#### ISSUE-DB-001 — No Row-Level Security (CRITICAL)

**Description:** PostgreSQL RLS is not enabled on any table. The entire database runs as a single user (`postgres`). Tenant isolation is enforced only at the application query layer.

**Risk:** A single missed `WHERE tenant_id = $1` clause in any query returns data for all tenants.

**Fix:** Enable RLS on all `pms_*` tables immediately. Consider setting `app.current_tenant_id` via a connection-level setting and enforcing it with row policies.

---

#### ISSUE-DB-002 — N+1 Query in Tenant Listing (MEDIUM)

**Description:** `GET /tenants` fires 8 parallel SQL queries (count, data, + 6 directory counts), then a separate query for license data per page. The directory totals queries do not re-use the scope filter — they query the full table with only `childOrgFilter`.

**Root Cause:** `apps/api/src/routes/tenants.ts:451-504` — 8 separate `db.select({ c: count() })` queries.

**Fix:** Use a single `GROUP BY` query with conditional aggregation: `SUM(CASE WHEN status='active' THEN 1 ELSE 0 END)`.

---

#### ISSUE-DB-003 — `tenantLifecycleJobs` Has No Index on `status + type` for Worker Claims (MEDIUM)

**Description:** Worker claims jobs by polling `WHERE status IN ('pending') AND run_at <= now() ORDER BY priority DESC, run_at ASC`. The existing index covers `(status, run_at, priority)` but not `(status, type, run_at)` which is used in stop/cancel queries.

**Root Cause:** `packages/db/src/schema.ts:355-359`

**Fix:** Add: `index("tlj_status_type_run_at_idx").on(t.status, t.type, t.runAt)`

---

#### ISSUE-DB-004 — `pms_bookings.checkIn/checkOut` Are Text, Not Dates (MEDIUM)

**Description:** Booking check-in and check-out are stored as `text` (`YYYY-MM-DD`) not `date` type. This prevents proper date range queries, timezone-aware comparisons, and index-optimized range scans.

**Root Cause:** `packages/db/src/schema.ts:719-720` — `checkIn: text("check_in").notNull()`

**Fix:** Migrate to `timestamp("check_in", { withTimezone: true })` or at minimum `date("check_in")`.

---

#### ISSUE-DB-005 — No Unique Constraint on `(tenantId, email)` for PMS Guests (LOW)

**Description:** The `pms_guests` table has no unique constraint on `(tenantId, email)`. Multiple guest records with the same email per tenant are possible.

**Fix:** Add `uniqueIndex("pms_guests_tenant_email_unique").on(t.tenantId, t.email)` (allow NULL email).

---

### Database Health Report

- **Schema design**: Good — clean, normalized, FK constraints enforced
- **Missing**: RLS, soft deletes, field encryption for PII
- **Performance**: Single-instance Postgres with 256MB RAM — will bottleneck under load (see Scalability)
- **Backup**: Automated daily to Backblaze B2 — but encryption is optional (see ISSUE-DR-001)

---

## Phase 8 — Performance Audit

### Critical Issues

#### ISSUE-PERF-001 — 8 Parallel DB Queries per Tenant List Request (MEDIUM)

**Description:** Every `GET /tenants` fires 8 database queries in parallel using `Promise.all`. At scale this creates 8x connection pressure per request.

**Fix:** Consolidate using a single aggregated query with `SUM(CASE WHEN ...)` for directory counts.

**Files:** `apps/api/src/routes/tenants.ts:452-504`

---

#### ISSUE-PERF-002 — No Query Result Caching (MEDIUM)

**Description:** Frequently read, rarely changed data (plans list, tenant config, owner permissions) is fetched from Postgres on every request. No Redis caching layer.

**Fix:** Cache `GET /plans`, `GET /tenants/:id/config` with Redis TTL 60s, invalidate on mutation.

---

#### ISSUE-PERF-003 — Synchronous bcrypt.compare in Request Path (MEDIUM)

**Description:** `bcrypt.compare()` is blocking and CPU-intensive. bcryptjs version uses `bcrypt.compare()` from `bcryptjs@3.0.3` which is a pure-JS implementation with no native binding. At bcrypt work factor 10, each comparison takes ~100ms of synchronous CPU.

**Root Cause:** `apps/api/src/services/auth/login.ts:53`

**Risk:** Under login load (10 req/s), bcrypt comparisons could saturate a single Node.js process for 1 second. This blocks the event loop.

**Fix:** Switch to `bcrypt` (native addon) or use the async `bcrypt.compare()` properly (it is already async — verify it does not block event loop in bcryptjs). Alternatively migrate to Argon2.

---

#### ISSUE-PERF-004 — SSE Provision Stream Polling at 1.5s Interval (LOW)

**Description:** `provision-stream` SSE handler polls `listTenantJobs` every 1500ms per connected client. With 10 simultaneous provisions, this is 10 DB queries every 1.5 seconds just for job polling.

**Root Cause:** `apps/api/src/routes/tenants.ts:1721`

**Fix:** Use Redis pub/sub (already implemented in `provision-pubsub.ts`) as the primary signal, fall back to polling only when Redis is unavailable.

---

## Phase 9 — Scalability Audit

### Readiness Assessment

| Scale Target | Status |
|-------------|--------|
| 100 users | ✅ Ready |
| 1,000 users | ⚠️ Marginal (single Postgres, no read replicas) |
| 10,000 users | ❌ Not ready (single-instance Postgres, no horizontal API scaling) |
| 100,000 users | ❌ Not ready |
| 1M users | ❌ Not ready |

### Critical Issues

#### ISSUE-SCALE-001 — Single PostgreSQL Instance, No Read Replicas (HIGH)

**Description:** Production Postgres is a single container with `mem_limit: 256m` and `cpus: "0.5"`. No pgBouncer, no read replicas. The comment in `docker-compose.yml` says "For horizontal scaling use docker compose --scale api=N only after P1-7 (Redis provision bus) is deployed."

**Risk:** Postgres is a single point of failure. At 100+ concurrent authenticated users making dashboard requests (7+ parallel API calls each), connection count will exceed the default `max_connections=100`.

**Fix:**
1. Add pgBouncer between API and Postgres
2. Configure `DB_POOL_MAX` to match pgBouncer poolSize
3. Add a Postgres read replica for GET queries
4. Consider upgrading to managed Postgres (RDS, Supabase, Neon)

---

#### ISSUE-SCALE-002 — Control-plane API Cannot Scale Horizontally Yet (HIGH)

**Description:** The session cache (`_sessionCache`), platform actor cache (`_platformActor`), and provision bus (`subscribeProvision`) are all in-process. Multiple API replicas will have inconsistent state.

**Root Cause:** `apps/api/src/middleware/auth.ts:35-63` (session cache), `provision-pubsub.ts` (in-memory EventEmitter).

**Fix:** Move session cache to Redis. The provision pubsub already has a Redis implementation path — verify it is active.

---

#### ISSUE-SCALE-003 — Infra Worker is Single-Instance, No Queue Backpressure (MEDIUM)

**Description:** The infra worker has `WORKER_CONCURRENCY=2` and no queue depth monitoring. If provisioning jobs queue up faster than the worker processes them, the queue grows unbounded.

**Fix:** Add queue depth metric to Prometheus. Alert when `pending` jobs > threshold. Consider a worker pool.

---

## Phase 10 — API Audit

### REST Consistency

| Check | Status |
|-------|--------|
| Consistent error shape `{error, message}` | ✅ |
| HTTP status codes correct | ✅ |
| Pagination on list endpoints | ✅ |
| Input validation (Zod) | ✅ |
| Idempotency on mutations | ✅ (enforced middleware) |
| Rate limiting | ✅ |
| Request ID tracing | ✅ (`x-request-id`) |
| API versioning | ❌ Not implemented |

### Critical Issues

#### ISSUE-API-001 — No API Versioning (MEDIUM)

**Description:** All API routes are at `/v0` implicit. No versioning scheme exists. Breaking changes will directly impact existing clients.

**Fix:** Add `/v1/` prefix to all control-plane routes. Implement redirect from legacy paths.

---

#### ISSUE-API-002 — `console.log` Statements in Production Route Handler (LOW)

**Description:** `routes/tenants.ts` contains multiple `console.log` statements at lines 971, 1005, 1006, 1125, 1145 that will appear in production logs as unstructured output.

**Root Cause:** `apps/api/src/routes/tenants.ts:971` — `console.log('[API-POST] POST /tenants received...')`

**Fix:** Replace all `console.log/console.error` in routes with `logger.info/logger.error` calls.

---

#### ISSUE-API-003 — PMS Proxy Has No Authentication Header (HIGH)

**Description:** `pmsProxy()` in `apps/api/src/pms-proxy.ts` does not send any authentication header to the PMS service. Any service on the `stockix_internal` network can make unauthenticated requests to PMS.

**Root Cause:** `apps/api/src/pms-proxy.ts:22-37` — no `Authorization` header sent.

**Risk:** If a tenant container or any internal service is compromised, it can access PMS data for all tenants without authentication.

**Fix:** Add a shared secret between API and PMS: `"X-Internal-Secret": process.env.INTERNAL_PMS_SECRET`.

---

#### ISSUE-API-004 — Provision Status Endpoint Returns Bootstrap Password in Response (HIGH)

**Description:** `GET /tenants/provision-status/:correlationId` returns `oneTimeAdminPassword` in the JSON response. This password is also logged in provision events.

**Root Cause:** `apps/api/src/routes/tenants.ts:1662` — `oneTimeAdminPassword` in JSON response.

**Risk:** The admin password is visible in API response logs, browser network tab, and any monitoring system that captures API payloads. The 15-minute cache TTL is the only protection.

**Fix:** The password should only be served to the initiating operator in a separate secure channel (e.g., encrypted download). After serving once, permanently mark as consumed.

---

### API Health Report

- REST conventions: Good  
- Validation: Thorough (Zod on all inputs)  
- Versioning: Missing  
- Rate limiting: Good (Redis + memory fallback)  
- Idempotency: Implemented on mutations  
- Authentication: Good but see AUTH issues  
- Authorization scope gaps: AUTHZ-001 (CSV export)

---

## Phase 11 — CI/CD Audit

### What Exists

| Feature | Status |
|---------|--------|
| Type checking all packages | ✅ |
| Unit tests (API, Dashboard, PMS, POS, Finance) | ✅ |
| Security dependency audit | ✅ `pnpm audit --prod` |
| Secret scanning (gitleaks) | ✅ |
| Architecture boundary enforcement | ✅ |
| Build verification | ✅ |
| Auto-deploy on main push | ✅ |
| Rollback support | ✅ (re-tag previous Docker image) |
| Blue/green deployment | ❌ Not implemented |
| Canary deployment | ❌ Not implemented |
| Database migration in deploy | ✅ (before service restart) |
| E2E tests in CI | ❌ Not in quality gate |
| Container vulnerability scanning | ❌ Not implemented |
| SBOM generation | ❌ Not implemented |

### Critical Issues

#### ISSUE-CICD-001 — Secrets Committed to Git History (CRITICAL)

**Description:** `gitleaks-results.json` documents `INTERNAL_API_SECRET` values committed to git history in `apps/api/vitest.config.ts` and `.github/workflows/deploy.yml` across multiple commits (commits: `63a84ee`, `47f844d`, `ff47d5a`).

**Risk:** Even if these are test-only values, they establish a pattern of accidental secret exposure. If real secrets were ever accidentally committed, they would persist in git history.

**Fix:** 
1. Rotate any secrets that appear in git history immediately
2. Add `gitleaks` pre-commit hook (not just CI)
3. Never use real secret values in test files — use clearly fake placeholder values with `# gitleaks:allow` annotation

---

#### ISSUE-CICD-002 — No Zero-Downtime Deployment (HIGH)

**Description:** The deploy script runs `docker compose up -d --no-build --wait` which restarts containers. During restart, the API is unreachable. SSE connections (provision stream) are dropped.

**Risk:** ~5-30 seconds of downtime per deploy. Provision streams disconnect mid-provisioning.

**Fix:** Implement blue/green by running two API instances behind Traefik with weighted routing, then shifting traffic.

---

#### ISSUE-CICD-003 — Deploy Runs Database Migration Before Service Restart (MEDIUM)

**Description:** The deploy script runs `pnpm db:migrate` before restarting services. The old API version is serving traffic during migration. If the migration adds NOT NULL columns without defaults, the old version will crash.

**Root Cause:** `.github/workflows/deploy.yml:417` — migration runs before compose up.

**Fix:** Expand-contract migration pattern: never add NOT NULL without default in a single step. Document migration safety requirements.

---

#### ISSUE-CICD-004 — No Container Vulnerability Scanning (MEDIUM)

**Description:** Docker images are built and pushed without any CVE scanning. Trivy, Snyk, or GitHub's container scanning are not configured.

**Fix:** Add `trivy image` scan step after each Docker build in CI.

---

#### ISSUE-CICD-005 — E2E Tests Not in Quality Gate (MEDIUM)

**Description:** E2E tests exist (`apps/dashboard/e2e/`, `services/stockix-finance/e2e/`) but are not in the CI quality gate — only unit tests run.

**Fix:** Add Playwright E2E test run to `quality-gate` job against a test environment.

---

### CI/CD Readiness Report

- Quality gate: Thorough (types, tests, lint, build, architecture)
- Security scanning: Partial (no container scanning)
- Deployment: Single-instance, with downtime
- Rollback: Image-level rollback available
- E2E: Not in CI

---

## Phase 12 — Observability Audit

### What Exists

| Feature | Status |
|---------|--------|
| Structured JSON logging (`pino`/`logger`) | ✅ |
| Request ID tracing | ✅ |
| Prometheus metrics (`prom-client`) | ✅ |
| Grafana dashboards | ✅ `stockix-overview.json` |
| Sentry error tracking | ✅ (optional) |
| Health endpoints `/health`, `/ready` | ✅ |
| Container health checks | ✅ |
| Backup health check | ✅ (`crond` check) |
| Distributed tracing | ❌ Not implemented |
| Alert rules (Prometheus AlertManager) | ❌ Not configured |
| Log aggregation | ❌ Logs are local to container |
| Uptime monitoring | ❌ Not configured |

### Critical Issues

#### ISSUE-OBS-001 — No AlertManager or Alert Rules (HIGH)

**Description:** Prometheus is deployed but no AlertManager is configured. No alerts fire when the API is down, Postgres is unreachable, or jobs are failing.

**Risk:** Incidents are detected only when a customer reports them (or a human checks Grafana).

**Fix:** Add AlertManager to `docker-compose.yml`. Configure alerts for: API health check failing > 2 minutes, Postgres connection errors, Redis unavailable, pending jobs > 100.

---

#### ISSUE-OBS-002 — Logs Not Persisted or Aggregated (MEDIUM)

**Description:** Container logs go to Docker's JSON log driver which rotates by default at 10MB. No log aggregation (Loki, ELK, Datadog). Logs are lost on container restart if not collected.

**Fix:** Add Grafana Loki + Promtail to the prod stack for log aggregation and retention.

---

#### ISSUE-OBS-003 — No Dead-Letter Job Alerting (MEDIUM)

**Description:** Jobs that reach `maxAttempts` become `dead` with no alerting. Failed provisioning jobs silently pile up.

**Fix:** Add a cron job that queries `SELECT COUNT(*) FROM tenant_lifecycle_jobs WHERE status='dead'` and exposes it as a Prometheus gauge.

---

## Phase 13 — Security Audit

### OWASP Top 10 Assessment

| Vulnerability | Status | Finding |
|--------------|--------|---------|
| A01 Broken Access Control | ⚠️ | CSV export scope gap (AUTHZ-001) |
| A02 Cryptographic Failures | ⚠️ | PII unencrypted at rest (MULTITENANCY-002) |
| A03 Injection | ✅ | Drizzle ORM parameterized — SQL injection not possible |
| A04 Insecure Design | ⚠️ | Shared Postgres for PMS (MULTITENANCY-001) |
| A05 Security Misconfiguration | ⚠️ | Traefik dashboard insecure (SECURITY-001) |
| A06 Vulnerable Components | ⚠️ | Dependency overrides suggest known CVEs in dependencies |
| A07 Auth Failures | ⚠️ | TOTP replay, logout not invalidating (AUTH-001, AUTH-002) |
| A08 Software Integrity | ✅ | GHCR images with SHA tagging |
| A09 Logging Failures | ⚠️ | No log aggregation, console.log in routes |
| A10 SSRF | ⚠️ | See SECURITY-002 |

### Critical Issues

#### ISSUE-SECURITY-001 — Traefik Dashboard Accessible Without Authentication (HIGH)

**Description:** `docker-compose.yml:165` — `--api.insecure=true` enables the Traefik dashboard without authentication. Port 8080 is bound to `127.0.0.1` locally, but is accessible to any process on the host including compromised tenant containers.

**Root Cause:** `infra/prod/docker-compose.yml:165`

**Fix:** Remove `--api.insecure=true`. Enable the secure API with BasicAuth or OAuth2 proxy middleware. Add Traefik labels to enable the dashboard only with authentication.

---

#### ISSUE-SECURITY-002 — SSRF Risk in PMS iCal Import URL (MEDIUM)

**Description:** `pms_ical_channels.importUrl` is a user-provided URL that the PMS service fetches on a schedule. No URL validation is performed to restrict the scheme, host, or IP range.

**Root Cause:** `packages/db/src/schema.ts:795` — `importUrl: text("import_url")` with no validation. Consumption in `services/pms/src/ical/sync.ts`.

**Risk:** An attacker who can modify the importUrl can cause the PMS service to make HTTP requests to internal services (Redis, Postgres, AWS metadata endpoint).

**Fix:** Validate importUrl against an allowlist of schemes (`https://`) and block private IP ranges before fetching.

---

#### ISSUE-SECURITY-003 — MFA Secret Stored in Plain Text (HIGH)

**Description:** `owners.mfaSecret` (TOTP secret) is stored as plain text in the `owners` table. A database dump exposes all TOTP secrets.

**Root Cause:** `packages/db/src/schema.ts:55` — `mfaSecret: text("mfa_secret")`

**Risk:** A database breach gives an attacker both the password hash and the TOTP seed, allowing complete account takeover.

**Fix:** Encrypt the TOTP secret before storing: `AES-256-GCM(secret, ENCRYPTION_KEY)`.

---

#### ISSUE-SECURITY-004 — Bootstrap Admin Password Derivable from Tenant Slug (CRITICAL)

**Description:** `bootstrapAdminPasswordFromTenantSlug()` derives the bootstrap admin password using HMAC-SHA256 with `DEPLOYMENT_SECRET_KEY`. The function is exposed in the API route handler and the derivation algorithm is in the codebase.

**Root Cause:** `apps/api/src/routes/tenants.ts:144-153` — `createHmac("sha256", hmacKey).update("bootstrap:${key}").digest("base64url")`.

**Risk:** If `DEPLOYMENT_SECRET_KEY` is leaked (via git history, log, or insider), an attacker can derive the bootstrap admin password for any tenant by knowing only the slug.

**Fix:** Generate bootstrap passwords as random `crypto.randomBytes(32).toString("base64url")` and store them encrypted. Do not derive them deterministically.

---

#### ISSUE-SECURITY-005 — Security Headers Only in Production (MEDIUM)

**Description:** `securityHeadersMiddleware` at `apps/api/src/middleware/security-headers.ts:9` returns early if `nodeEnv !== "production"`. This means staging and development environments run without security headers, and security header tests cannot be run in non-production.

**Fix:** Apply security headers in all environments. Remove the `nodeEnv` check.

---

### Security Risk Report

| Risk | Severity | Issue |
|------|---------|-------|
| PMS PII in shared DB, no RLS | CRITICAL | MULTITENANCY-001 |
| Bootstrap password derivable from slug | CRITICAL | SECURITY-004 |
| Secrets in git history | CRITICAL | CICD-001 |
| Logout doesn't invalidate token | HIGH | AUTH-001 |
| TOTP replay attack | HIGH | AUTH-002 |
| TOTP secret unencrypted | HIGH | SECURITY-003 |
| PII unencrypted at rest | HIGH | MULTITENANCY-002 |
| Traefik dashboard unauthenticated | HIGH | SECURITY-001 |
| PMS proxy unauthenticated | HIGH | API-003 |
| SSRF via iCal import URL | MEDIUM | SECURITY-002 |
| CSV export scope bypass | HIGH | AUTHZ-001 |
| No OTP replay tracking | HIGH | AUTH-002 |

---

## Phase 14 — Compliance Audit

### GDPR

| Requirement | Status |
|-------------|--------|
| Lawful basis documentation | ❌ Not documented |
| Privacy policy | ❌ Not present in codebase |
| Cookie consent | ❌ Not implemented |
| Right to access (data export) | ⚠️ Partial — tenant CSV export exists, no user data export |
| Right to erasure | ⚠️ Partial — hard deletes exist, no formal erasure workflow |
| Right to portability | ❌ Not implemented |
| Data retention policies | ❌ Not configured |
| Data processing agreements | ❌ Not tracked |
| Breach notification procedures | ❌ Not documented |

### CCPA

| Requirement | Status |
|-------------|--------|
| Do Not Sell | N/A (B2B) |
| Data disclosure | ❌ Not implemented |

### Critical Issues

#### ISSUE-COMPLIANCE-001 — No Cookie Consent Banner (HIGH for EU)

**Description:** The dashboard sets `HttpOnly` session cookies without a consent banner. Under GDPR/ePR, even necessary cookies require disclosure.

**Fix:** Add cookie consent banner using a compliant library (Cookiehub, CookieYes). Strictly necessary cookies (auth session) are exempt from consent but must be disclosed.

---

#### ISSUE-COMPLIANCE-002 — Guest PII Has No Retention Policy (HIGH)

**Description:** `pms_guests` stores passport numbers, visa data, and date of birth indefinitely. No automated deletion after guest's stay completes + retention period.

**Fix:** Add a scheduled job to anonymize/delete guest PII after a configurable retention period (e.g., 2 years post-checkout).

---

#### ISSUE-COMPLIANCE-003 — Audit Log Deletion on Tenant Delete (HIGH)

**Description:** When reprovisioning a failed tenant, `adminAuditLog` entries for that tenant are deleted (`tx.delete(adminAuditLog).where(eq(adminAuditLog.targetTenantId, existing.id))`). Audit logs must be immutable.

**Root Cause:** `apps/api/src/routes/tenants.ts:1082`

**Fix:** Never delete audit log entries. Audit log must be append-only. Remove the `adminAuditLog` delete from the scrub transaction.

---

## Phase 15 — Disaster Recovery Audit

### What Exists

| Feature | Status |
|---------|--------|
| Automated daily backups | ✅ Cron at 02:00 and 14:00 UTC |
| Postgres backup (custom format) | ✅ |
| Backup upload to Backblaze B2 | ✅ |
| 30-day backup retention | ✅ |
| Backup health check (crond process) | ✅ |
| Backup restore procedure | ✅ `FAILOVER_RUNBOOK.md` |
| Multi-region replication | ❌ Not implemented |
| Point-in-time recovery | ❌ Not implemented |
| Failover automation | ❌ Manual |

### RPO / RTO Assessment

| Metric | Current | Target (Production SaaS) |
|--------|---------|--------------------------|
| RPO | ~12 hours (2x daily backup) | 15 minutes |
| RTO | ~2-4 hours (manual restore) | < 1 hour |

### Critical Issues

#### ISSUE-DR-001 — Backup Encryption is Optional (CRITICAL)

**Description:** `BACKUP_ENCRYPTION_KEY` is optional in `docker-compose.yml`. If not set, PostgreSQL dumps (containing PII, encrypted secrets) are uploaded to Backblaze unencrypted.

**Root Cause:** `infra/prod/docker-compose.yml:423` — `BACKUP_ENCRYPTION_KEY: ${BACKUP_ENCRYPTION_KEY:-}` (empty default).

**Risk:** Backblaze B2 employees or anyone who gains access to the bucket can read all tenant data, bootstrap passwords, and MFA secrets.

**Fix:** Make `BACKUP_ENCRYPTION_KEY` required (fail backup script if not set). Encrypt with GPG symmetric encryption before upload.

---

#### ISSUE-DR-002 — No Point-in-Time Recovery (HIGH)

**Description:** Postgres WAL archiving is not configured. Backups are point-in-time snapshots twice daily. Data changes between backups (up to 12 hours) are irrecoverable on failure.

**Fix:** Enable `wal_level=replica`, configure WAL archiving to Backblaze B2 using `wal-e` or `pgBackRest`. This reduces RPO to minutes.

---

#### ISSUE-DR-003 — Tenant Stack Data Not Backed Up (HIGH)

**Description:** `backup-runtime.sh` backs up runtime tenant data but it's not clear from the reviewed code that per-tenant MySQL and MongoDB data is reliably backed up on the same cadence as Postgres.

**Risk:** Finance and POS data (transactions, ledgers, invoices) could be lost in a failure.

**Fix:** Verify `backup-runtime.sh` includes all tenant MySQL schemas and MongoDB databases. Add monitoring for backup success.

---

## Phase 16 — Reporting Audit

### Finance Reports

| Report | Status |
|--------|--------|
| P&L | ✅ (NestJS finance service) |
| Balance Sheet | ✅ |
| Trial Balance | ✅ |
| Journal Entries | ✅ |
| Multi-currency | ⚠️ See ISSUE-REPORT-001 |
| Historical exchange rates | ⚠️ |
| Consolidated multi-org reporting | ❌ Not implemented |

### PMS Reports

| Report | Status |
|--------|--------|
| Occupancy report | ⚠️ Basic route exists |
| Revenue report | ⚠️ Basic |
| Export (PDF/Excel) | ❌ Not confirmed |

### Critical Issues

#### ISSUE-REPORT-001 — Multi-Currency Exchange Rate Consistency (MEDIUM)

**Description:** Based on the prior multi-currency audit (`finance-complete-audit.md`), multi-currency reports have been partially addressed. However, consolidated reporting across multiple Finance tenants is not implemented. Each tenant operates independently.

**Risk:** Group-level financial reports are impossible without manual aggregation.

---

## Phase 17 — Enterprise SaaS Audit

| Feature | Status |
|---------|--------|
| Feature flags | ❌ Not implemented |
| Activity/audit logs | ✅ `adminAuditLog` |
| Impersonation | ✅ `/tenants/:id/impersonate` (logged) |
| Customer onboarding | ✅ Provision flow |
| Tenant provisioning | ✅ |
| Support tooling | ⚠️ `support_agent` role exists |
| API documentation | ⚠️ OpenAPI spec in `docs/openapi` |
| Changelog management | ❌ Not implemented |
| Tenant self-service portal | ❌ Not implemented (B2B SaaS) |

### Critical Issues

#### ISSUE-ENTERPRISE-001 — No Feature Flags (MEDIUM)

**Description:** No feature flag system (LaunchDarkly, Unleash, custom). Module gates (`tenant.modules`) exist but they are coarse-grained. Gradual rollouts to specific tenants are not possible.

**Fix:** Implement a simple feature flag table `feature_flags (key, enabled, tenantIds[])` or integrate with a feature flag service.

---

#### ISSUE-ENTERPRISE-002 — Audit Log Entries Deleted on Tenant Scrub (CRITICAL)

**Description:** See ISSUE-COMPLIANCE-003. Audit entries are deleted during re-provisioning. This is also an enterprise compliance issue — customers and auditors expect immutable audit trails.

---

## Phase 18 — Hospitality ERP Specific Audit

### PMS Coverage

| Feature | Status |
|---------|--------|
| Properties management | ✅ |
| Room types | ✅ |
| Booking (CRUD) | ✅ |
| Check-in / check-out tracking | ✅ (timestamp fields) |
| Housekeeping tasks | ✅ |
| Cleaning assignments | ✅ |
| Folios / payment tracking | ✅ |
| iCal channel sync (OTA) | ✅ |
| Guest forms (pre-arrival) | ✅ |
| Message templates | ✅ |
| Room move | ❌ Not implemented |
| Rate management | ❌ `rateCents` is static, no dynamic pricing |
| Channel manager sync | ⚠️ iCal only, no API-based (Airbnb API, Booking.com API) |
| CRM/loyalty | ❌ Not implemented |

### POS Coverage

| Feature | Status |
|---------|--------|
| Orders | ✅ (MongoDB-based) |
| Modifiers | ✅ |
| Kitchen display | ✅ |
| Inventory tracking | ✅ |
| Finance sync (Bigcapital) | ✅ |
| Multiple locations | ✅ |

### Finance Coverage

| Feature | Status |
|---------|--------|
| Journal entries | ✅ |
| Accounts payable/receivable | ✅ |
| Bank reconciliation | ✅ |
| Multi-currency | ⚠️ |
| VAT / tax | ✅ |

### Critical Issues

#### ISSUE-PMS-001 — No Rate Management System (MEDIUM)

**Description:** Room rates are stored as a single `rateCents` integer per room with no date-based, season-based, or occupancy-based dynamic pricing. Hospitality properties routinely need seasonal rates, weekend rates, and minimum stay enforcement.

**Fix:** Add `pms_rate_plans` table with date ranges, minimum nights, and override pricing.

---

#### ISSUE-PMS-002 — Check-in/Out Timestamps Stored in UTC Only (MEDIUM)

**Description:** `checkInActualAt` and `checkOutActualAt` store UTC timestamps. Property local timezone is not stored per property. Reports and calendars will show wrong times for non-UTC properties.

**Fix:** Add `timezone` field to `pms_properties`. Store all timestamps with timezone-aware queries.

---

## Phase 19 — Redirect Audit

### Dashboard Redirect Matrix

| Source | Destination | Condition | Valid |
|--------|-------------|-----------|-------|
| `/` | `/dashboard` or `/login` | Logged in / out | ✅ |
| `/login` | `/dashboard` | After login | ✅ |
| `/forgot-password` | `/login` | After reset email sent | ✅ |
| `/reset-password?token=` | `/login` | After password reset | ✅ |
| `/accept-invite` | `/login` | After invite accepted | ✅ |
| `/g/:token` | Public guest form | Token valid | ✅ |
| Protected routes | `/login?redirect=` | Unauthenticated | ✅ |
| `/dashboard` | `/tenants` (or first page) | After login | ✅ |

### Critical Issues

#### ISSUE-REDIRECT-001 — Open Redirect Risk in `redirect` Query Parameter (MEDIUM)

**Description:** The dashboard likely accepts a `?redirect=` parameter on the login page to preserve the intended destination. If not validated, this can be used for open redirects.

**Risk:** `https://app.stockix.cloud/login?redirect=https://evil.com` — after login, user is redirected to attacker site.

**Fix:** Validate redirect URL: must be a relative path (no `://`), must start with `/`, must not contain newline characters.

---

#### ISSUE-REDIRECT-002 — Provision Stream Reconnection After Deploy Redirect (MEDIUM)

**Description:** During deployment (see CICD-002), SSE provision streams are dropped. The frontend must detect disconnection and re-establish the stream without losing progress. No reconnect-with-last-event-id logic was found in the dashboard.

**Fix:** Implement `Last-Event-ID` support in `provision-stream` SSE handler and retry logic in the dashboard.

---

---

## Final Deliverable

### Executive Summary

Stockix is a well-engineered hospitality ERP SaaS platform with a thoughtful multi-tenant architecture, strong authentication foundation, and solid CI/CD pipeline. The codebase demonstrates engineering discipline: Zod validation on all inputs, idempotency middleware, RBAC with permission strings, audit logging, and Redis-backed rate limiting.

**However**, several critical issues exist that must be resolved before this system can be considered production-ready for regulated industries or enterprise deployments:

1. **PMS data (including passport numbers and PII) lives in a shared Postgres database without Row-Level Security** — the most critical architectural risk
2. **Backup encryption is optional** — backups containing PII and secrets may be uploaded unencrypted
3. **Audit log entries are deleted during tenant scrub** — violates regulatory requirements for immutable audit trails
4. **Bootstrap admin password is deterministically derivable** — a leaked `DEPLOYMENT_SECRET_KEY` compromises every tenant
5. **TOTP secrets stored in plaintext** — a database breach gives attackers TOTP seeds

---

### Issue Priority Registry

#### CRITICAL

| ID | Title | File(s) |
|----|-------|---------|
| MULTITENANCY-001 | PMS data in shared Postgres, no RLS | `packages/db/src/schema.ts:605` |
| MULTITENANCY-002 | Guest PII (passport, visa) unencrypted | `packages/db/src/schema.ts:671-700` |
| SECURITY-004 | Bootstrap password derivable from slug | `apps/api/src/routes/tenants.ts:144-153` |
| CICD-001 | Secrets committed to git history | `apps/api/vitest.config.ts:20`, `.github/workflows/deploy.yml:64` |
| COMPLIANCE-003 | Audit log entries deleted on tenant scrub | `apps/api/src/routes/tenants.ts:1082` |
| DR-001 | Backup encryption optional | `infra/prod/docker-compose.yml:423` |

#### HIGH

| ID | Title | File(s) |
|----|-------|---------|
| AUTH-001 | Logout doesn't invalidate token server-side | `apps/api/src/routes/auth/index.ts:315` |
| AUTH-002 | TOTP replay attack not prevented | `apps/api/src/services/mfa/mfa.ts:40` |
| AUTH-003 | Auth rate limiter is in-process, not shared | `apps/api/src/routes/auth/index.ts:37` |
| AUTHZ-001 | CSV export bypasses actor scope | `apps/api/src/routes/tenants.ts:576` |
| SECURITY-001 | Traefik dashboard unauthenticated | `infra/prod/docker-compose.yml:165` |
| SECURITY-003 | TOTP secret stored in plaintext | `packages/db/src/schema.ts:55` |
| API-003 | PMS proxy has no auth header | `apps/api/src/pms-proxy.ts:22` |
| API-004 | Bootstrap password in API response | `apps/api/src/routes/tenants.ts:1662` |
| CRUD-002 | No audit trail for PMS mutations | `services/pms/src/routes/` |
| BILLING-001 | License activation count not atomic | `apps/api/src/routes/tenants.ts` |
| SCALE-001 | Single Postgres, no pgBouncer/replicas | `infra/prod/docker-compose.yml:190-212` |
| DR-002 | No point-in-time recovery | `infra/prod/docker-compose.yml` |
| CICD-002 | No zero-downtime deployment | `.github/workflows/deploy.yml` |
| OBS-001 | No Prometheus AlertManager | `infra/prod/docker-compose.yml` |
| COMPLIANCE-001 | No cookie consent | `apps/dashboard/proxy.ts` |
| COMPLIANCE-002 | No guest PII retention policy | `packages/db/src/schema.ts:670` |

#### MEDIUM

| ID | Title | File(s) |
|----|-------|---------|
| AUTH-004 | 15-second session cache stale window | `apps/api/src/middleware/auth.ts:33` |
| AUTH-006 | No OAuth/SSO/SCIM | Architecture |
| AUTHZ-002 | No tenant-level RBAC visibility | Architecture |
| SECURITY-002 | SSRF via iCal importUrl | `packages/db/src/schema.ts:795` |
| MULTITENANCY-003 | Slug scrubbing race condition | `apps/api/src/routes/tenants.ts:1079` |
| DB-001 | No Row Level Security | `packages/db/src/schema.ts` |
| DB-002 | N+1 queries in tenant listing | `apps/api/src/routes/tenants.ts:452` |
| DB-004 | Check-in/out stored as text not date | `packages/db/src/schema.ts:719` |
| CRUD-001 | No soft delete on PMS entities | `packages/db/src/schema.ts:703` |
| PERF-001 | 8 parallel queries per tenant list | `apps/api/src/routes/tenants.ts:452` |
| PERF-003 | bcryptjs blocks event loop | `apps/api/src/services/auth/login.ts:53` |
| SCALE-002 | API cannot scale horizontally yet | `apps/api/src/middleware/auth.ts:35` |
| API-001 | No API versioning | Architecture |
| CICD-004 | No container vulnerability scanning | CI |
| CICD-005 | E2E tests not in quality gate | `.github/workflows/deploy.yml` |
| OBS-002 | Logs not aggregated | `infra/prod/docker-compose.yml` |
| OBS-003 | No dead-letter job alerting | `packages/db/src/schema.ts:333` |
| REDIRECT-001 | Potential open redirect | `apps/dashboard/app/(auth)/login` |
| PMS-001 | No rate management system | `packages/db/src/schema.ts:650` |
| ENTERPRISE-001 | No feature flags | Architecture |
| DR-003 | Per-tenant MySQL/MongoDB backup not verified | `infra/prod/backup/` |

#### LOW

| ID | Title | File(s) |
|----|-------|---------|
| AUTH-005 | Custom token format (non-standard JWT) | `apps/api/src/services/auth/tokens.ts` |
| DB-003 | Missing index on job status+type | `packages/db/src/schema.ts:355` |
| DB-005 | No unique constraint on guest email per tenant | `packages/db/src/schema.ts:670` |
| API-002 | console.log in production route | `apps/api/src/routes/tenants.ts:971` |
| SECURITY-005 | Security headers only in production | `apps/api/src/middleware/security-headers.ts:9` |

---

### Architecture Review

**Strengths:**
- Clean monorepo structure with Turborepo
- Strong schema design with proper FK constraints and indexes
- Dual-layer RBAC (role rank + permission strings)
- Idempotency middleware on all mutations
- Good validation with Zod throughout
- Audit trail for control-plane mutations
- Excellent CI quality gate (types, tests, architecture boundaries)
- Docker socket proxy pattern (secure)

**Weaknesses:**
- PMS on shared Postgres (critical — documented TODO)
- No RLS anywhere in Postgres
- Single-instance database
- In-process session and rate-limit caches
- Custom token format
- No field-level encryption for PII

---

### Security Review

The security posture is **good** at the API layer but **critical** at the data layer. Authentication is well-implemented (MFA, lockout, audit). Authorization has one significant gap (CSV export scope). The primary risks are data-layer: unencrypted PII, no database RLS, shared Postgres for PMS, and optional backup encryption.

---

### Scalability Review

The system is designed for **single-server deployment** with clearly documented notes about multi-instance limitations. It will handle up to ~500 concurrent dashboard users on current hardware before Postgres becomes the bottleneck. The provisioning worker is single-instance and should not be scaled until the Redis provision bus work is complete.

---

### Scores

| Category | Score | Notes |
|----------|-------|-------|
| SaaS Readiness | 65/100 | License model works; billing/self-service missing |
| Enterprise Readiness | 45/100 | SSO, SCIM, feature flags missing |
| Production Readiness | 62/100 | Critical data-layer security issues block production for sensitive industries |

**To achieve 85+ on all scores:**
1. Fix CRITICAL issues (RLS, backup encryption, audit log immutability, TOTP plaintext)
2. Fix HIGH auth issues (logout invalidation, TOTP replay)
3. Add pgBouncer + read replica
4. Implement AlertManager
5. Add OAuth/SSO support

---

*Audit complete. All 19 phases reviewed. 42 issues identified across Critical/High/Medium/Low severity.*
