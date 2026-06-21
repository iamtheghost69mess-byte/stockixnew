# STOCKIX FULL APPLICATION AUDIT

**Date:** 2026-06-20  
**Branch:** `architecture`  
**Auditor:** Claude Code (full code inspection — no assumptions)  
**Evidence basis:** Direct inspection of 80+ source files, 67 database migrations, provisioning worker domain, POS backend, Finance Bigcapital modules, email system, all API routes, Docker Compose stacks, and middleware  

---

## HOW TO READ THIS DOCUMENT

Every finding in this document is supported by a specific file reference (`file:line`). Every status uses one of these tags:

| Tag | Meaning |
|---|---|
| **IMPLEMENTED AND VERIFIED** | Code exists, logic confirmed, evidence quoted |
| **IMPLEMENTED BUT NOT VERIFIED** | Code exists but correctness/activation is unconfirmed |
| **PARTIALLY IMPLEMENTED** | Some parts exist, gaps documented |
| **NOT IMPLEMENTED** | No code found |
| **UNKNOWN** | Evidence insufficient to conclude either way |

---

## TABLE OF CONTENTS

1. [System Discovery — Product/Module Matrix](#phase-1--system-discovery--productmodule-matrix)
2. [Tenancy Architecture](#phase-2--tenancy-architecture)
3. [Provisioning Audit](#phase-3--provisioning-audit)
4. [Tenant Creation Audit](#phase-4--tenant-creation-audit)
5. [Billing & Subscriptions](#phase-5--billing--subscriptions)
6. [Module Activation](#phase-6--module-activation)
7. [Upgrade Audit](#phase-7--upgrade-audit)
8. [Downgrade Audit](#phase-8--downgrade-audit)
9. [Finance vs POS Accounting](#phase-9--finance-vs-pos-accounting)
10. [PMS + Finance Integration](#phase-10--pms--finance-integration)
11. [Organization Structure](#phase-11--organization-structure-audit)
12. [Branch vs Location Mapping](#phase-12--branch-vs-location-mapping)
13. [Chat Platform Audit](#phase-13--chat-platform-audit)
14. [Email Audit](#phase-14--email-audit)
15. [Feature Flag Audit](#phase-15--feature-flag-audit)
16. [Role & Permission Audit](#phase-16--role--permission-audit)
17. [Failure Recovery Audit](#phase-17--failure-recovery-audit)
18. [Events & Automation Audit](#phase-18--events--automation-audit)
19. [Data Ownership Audit](#phase-19--data-ownership-audit)
20. [Logging & Observability](#phase-20--logging--observability)
21. [Security Review](#phase-21--security-review)
22. [Production Readiness Scores](#phase-22--production-readiness-scores)

---

## PHASE 1 — SYSTEM DISCOVERY — PRODUCT/MODULE MATRIX

### Current State

Four licensed product modules exist in the platform. Their internal names are stored as JSON text arrays in the `tenants.modules` and `licenses.modules` columns in the control-plane PostgreSQL database.

**Evidence:** `packages/db/src/schema.ts:94`

```typescript
modules: text("modules").notNull().default('["accounting"]')
```

**Evidence:** `infra/worker-service/src/module-stacks.ts:200–232`

```typescript
export function getProvisionStackPlan(inputModules?: string[] | null) {
  const modules = resolveTenantModules(inputModules);
  return {
    finance: !moduleGating || shouldProvisionFinanceStack(modules),
    pos: modules.includes("pos"),
    pms: modules.includes("pms"),
    chat: modules.includes("chat"),
  };
}
```

**Evidence:** `apps/api/src/routes/tenant-modules.ts:25`

```typescript
const addableModuleSchema = z.enum(["pos", "pms", "chat", "accounting"]);
```

---

### Complete Module Matrix

| Internal Name | Public Name | Technology Stack | Database | Provisioned Via |
|---|---|---|---|---|
| `accounting` | Stockix Finance | NestJS / Bigcapital | MySQL (per-tenant isolated container) | Docker Compose `infra/tenant-stack/` |
| `pos` | Stockix POS | Node.js / Express backend + Next.js frontend | MongoDB (per-tenant namespace `{slug}_pos`) | Docker Compose `infra/pos-tenant-stack/` |
| `pms` | Stockix PMS | Next.js app (PMS routes in `apps/pms`) | PostgreSQL shared — control-plane tables prefixed `pms_*` | Docker Compose `infra/pms-tenant-stack/` (stack) + shared Postgres (data) |
| `chat` | Stockix Chat | Chatwoot (external shared SaaS instance) | Chatwoot's own PostgreSQL (external) | REST API call to Chatwoot platform API |

---

### Module Dependencies

| Module | Requires | Creates in DB | Shared Services Used |
|---|---|---|---|
| `accounting` | Active license, Docker images built | `tenant_deployments.financeTenantId`, `financeDefaultWarehouseId`, `financeWalkInCustomerId`, `financeCashAccountId`, `financeCardAccountId` | Shared MySQL host (`SHARED_MYSQL_HOST`), ProxySQL, shared Redis |
| `pos` | `RESEND_API_KEY`, POS Docker images built (`stockix-pos-backend:local`, `stockix-pos-frontend:local`) | `tenant_deployments.posOrganizationId`, `posUrl`, `organizations.posOrganizationId` | Shared MongoDB host (`SHARED_MONGO_HOST`), shared Redis, Traefik |
| `pms` | PMS Docker image | All `pms_*` tables in shared Postgres | Shared Postgres, Traefik |
| `chat` | `CHATWOOT_BASE_URL`, `CHATWOOT_API_ACCESS_TOKEN` | `tenants.chatwootAccountId` | Chatwoot instance (external) |

---

### Modules NOT Implemented

The following modules appear in product documentation/planning but have no code implementation:

- AI Features — NOT IMPLEMENTED
- CRM — NOT IMPLEMENTED
- Procurement — NOT IMPLEMENTED
- Booking/Reservations (standalone) — NOT IMPLEMENTED (PMS handles hotel bookings)
- Analytics — NOT IMPLEMENTED
- Inventory (standalone) — NOT IMPLEMENTED (inventory lives inside POS)

---

### How Modules Are Licensed

Every module must be included in both:

1. `tenants.modules` — control-plane authority
2. `licenses.modules` — license record copy (kept in sync by `updateTenantAndLicenseModules()`)

The Finance app reads module grants from the platform JWT token (`stockix_tenant_modules` claim), generated by `apps/api/src/services/auth/stockix-product-token.ts`. If a module is not in this claim, Finance blocks access to those features.

---

## PHASE 2 — TENANCY ARCHITECTURE

### Current State — HYBRID MODEL

Three different tenancy isolation patterns coexist in the platform. This is the most important architectural fact to understand.

---

### Pattern 1 — Finance Module: Fully Isolated Per-Tenant Stack

**Status: IMPLEMENTED AND VERIFIED**

Each Finance tenant gets:

- A dedicated Docker Compose project named `stockix-{slug}`
- A dedicated MySQL container (runs inside the shared MySQL server, isolated by database name and MySQL user credentials)
- A dedicated Redis container or shared Redis with prefixed keys
- A dedicated internal port allocated from a sequence in the database

**Evidence:** `infra/worker-service/domain/provisioner.ts:45–53`

```typescript
function sharedMysqlHost(): string {
  return process.env.SHARED_MYSQL_HOST ?? "stockix-mysql";
}
```

**Evidence:** `packages/db/src/schema.ts:194–237` — `tenant_deployments` stores `mysqlPassword`, `mysqlRootPassword`, `jwtSecret` encrypted per tenant.

The MySQL database name is derived from the tenant slug via `slugToMysqlSafe()`. Each tenant MySQL user only has access to their own database. ProxySQL (`stockix-mysql-proxy`) routes connections. ProxySQL is synced on every provision via `applyProxySqlUserSync()`.

**Cross-tenant leak risk:** LOW — dedicated MySQL credentials per tenant. ProxySQL provides additional routing isolation.

---

### Pattern 2 — PMS Module: Shared PostgreSQL with Row-Level Security

**Status: IMPLEMENTED BUT NOT VERIFIED (RLS activation uncertain)**

All PMS data (properties, rooms, guests, bookings, payments, etc.) lives in the same PostgreSQL database that hosts the control-plane tables. Tenant isolation relies on:

1. **Application layer:** Every query includes `WHERE tenant_id = $tenantId` (verified in Drizzle ORM queries in PMS routes)
2. **Database layer:** PostgreSQL Row-Level Security (RLS) policies added by migration `0060_pms_rls.sql`

**Evidence:** `packages/db/drizzle/0060_pms_rls.sql`

```sql
-- Creates dedicated role WITHOUT superuser
CREATE ROLE stockix_pms_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Session variable helper
CREATE OR REPLACE FUNCTION current_pms_tenant_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

-- RLS enabled on all 18 pms_* tables
ALTER TABLE pms_properties ENABLE ROW LEVEL SECURITY;
-- ... (17 more tables)

-- Isolation policy
CREATE POLICY pms_tenant_isolation ON pms_properties
  USING (tenant_id = current_pms_tenant_id())
  WITH CHECK (tenant_id = current_pms_tenant_id());
```

**CRITICAL CAVEAT:** RLS only blocks queries when the database connection role is `stockix_pms_app` (non-superuser). If the application connects as a PostgreSQL superuser or as a role with `BYPASSRLS`, all policies are silently skipped. Whether `DATABASE_URL` uses `stockix_pms_app` is **UNKNOWN** — it is not visible in source code and depends on runtime environment configuration.

**Schema comment at line 661:** `// TODO(security): isolate PMS to per-tenant Postgres before public launch` — the team acknowledges this as a known gap.

---

### Pattern 3 — Control Plane: Shared Postgres, Application-Layer Isolation

**Status: IMPLEMENTED AND VERIFIED**

All tenant metadata, licenses, owners, feature flags, audit logs, and organizations live in one shared PostgreSQL database with no RLS. Isolation is purely application-layer — every query filters by `tenant_id` or `actorId`.

---

### Entity Identifier Map

| Identifier | Type | Table | Purpose |
|---|---|---|---|
| `tenant_id` | UUID | All control-plane tables | Primary tenant key |
| `organization_id` | UUID | `organizations` | Sub-organization of a tenant |
| `finance_organization_id` | varchar | `organizations` | Bigcapital org ID |
| `pos_organization_id` | text | `organizations`, `tenant_deployments` | POS MongoDB org ObjectId |
| `chatwoot_account_id` | text | `tenants` | Chatwoot account ID |
| `finance_tenant_id` | integer | `tenant_deployments` | Bigcapital internal numeric tenant ID |
| `organization_number` | varchar(20) | `tenants` | Human-readable org number (ORG-00001) |
| `branch_id` | NOT IN CONTROL PLANE | Finance MySQL only | Finance branch |
| `location_id` | NOT IN CONTROL PLANE | POS MongoDB only | POS location |

---

### Tenant Isolation Leak Risk Matrix

| Risk | Severity | Evidence | Status |
|---|---|---|---|
| PMS RLS not enforced if app uses superuser DB connection | **CRITICAL** | `0060_pms_rls.sql` — RLS role created but connection role unknown | NOT VERIFIED |
| PMS shares PostgreSQL schema with control-plane tables | **HIGH** | `schema.ts:661` — TODO comment acknowledges pre-launch isolation gap | KNOWN DEBT |
| No RLS on control-plane tables (tenants, owners, licenses, etc.) | **MEDIUM** | None of the control-plane table migrations add RLS | NOT IMPLEMENTED |
| ProxySQL routing misconfiguration could allow cross-tenant MySQL access | **MEDIUM** | `provisioner.ts:91` — `applyProxySqlUserSync` runs on every provision but failure is non-fatal | PARTIALLY MITIGATED |
| POS tenants share the same MongoDB host and credentials | **MEDIUM** | `module-stacks.ts` — MongoDB URL is `MONGODB_URI` env var shared across tenants, only namespace isolated | PARTIALLY MITIGATED |
| Shared Chatwoot instance | **LOW** | Chatwoot's built-in account isolation is relied upon entirely | RELIES ON EXTERNAL |

---

## PHASE 3 — PROVISIONING AUDIT

### Current State — IMPLEMENTED AND VERIFIED

Provisioning is triggered by `POST /tenants` and executed entirely by a background worker. The API is stateless and returns `202 Accepted` immediately.

---

### Complete Provisioning Sequence

#### Step 1 — API Layer (`apps/api/src/routes/tenants-shared.ts:987–1173`)

```
POST /tenants
│
├── 1.  Check Idempotency-Key header (required — 400 if missing)
│
├── 2.  Preflight health check: database, redis, docker, provisioning_circuit_breaker
│       Returns 503 if any check fails
│
├── 3.  Parse and validate request body (Zod):
│         slug       — lowercase DNS format /^[a-z0-9]+(?:-[a-z0-9]+)*$/
│         name       — non-empty string
│         owner_id   — UUID, verified to exist in owners table
│         admin_email — valid email
│         admin_first_name, admin_last_name — required
│         plan_slug  — verified to exist as active plan
│         modules    — array of ["accounting","pos","pms","chat"]
│         assign_existing_license_id — optional UUID; verified unassigned if provided
│
├── 4.  Slug uniqueness check:
│         If slug exists with status "failed" or "provisioning" → scrub (delete tenant/deployment/jobs)
│         If slug exists with any other status → 409 slug_taken
│
├── 5.  Generate correlationId (UUID v4)
│
├── 6.  Write provision trace event (phase="api") to tenant_provision_events
│
├── 7.  INSERT tenant_lifecycle_jobs (type="tenant.provision", status="pending")
│
└── 8.  Return HTTP 202 { jobId, correlationId, poll URL, stream URL }
```

#### Step 2 — Worker Execution (`infra/worker-service/src/worker.ts`, `provision-runtime.ts`)

```
Worker polls tenant_lifecycle_jobs every N seconds
│
├── 9.  Claim job (UPDATE status="running", claimedAt, claimedBy, claimToken)
│
├── 10. Acquire Postgres advisory lock (prevent concurrent provision for same tenant)
│       → Lock key derived from tenant slug
│
├── 11. Run preflight scrub (if needsScrub=true):
│         docker compose down --remove-orphans (best-effort)
│         Remove old tenant env files
│
├── 12. Generate cryptographic secrets (CryptoTenantSecretGenerator):
│         MySQL user password   — randomBytes(24).toString("base64url")
│         MySQL root password   — randomBytes(24).toString("base64url")
│         JWT secret            — randomBytes(32).toString("hex")
│         All encrypted at rest: encryptDeploymentSecret() → "enc:v1:{base64}"
│
├── 13. Allocate internal port:
│         allocateTenantPort(db, maxPort) — atomic DB sequence, unique per tenant
│
├── 14. INSERT tenants (status="provisioning", planSlug, modules, adminEmail, etc.)
│
├── 15. INSERT tenant_deployments (status="pending", encrypted secrets, internalPort)
│
├── 16. Allocate organization number:
│         allocateOrganizationNumber() → "ORG-00001" format (atomic counter)
│         UPDATE tenants.organizationNumber
│
├── 17. INSERT organizations (isPrimary=true, status="provisioning", slug=tenantSlug)
│
├── 18. Write tenant env file to disk:
│         Path: {TENANT_ENV_ROOT}/{slug}/.env
│         Contents: MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD,
│                   MONGODB_URI, REDIS_URL, REDIS_KEY_PREFIX, JWT_SECRET, etc.
│         Written atomically (temp file → rename)
│
├── 19. Assert required Docker images exist:
│         Finance: checks compose service image tags
│         POS: checks stockix-pos-backend:local, stockix-pos-frontend:local
│
├── 20. Ensure external Docker networks exist (best-effort create)
│
├─── IF modules includes "accounting":
│   ├── 21. Run Finance Docker Compose up (infra/tenant-stack/docker-compose.yml)
│   │         Services: stockix-app, stockix-mysql (per-tenant data), stockix-redis, etc.
│   │         Uses --env-file pointing to tenant .env
│   │
│   ├── 22. Wait for Finance health endpoint (STOCKIX_FINANCE_HEALTH_TIMEOUT_MS)
│   │
│   ├── 23. Bootstrap Finance admin account:
│   │         POST /api/auth/register → { email, password, firstName, lastName }
│   │         One-time password = bootstrapAdminPassword(slug, secretKey) via HMAC-SHA256
│   │
│   ├── 24. Authenticate as Finance admin → get Finance JWT
│   │
│   ├── 25. Create Finance organization (maps to control-plane organization)
│   │
│   ├── 26. Initialize Finance org settings (currency, fiscal year, etc.)
│   │         Defaults: MENA_DEFAULTS (Middle East / North Africa)
│   │
│   ├── 27. Activate Finance warehouses (default warehouse ID stored in tenant_deployments)
│   │
│   ├── 28. Seed Finance POS defaults:
│   │         Walk-in customer, cash account, card account, default warehouse
│   │         IDs stored in tenant_deployments for POS integration wiring
│   │
│   ├── 29. Complete Finance setup wizard (marks onboarding done)
│   │
│   └── 30. Publish Traefik route: {slug}.{rootDomain} → internal port
│
├─── IF modules includes "pos":
│   ├── 31. Allocate POS ports (backend + frontend, both from port sequence)
│   │
│   ├── 32. Persist POS secrets to tenant .env:
│   │         AUTH_TOKEN_SECRET, PLATFORM_JWT_SECRET, LICENSE_SIGNING_SECRET, FIELD_ENCRYPTION_KEY
│   │
│   ├── 33. Verify required env vars (MONGODB_URI, REDIS_URL, REDIS_KEY_PREFIX)
│   │
│   ├── 34. Run POS Docker Compose up (infra/pos-tenant-stack/docker-compose.yml)
│   │         Services: pos-backend, pos-platform-worker, pos-bigcapital-worker, pos-frontend
│   │         Uses --no-build (requires pre-built images)
│   │
│   ├── 35. Wait for POS backend health (waitForPosBackend)
│   │
│   ├── 36. Bootstrap POS organization:
│   │         POST /api/platform/v1/organizations → creates org in POS MongoDB
│   │         Stores posOrganizationId in tenant_deployments and organizations
│   │
│   ├── 37. Write POS Traefik config:
│   │         {slug}-pos.{rootDomain} → POS frontend port
│   │         {slug}-pos-api.{rootDomain} → POS backend port
│   │
│   └─── IF both accounting AND pos:
│       ├── 38. Wire POS-Bigcapital integration:
│       │         PUT /api/platform/v1/organizations/{posOrgId}/integration/bigcapital
│       │         Sends: financeTenantId, walkInCustomerId, cashAccountId, cardAccountId,
│       │                defaultWarehouseId, internalBaseUrl
│       │
│       └── 39. Verify POS-Bigcapital integration (health check via platform API)
│
├─── IF modules includes "pms":
│   └── 40. Run PMS Docker Compose up (infra/pms-tenant-stack/docker-compose.yml)
│             Command: docker compose up -d --build
│             Env: TENANT_ID, AUTH_TOKEN_SECRET, PLATFORM_API_SECRET, DATABASE_URL
│
├─── IF modules includes "chat":
│   └── 41. Provision Chatwoot account:
│             POST {CHATWOOT_BASE_URL}/platform/api/v1/accounts { name: tenantName }
│             Fallback: POST /auth/sign_up if platform API fails
│             Stores accountId in tenants.chatwootAccountId
│
├── 42. UPDATE tenants.status = "active"
├── 43. UPDATE tenant_deployments.status = "active"
├── 44. UPDATE organizations.status = "active"
├── 45. UPDATE tenant_deployments.registrationCompletedAt = now()
│
├── 46. Cache one-time Finance admin password (15-min TTL, in-memory Map, NEVER stored in DB)
├── 47. Cache POS default credentials (PINs, 15-min TTL, in-memory Map)
│
├── 48. Sync Finance license:
│         syncFinanceLicenseForStockixTenant(db, { stockixTenantId, financeTenantId })
│         Pushes: planSlug, status, expiresAt, maxUsers, maxOrganizations to Finance
│
├── 49. Assign/generate license:
│         If assign_existing_license_id → activate existing license for tenant
│         Else → generateLicenseKey() → INSERT licenses (status="active")
│
├── 50. Send emails:
│         sendTenantWelcomeEmail(adminEmail, tenantName, orgNumber, loginUrl)
│         sendFinanceWelcomeEmail(adminEmail, financeUrl, oneTimePassword, modules)
│         sendPosWelcomeEmail(adminEmail, posUrl, credentials[]) — if POS provisioned
│         sendProvisionCompleteOwnerEmail(provisionRequestedBy, tenantDetails)
│
├── 51. Create in-app notifications for owner dashboard
│
└── 52. UPDATE tenant_lifecycle_jobs.status = "completed"
```

---

### Provision Status Polling

Operators poll `GET /tenants/provision-status/:correlationId` or stream `GET /tenants/provision-stream/:correlationId` (SSE).

The provision trace in `tenant_provision_events` stores every step with:

- `phase` — the step name
- `level` — info/warn/error
- `message` — human-readable
- `meta` — JSON metadata (operationKey, slug, etc.)
- `createdAt` — timestamp

This provides a complete audit trail of every provisioning attempt.

---

### Provision Cancellation

`POST /tenants/provision-stop/:correlationId` or `POST /tenants/:tenantId/provision-stop`

- **Pending jobs:** Immediately marked `dead` (synchronous)
- **Running jobs:** Sets `cancelRequestedAt`, writes Redis key `tenant:provision:cancel:{correlationId}` — worker checks this at each checkpoint and aborts
- **Completed jobs:** Returns 409 (cannot cancel completed provision)

---

## PHASE 4 — TENANT CREATION AUDIT

### What Is Created On Provision

| Entity | Table/System | Created By | Cascade Delete |
|---|---|---|---|
| Tenant row | `tenants` Postgres | API (transaction) | Yes — parent of everything |
| Deployment row | `tenant_deployments` Postgres | Worker | Yes — via tenant FK cascade |
| Primary Organization | `organizations` Postgres | Worker | Yes — via tenant FK cascade |
| Organization Number | `tenants.organizationNumber` Postgres | Worker (`allocateOrganizationNumber`) | N/A — column on tenant row |
| Tenant Config | `tenant_config` Postgres | API (`ensureDefaultTenantConfig`) | Yes — via tenant FK cascade |
| License (new) | `licenses` Postgres | Worker (auto-generate) or API (assign existing) | Set null (not cascade) |
| License History | `license_history` Postgres | Worker | Yes — via license FK cascade |
| Finance Tenant | Finance MySQL (per-tenant DB) | Worker (Finance bootstrap API) | **NO** — Worker deprovision job must DELETE |
| Finance Organization | Finance MySQL | Worker | **NO** — same as above |
| Finance Warehouses | Finance MySQL | Worker (`activateFinanceWarehouses`) | **NO** |
| Finance Walk-in Customer | Finance MySQL | Worker (`seedFinancePosDefaults`) | **NO** |
| Finance Cash/Card Accounts | Finance MySQL | Worker | **NO** |
| POS Organization | POS MongoDB | Worker (`bootstrapPosOrganization`) | **NO** — Docker volume + MongoDB data must be removed by deprovision |
| POS Traefik Routes | File system + Traefik dynamic config | Worker (`writePosTraefikConfig`) | **NO** — `removePosTraefikConfig` must run |
| Chatwoot Account | Chatwoot external DB | Worker (`provisionChatwootAccount`) | **NO** — no deletion logic found |
| Provision Trace Events | `tenant_provision_events` Postgres | API + Worker | Yes — via tenant FK |
| Lifecycle Job Record | `tenant_lifecycle_jobs` Postgres | API + Worker | Set null on tenant delete |
| Email Logs | `email_logs` Postgres | Mailer | Set null |
| Owner Notifications | `owner_notifications` Postgres | Worker | Cascade on owner delete |

---

### What Is NOT Created (Common SaaS Entities Missing)

| Entity | Status | Notes |
|---|---|---|
| User accounts in control plane | NOT IMPLEMENTED | Control plane has no user table — only `owners` (platform operators). Finance and POS manage their own user tables internally. |
| Roles/Permissions for tenant users | NOT IMPLEMENTED in control plane | Finance seeds its own roles in MySQL. POS seeds its own RBAC in MongoDB. |
| Default branches | NOT IMPLEMENTED in control plane | Finance creates a default branch internally; not visible to control plane. |
| Locations | NOT IMPLEMENTED in control plane | POS creates locations internally; not visible to control plane. |
| Subscription records | NOT IMPLEMENTED | No Stripe/Paddle subscription. License is the only billing artifact. |
| Feature flags per tenant | NOT IMPLEMENTED (auto) | Feature flags table exists but no flags are seeded per-tenant automatically. |
| Trial period | NOT IMPLEMENTED | No trial state in schema or code. |
| Backup configuration | NOT IMPLEMENTED | No backup system in control plane. |

---

### Rollback & Failure Handling Per Step

| Failure Point | Rollback Behavior | Data at Risk |
|---|---|---|
| Before `INSERT tenants` | Complete — nothing persisted | None |
| After `INSERT tenants`, before Docker | Scrub job deletes Postgres rows — no Docker artifacts to clean | None (DB cleaned) |
| After Finance `compose up`, before `INSERT tenants` (impossible — tenant inserted first) | N/A | N/A |
| Finance up, Finance MySQL tenant exists, but Postgres write fails | Finance MySQL database persists with no control-plane record | **Orphaned Finance MySQL database** |
| Finance up, POS provision fails | `markTenantPartial(db, tenantId, "pos_failed")` — Finance remains up, tenant.status="partial" | Partial state — POS not provisioned |
| Both up, integration wiring fails | `markTenantPartial(db, tenantId, "wire_failed")` — both stacks up, integration broken | POS-Finance integration broken |
| After provision complete, email fails | Provision considered complete — email failure logged only, no retry | Email not sent |
| After provision complete, API process restarts | One-time admin password lost (in-memory cache evicted) | **Admin password permanently lost** |
| Chatwoot account created, provision fails afterwards | Chatwoot account persists with no tenant record | **Orphaned Chatwoot account** |

---

## PHASE 5 — BILLING & SUBSCRIPTIONS

### Current State — PARTIALLY IMPLEMENTED (Custom License System, No Payment Processing)

**No external payment gateway is integrated.** There is no Stripe, Paddle, or LemonSqueezy integration anywhere in the control-plane codebase.

The only `StripePayment` reference in the entire monorepo is inside `services/stockix-finance/packages/server/src/modules/StripePayment/` — this is Bigcapital's own payment link feature for finance users to collect invoice payments, completely unrelated to platform billing.

---

### License System

The platform uses a custom license management system. Everything billing-related flows through the `licenses` table.

**License schema (`packages/db/src/schema.ts:465–516`):**

```typescript
export const licenses = pgTable("licenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  licenseKey: text("license_key").notNull(),       // "STKX-XXXX" or "STXI-XXXX" format
  keyFormat: text("key_format").notNull().default("stkx"), // stkx | stxi
  scopedLocationId: text("scoped_location_id"),    // STXI: per-location license scope
  product: text("product").notNull().default("platform"),
  modules: text("modules").notNull().default('["accounting"]'), // JSON array
  planSlug: text("plan_slug").notNull().default("starter"),
  tenantId: uuid("tenant_id"),                     // FK to tenants (set null on delete)
  status: text("status").notNull().default("unassigned"),
  activatedAt: timestamp("activated_at"),
  validFrom: timestamp("valid_from"),
  expiresAt: timestamp("expires_at"),
  isPerpetual: boolean("is_perpetual").notNull().default(false),
  maxActivations: integer("max_activations").notNull().default(1),
  maxOrganizations: integer("max_organizations").notNull().default(1),
  maxUsers: integer("max_users"),                  // null = use plan default
  activationCount: integer("activation_count").notNull().default(0),
  gracePeriodDays: integer("grace_period_days").notNull().default(7),
  notes: text("notes"),
  createdById, revokedAt, revokedById, revokeReason,
  createdAt, updatedAt
});
```

---

### License Key Formats

**STKX (legacy):** Random keys, no embedded metadata.

**STXI (new):** Structured keys that embed `tenantId` + `locationId` + checksum. Designed for location-scoped licensing (one key per POS location). `scopedLocationId` field stores the POS MongoDB location ObjectId.

**Evidence:** `packages/shared/src/stxi-license-key.ts` (exists, not fully read but referenced by test files).

---

### Subscription States

| State | Schema Support | Code Enforcement | Notes |
|---|---|---|---|
| `unassigned` | YES | License is created but not attached to any tenant | Pre-provision state |
| `active` | YES | Checked by `getTenantLicenseEligibility()` and `isLicenseDateValid()` | Normal operating state |
| `expired` | YES | `expiresAt < now` + `gracePeriodDays` window | License overdue but in grace |
| `suspended` | YES | `applyTenantLicenseSuspend()` — cascades to Finance + POS | Manual or automatic suspension |
| `revoked` | YES | Schema: `revokedAt`, `revokedById`, `revokeReason` | Admin action |
| Trial | **NO** | Not in schema, not in code | Cannot offer trials |
| Past Due | **NO** | No concept without payment integration | |
| Cancelled | **NO** | No concept — only revoke exists | |
| Payment Failed | **NO** | No payment integration | |
| Pending Activation | **NO** | `unassigned` ≠ pending | |

---

### License Expiry Flow (Verified)

**Source:** `apps/api/src/jobs/license-expiry-queue.ts`, `apps/api/src/license-constants.ts`

```
LICENSE_EXPIRY_MILESTONE_DAYS = [90, 60, 30, 15, 7, 3, 2, 1]

Cron job runs periodically:
  For each active license approaching expiry:
    If (daysRemaining in MILESTONE_DAYS):
      sendLicenseExpiringEmail(tenant admin)
      sendLicenseExpiringEmailToPlatformOwner(owner)
      insertLicenseHistory({ action: "expiry_warning_sent" })

  After expiry:
    UPDATE licenses SET status = "expired"
    applyTenantLicenseSuspend() → suspends Docker stacks

  Grace period (default 7 days):
    Tenant remains accessible but in grace state
    sendLicenseExpiredEmail(tenant admin)

  After grace period ends:
    No automated action found — manual operator intervention required
```

**DEFAULT_GRACE_PERIOD_DAYS = 7** (source: `license-constants.ts:4`)

---

### License-to-Finance Sync

When a license changes status, the control plane syncs this to the Finance app via `syncFinanceLicenseForStockixTenant()`:

**Payload sent to Finance (`finance-license.client.ts`):**

```typescript
{
  tenantId: number,          // Finance numeric tenant ID
  planSlug: string,
  status: "active" | "expired" | "suspended" | "grace" | "revoked",
  validFrom: string,
  expiresAt: string | null,
  gracePeriodDays: number,
  maxUsers: number,
  maxActivations: number,
  maxOrganizations: number,
  isPerpetual: boolean,
  featureFlags: Record<string, boolean> | null,
  licenseKey: string | null
}
```

Finance stores this in its own `tenant_licenses` table and enforces user caps, org limits, etc.

**Sync failure mode:** Fire-and-forget with non-fatal logging. `apiConfig.financeLicenseSyncOptional` controls whether failures are tolerated. If Finance sync fails silently, Finance may enforce wrong limits.

---

### Plans Table

**Schema (`packages/db/src/schema.ts:435–463`):**

```typescript
export const plans = pgTable("plans", {
  id, name, slug, description,
  maxOrganizations, maxActivations, maxUsers,
  isActive, sortOrder,
  priceMonthly,    // integer (cents) — stored but not charged
  priceAnnually,   // integer (cents) — stored but not charged
  currency, billingInterval,
  isPublic,
  features         // JSON array of feature strings for display
});
```

`priceMonthly` and `priceAnnually` exist in the schema but are **display-only** — there is no payment processing that uses these values.

---

### Critical Billing Gaps

1. **No payment processing** — operators must manually issue and renew licenses. Zero revenue automation.
2. **No self-service billing portal** — customers cannot pay, upgrade, or cancel online.
3. **No trial period** — cannot offer time-limited evaluations.
4. **No dunning** — no automatic payment retry, no escalating failure emails.
5. **No usage-based pricing** — no metering of orders, transactions, or API calls.
6. **No subscription lifecycle** — no renewal reminders beyond the expiry warning emails.
7. **Finance sync failure is silent** — expired/suspended status may not reach Finance app.

---

## PHASE 6 — MODULE ACTIVATION

### Current State — IMPLEMENTED AND VERIFIED

---

### How Modules Are Enabled

Module state is authoritative in two places that must stay in sync:

1. `tenants.modules` — JSON text array, e.g. `'["accounting","pos"]'`
2. `licenses.modules` — identical format, updated whenever `tenants.modules` changes

Both are updated atomically by `updateTenantAndLicenseModules()`:

**Source: `apps/api/src/routes/tenant-modules.ts:36–51`**

```typescript
async function updateTenantAndLicenseModules(db, tenantId, modules) {
  const serialized = serializeTenantModules(modules);
  await db.update(tenants).set({ modules: serialized }).where(eq(tenants.id, tenantId));
  const license = await getActiveLicenseForTenant(db, tenantId);
  if (license) {
    await db.update(licenses)
      .set({ modules: serialized, updatedAt: new Date() })
      .where(eq(licenses.id, license.id));
  }
}
```

---

### Module Gating

Module gating is controlled by the env var `PROVISION_MODULE_GATING`:

- Default: **enabled** (gating is on, only licensed modules are provisioned)
- `PROVISION_MODULE_GATING=0` disables gating (all modules provision regardless of license)

**Source: `infra/worker-service/src/module-stacks.ts:164`**

```typescript
export function isModuleGatingEnabled(): boolean {
  return moduleGatingConfig.enabled;
}
```

---

### Module Enforcement Layers

| Layer | Mechanism | Enforces What |
|---|---|---|
| Provisioning (worker) | `getProvisionStackPlan()` only starts stacks for licensed modules | Which Docker stacks launch |
| Finance JWT | `stockix_tenant_modules` claim in platform JWT | Finance feature access per module |
| Finance License | `syncFinanceLicenseForStockixTenant()` pushes module list | Finance internal enforcement |
| POS Platform API | `bootstrapPosOrganization()` sends `tenantModules` | POS feature gating |
| Control-plane API | `parseTenantModules()` validates before any module action | API-level module validation |

---

### Multi-Module Capability

A single tenant can have any combination of all four modules simultaneously. The schema enforces at least one module always remains (enforced at API level, not DB level).

**Source: `apps/api/src/routes/tenant-modules.ts:194–198`**

```typescript
if (remaining.length === 0) {
  return c.json({
    error: "cannot_remove_last_module",
    message: "At least one module must remain"
  }, 400);
}
```

---

## PHASE 7 — UPGRADE AUDIT

### Current State — PARTIALLY IMPLEMENTED

---

### Upgrade Flow (`POST /tenants/:id/add-module`)

**Source: `apps/api/src/routes/tenant-modules.ts:57–148`**

```
1. Validate: actorRole must be "super_admin"
2. Validate: tenantId is UUID
3. Parse body: { module: "pos" | "pms" | "chat" | "accounting" }
4. Fetch tenant row
5. Check: module not already in tenants.modules
6. Update tenants.modules (add module)
7. Sync licenses.modules (same update)
8. Update tenants.status = "provisioning"
9. Generate correlationId
10. Write provision trace event (phase="api")
11. INSERT tenant_lifecycle_jobs (type="add_module", payload: tenantId, slug, module)
12. logAudit: action="tenant.module_added"
13. Return 202 { accepted, jobId, correlationId, modules }
```

Worker processes `add_module` job:

- For `accounting`: starts Finance Docker stack, bootstraps admin, syncs license
- For `pos`: starts POS Docker stack, bootstraps POS org, wires Bigcapital integration
- For `pms`: starts PMS Docker stack
- For `chat`: provisions Chatwoot account

---

### Upgrade Matrix (All Module Combinations)

| Starting State | Module Added | Status |
|---|---|---|
| `["accounting"]` | `"pos"` | Finance already up → POS starts → Bigcapital wiring runs | VERIFIED |
| `["accounting"]` | `"pms"` | PMS stack starts — data stored in shared Postgres | PARTIALLY VERIFIED |
| `["accounting"]` | `"chat"` | Chatwoot account created | PARTIALLY VERIFIED |
| `["pos"]` | `"accounting"` | Finance starts → Bigcapital wiring runs (POS already has posOrg) | PARTIALLY VERIFIED |
| `["pos"]` | `"pms"` | PMS stack starts | PARTIALLY VERIFIED |
| `["pms"]` | `"accounting"` | Finance starts | PARTIALLY VERIFIED |
| `["pms"]` | `"pos"` | POS starts | PARTIALLY VERIFIED |
| `["accounting", "pos"]` | `"pms"` | PMS starts (Finance + POS already wired) | PARTIALLY VERIFIED |
| Any | `"chat"` | Chatwoot account created | PARTIALLY VERIFIED |

---

### Missing Upgrade Behavior

| Gap | Impact |
|---|---|
| **No upgrade notification email** | Tenant admin is not notified when a new module is added | Medium |
| **No upgrade notification to tenant in Finance UI** | Finance does not know a new module was added until next license sync | Medium |
| **No automatic re-run of Bigcapital wiring** | If `pos` was added when `accounting` already existed but wiring previously failed, the `add_module` job for `pos` re-wires. But if `accounting` is added when `pos` already exists, the wiring depends on job logic for that code path | HIGH |
| **No owner dashboard notification for module add failure** | `revertTenantAfterAddModuleFailure()` reverts status but no notification created | Medium |
| **No menus/UI automatically shown** | Finance UI changes are controlled by the `stockix_tenant_modules` JWT claim — this updates on next login | Low |

---

## PHASE 8 — DOWNGRADE AUDIT

### Current State — PARTIALLY IMPLEMENTED

---

### Downgrade Flow (`POST /tenants/:id/remove-module`)

**Source: `apps/api/src/routes/tenant-modules.ts:151–268`**

```
1. Validate: actorRole must be "super_admin"
2. Validate: tenantId is UUID
3. Parse body: { module: "pos" | "pms" | "chat" | "accounting" }
4. Check: module IS currently in tenants.modules
5. Check: at least one module will remain after removal
6. Update tenants.modules (remove module)
7. Sync licenses.modules
8. For "pos": clear tenant_deployments.posUrl and posOrganizationId
9. For "accounting": clear tenant_deployments.financeTenantId, financeDefaultWarehouseId, etc.
10. INSERT tenant_lifecycle_jobs (type="remove_module")
11. If "accounting" NOT being removed: sync Finance license (fire-and-forget)
12. logAudit: action="tenant.module_removed", dataRetained=true
13. Return { ok, modules, warning: "Module removed from license. Stack stopped; data volumes were not destroyed." }
```

Worker processes `remove_module` job:

- For `accounting`: `stopFinanceStack()` — `docker compose stop` (NOT `down --volumes`)
- For `pos`: `stopModuleStack("pos")` — `docker compose down --remove-orphans`, removes Traefik config
- For `pms`: `stopModuleStack("pms")` — `docker compose down --remove-orphans`
- For `chat`: **NO STOP LOGIC FOUND** — Chatwoot account remains active

---

### Downgrade Data Disposition Matrix

| Module Removed | Container Stopped | Data Volumes | Control-plane DB Records | Finance/POS Records | Read-Only Mode |
|---|---|---|---|---|---|
| `accounting` | YES — `docker compose stop` | RETAINED on disk | Finance IDs nulled in `tenant_deployments` | Finance MySQL DB still exists on host | **NO** — no access control |
| `pos` | YES — `docker compose down` | RETAINED on disk (MongoDB data in volume) | `posUrl` and `posOrganizationId` nulled | POS MongoDB collections remain | **NO** |
| `pms` | YES — `docker compose down` | Shared Postgres rows remain | No PMS-specific IDs to null | PMS tables retain all rows | **NO** |
| `chat` | **NO ACTION** | N/A — Chatwoot is external | `chatwootAccountId` NOT nulled | Chatwoot account remains active | **NO** |

---

### Downgrade Risks

| Risk | Severity | Details |
|---|---|---|
| Finance Docker stack stopped but MySQL data on host — if module re-added, old data resurfaces immediately without audit | **HIGH** | No archival, no confirmation required |
| PMS data rows in shared Postgres not hidden after module removal | **HIGH** | If PMS is ever re-enabled, all historical guest/booking data is instantly accessible |
| Chat module removal is a no-op in terms of actually stopping the Chatwoot account | **MEDIUM** | Tenant admin could still access Chatwoot while billed for a downgraded plan |
| No email notification to tenant admin on module removal | **MEDIUM** | Tenant loses access without warning |
| No grace period before access is removed | **MEDIUM** | Access stops immediately on stack stop, not after a notice period |
| Billing/license still active even after module removal (license.modules updated but license.status unchanged) | **MEDIUM** | License still shows "active" even with fewer modules |

---

### Best-Practice SaaS Recommendation

1. **Archival state:** Set module data to "archived" — read-only for 90 days before permanent deletion
2. **Grace period:** Give tenant 30 days notice before removing access
3. **Data export:** Allow tenant to export data before removal
4. **Email notification:** Send removal confirmation to tenant admin and platform owner
5. **Chatwoot cleanup:** Call Chatwoot platform API to deactivate account on `chat` removal

---

## PHASE 9 — FINANCE VS POS ACCOUNTING

### Current State — CRITICAL DESIGN CONCERN, DOUBLE-POSTING RISK

---

### Two Parallel Accounting Engines

**Finance Bigcapital** has a full double-entry accounting engine:

- Chart of accounts (`Accounts` module)
- Journal entries (`ManualJournals` module)
- AP/AR (`Bills`, `PaymentReceived` modules)
- Financial statements (`FinancialStatements` module)
- Bank reconciliation (`BankingAccounts`, `BankingMatching`)
- Tax rates (`TaxRates`)

**Evidence:** `services/stockix-finance/packages/server/src/modules/` — 60+ modules, all with their own GL entry services (e.g., `InvoiceGLEntries.ts`, `ExpenseGLEntries.service.ts`, `PaymentReceivedGLEntries.ts`)

---

**POS Backend** also has a full accounting engine:

**Evidence:** `services/posnew/apps/pos-backend/routes/accountingRoute.js`

```javascript
// POS has its own full Chart of Accounts, General Ledger, and Financial Statements
router.get("/accounts", ...rd, ctrl.listAccounts);
router.post("/accounts", ...wr, ctrl.createAccount);
router.get("/journal-entries", ...glRd, ctrl.listJournalEntries);
router.post("/journal-entries", ...glWr, ctrl.postManualJournal);
router.get("/trial-balance", ...glRd, ctrl.trialBalance);
router.get("/reports/pnl", ...glRd, ctrl.profitAndLoss);
router.get("/reports/cash-flow", ...glRd, ctrl.cashFlowReport);
router.get("/reports/balance-sheet", ...glRd, ctrl.balanceSheet);
router.get("/reports/consolidated/trial-balance", ...consolidatedRd, ctrl.consolidatedTrialBalanceReport);
router.get("/reports/consolidated/pnl", ...consolidatedRd, ctrl.consolidatedProfitAndLossReport);
// ... + recurring journals, AR aging, AP aging, bank reconciliation, etc.
```

**POS also has a recurring journal scheduler:**
`services/posnew/apps/pos-backend/constants/recurringJournalQueue.js` — `recurringJournalWorker.js`

---

### The Integration Bridge (Bigcapital Sync)

**Source:** `services/posnew/apps/pos-backend/workers/bigcapitalSyncWorker.js`, `services/accountingIntegrationEvents.js`

When both `accounting` and `pos` modules are present, POS sends sale/inventory events to Finance via an **outbox pattern**:

```
POS records a sale
  → accountingIntegrationOutbox creates outbox entry { eventType, payload }
  → bigcapitalSyncWorker polls outbox
  → Pushes SaleReceipt to Finance Bigcapital API
  → Finance creates SaleReceipt (which generates GL entries internally)
```

---

### Double-Posting Risk Analysis

| Scenario | POS GL Written | Finance GL Written | Double-Posted? |
|---|---|---|---|
| POS sale, no Finance module | YES — POS accounting records the sale | NO | No risk |
| POS sale, Finance module present, sync enabled | YES — POS records in POS GL | YES — Finance receives SaleReceipt via sync, records in Finance GL | **POTENTIAL DOUBLE-POSTING** |
| POS sale, Finance sync disabled | YES — POS GL | NO — sync not firing | No risk (but Finance data stale) |
| Manual journal in POS when Finance present | YES — POS journal | NO — not synced | Divergence risk |
| Manual journal in Finance when POS present | NO — POS doesn't sync Finance → POS | YES — Finance GL | No double-post but data inconsistency |

**No evidence found** that POS accounting is disabled or gated when the `accounting` module is active. The `pos-accounting-api.ts` frontend client remains fully active regardless of which modules are licensed.

---

### Actual Implementation Evidence

**From `bigcapitalSyncWorker.js`:**

```javascript
// POS has its own Bigcapital sync worker that runs independently
// This pushes POS sales to Finance — but POS GL still records those sales
```

**From `wirePosBigcapitalIntegration()`:**

```typescript
// Integration wiring connects POS to Finance for SYNC
// But does NOT disable POS's own accounting engine
```

---

### Recommended Architecture

| Condition | POS Accounting Behavior |
|---|---|
| `accounting` module NOT present | POS accounting is the source of truth (full GL active) |
| `accounting` module IS present | POS GL becomes a **relay-only** mode — no independent journal entries, all revenue flows through Finance. POS accounting menu shows read-only Finance-synced data. |

Implementation steps:

1. Add a feature flag `pos.accounting.relay_mode` that the platform sets to `true` when `accounting` module is active
2. POS backend checks this flag before writing any GL entries
3. POS accounting routes return Finance-proxied data when relay mode is active
4. POS frontend shows Finance-sourced reports, not POS-sourced reports

---

## PHASE 10 — PMS + FINANCE INTEGRATION

### Current State — PARTIALLY IMPLEMENTED (Schema exists, sync logic unverified)

---

### What Exists in Schema

**`pms_bookings` table (`schema.ts:799–804`):**

```typescript
accountingSyncStatus: text("accounting_sync_status").notNull().default("pending"),
financeReceiptId: integer("finance_receipt_id"),
```

**`pms_payments` table (`schema.ts:831–834`):**

```typescript
financePaymentId: integer("finance_payment_id"),
```

---

### Integration Intent (Derived from Schema)

The design intent is:

1. When a PMS booking is checked out, a Finance `SaleReceipt` is created
2. The `financeReceiptId` is stored on the booking
3. When a payment is recorded in PMS, a Finance `SalePayment` is created
4. The `financePaymentId` is stored on the payment

---

### What Is MISSING or UNKNOWN

| Integration Point | Status |
|---|---|
| Sync worker that reads `accountingSyncStatus="pending"` and pushes to Finance | **NOT FOUND** — no background job found that processes PMS→Finance sync |
| Night audit entries | **NOT IMPLEMENTED** |
| Tax posting from PMS to Finance | **NOT IMPLEMENTED** |
| Refund posting | **NOT IMPLEMENTED** |
| Deposit posting | **NOT IMPLEMENTED** |
| Revenue recognition by room type | **NOT IMPLEMENTED** |
| Finance SaleReceipt line items matching PMS room rates | **NOT IMPLEMENTED** |
| Error handling when Finance is down | **UNKNOWN** — schema tracks status but retry logic not found |

---

### Risk

PMS bookings will accumulate with `accountingSyncStatus = "pending"` indefinitely if no sync worker is running. There is no visible alert or monitoring for this backlog. Finance revenue figures will not reflect PMS activity.

---

## PHASE 11 — ORGANIZATION STRUCTURE AUDIT

### Current State — VERIFIED

---

### Actual Hierarchy

```
Platform Level:
  Owner (Stockix platform operator)
  └── Manages one or more Tenants

Tenant Level:
  Tenant (customer company)
    └── Organization (sub-unit of tenant)
          ├── Finance: Bigcapital Organization → Branch → Department
          └── POS: POS Organization → Location
```

---

### Organization Table Structure

**Source: `packages/db/src/schema.ts:110–138`**

```typescript
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),       // FK to tenants
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  subdomain: varchar("subdomain", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull().default("provisioning"),
  // provisioning | active | suspended | failed
  isPrimary: boolean("is_primary").notNull().default(false),
  financeOrganizationId: varchar("finance_organization_id", { length: 255 }),
  posOrganizationId: text("pos_organization_id"),
  provisioningError: text("provisioning_error"),
  createdAt, updatedAt
});
```

Each `organization` maps 1:1 to:

- A Finance (Bigcapital) organization via `financeOrganizationId`
- A POS organization via `posOrganizationId`
- Its own Docker Compose stack (a separate tenant stack with its own port)
- A Traefik subdomain (`{slug}.{rootDomain}`)

---

### Organization Limits

Organization creation is gated by:

1. Active license (`getTenantLicenseEligibility()`)
2. Plan limit (`getMaxOrganizations()` from license row, defaulting to plan `maxOrganizations`)
3. `canCreateOrganization()` compares existing org count against limit

**Source: `apps/api/src/plan-limits.ts`**

---

### Organization Provisioning

When a new organization is created for an existing tenant:

```
POST /tenants/:tenantId/organizations
  1. License eligibility check
  2. Plan limit check
  3. Pick unique slug (up to 16 attempts)
  4. INSERT organizations (status="provisioning")
  5. enqueueOrgProvisioning() → INSERT tenant_lifecycle_jobs (type="organization.provision")
  6. Worker runs: starts a new Finance org stack for this organization
     (reuses parent tenant's MySQL, creates new Finance org)
```

---

### Hierarchy Enforcement

- `isPrimary=true` is set for the first organization of each tenant
- Additional organizations require license and plan eligibility
- Support agents with `tenants.org_scope` permission are scoped to specific organizations only (`ownerOrganizationAccess` table)

---

### Orphaned Records Risk

When a tenant is deleted:

1. `organizations` rows are deleted (CASCADE from `tenants`)
2. Finance org data in MySQL is deleted by the deprovision worker (async — can fail)
3. POS org data in MongoDB is deleted by the deprovision worker (async — can fail)
4. If deprovision worker fails, orphaned Finance MySQL databases and POS MongoDB collections persist on the Docker host

---

## PHASE 12 — BRANCH VS LOCATION MAPPING

### Current State — NOT MANAGED IN CONTROL PLANE

---

### Current State of Each System

**Finance (Bigcapital) — Branches:**

- Finance has a full `Branches` module (`services/stockix-finance/packages/server/src/modules/Branches/`)
- Branches are sub-units of a Bigcapital Organization
- Finance creates a default branch during provisioning
- All Finance accounting records (invoices, payments, journal entries) can be scoped to a branch

**POS — Locations:**

- POS has locations stored in MongoDB
- Locations are sub-units of a POS Organization
- POS orders, inventory, and sessions are scoped to a location

**STXI License — Location Scoping:**

- The `licenses.scopedLocationId` field (migration `0046_stxi_license.sql`) stores a POS MongoDB location ObjectId
- This enables per-location licensing (one license key per POS terminal/location)
- The mapping is: `license.scopedLocationId` → POS Location ObjectId

---

### The Gap

The control plane has **no table** linking Finance branches to POS locations. The mapping is:

```
Control-plane Organization (1:1)→ Finance Organization (1:N)→ Finance Branches
Control-plane Organization (1:1)→ POS Organization (1:N)→ POS Locations
Finance Branch ↔ POS Location: UNMAPPED in control plane
```

This means:

- Multi-location reporting that spans Finance + POS cannot be done at the control-plane level
- If a Finance branch closes, POS locations must be manually updated
- There is no way to validate that Finance branch count matches POS location count

---

### Possible Mappings (Recommended Architecture)

| Option | Description | Recommended |
|---|---|---|
| 1 Branch = 1 Location | Standard case — each physical location has one Finance branch and one POS location | **YES — default** |
| 1 Branch = N Locations | One accounting branch serves multiple POS terminals | Supported by having location licenses reference same branch |
| N Branches = 1 Location | Multiple accounting cost centers map to one physical location | Complex — requires bridge table |
| Custom | Arbitrary mapping | Requires explicit mapping table in control plane |

**Recommended:** Add `branch_location_mappings` table:

```sql
CREATE TABLE branch_location_mappings (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  finance_branch_id INTEGER NOT NULL,   -- Bigcapital branch ID
  pos_location_id TEXT NOT NULL,        -- POS MongoDB ObjectId
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

---

## PHASE 13 — CHAT PLATFORM AUDIT

### Current State — MINIMALLY PROVISIONED

---

### What Is Provisioned

**Source: `infra/worker-service/src/chatwoot-provision.ts`**

Only a Chatwoot **Account** is created:

```typescript
export async function provisionChatwootAccount(opts) {
  // Attempt 1: Platform API
  const accountRes = await fetch(`${base}/platform/api/v1/accounts`, {
    method: "POST",
    headers: { api_access_token: chatwootApiKey },
    body: JSON.stringify({ name: tenantName }),
  });

  // Attempt 2: Sign-up fallback if platform API fails
  if (!accountRes.ok) {
    const signUpRes = await fetch(`${base}/auth/sign_up`, {
      body: JSON.stringify({
        account_name: tenantName,
        email: adminEmail,
        password: generateSecurePassword(),
        confirm_password: password,
      }),
    });
  }

  // Stores: accountId → tenants.chatwootAccountId
}
```

---

### What Is NOT Provisioned

| Chat Entity | Status | Notes |
|---|---|---|
| Inbox creation | **NOT IMPLEMENTED** | Operator must create inboxes manually inside Chatwoot UI |
| Email channel | **NOT IMPLEMENTED** | Must be configured manually |
| WhatsApp channel | **NOT IMPLEMENTED** | Must be configured manually |
| Website widget | **NOT IMPLEMENTED** | Must be configured manually |
| Agent accounts | **NOT IMPLEMENTED** | Must be created manually inside Chatwoot |
| Department setup | **NOT IMPLEMENTED** | Must be created manually |
| AI Agent / bot | **NOT IMPLEMENTED** | |
| CSAT settings | **NOT IMPLEMENTED** | |
| Business hours | **NOT IMPLEMENTED** | |

---

### Isolation

Each tenant has their own Chatwoot account (via `chatwootAccountId`). Chatwoot's built-in account isolation is entirely relied upon. No cross-account access control is implemented in the Stockix control plane.

---

### Removal Gap

When the `chat` module is removed, `remove-module` handler does NOT:

- Deactivate the Chatwoot account
- Delete the Chatwoot account
- Null out `tenants.chatwootAccountId`

**Risk:** Tenant admin retains Chatwoot access even after the module is "removed" from their license.

---

## PHASE 14 — EMAIL AUDIT

### Current State — IMPLEMENTED AND VERIFIED

---

### Email Delivery Infrastructure

**Source: `apps/api/src/mail/mailer.ts`, `apps/api/src/mail/resend-api.ts`**

**Mode 1 — SMTP (primary):**

```
MAIL_HOST=smtp.resend.com
MAIL_PORT=587
MAIL_USERNAME=resend
MAIL_PASSWORD=[resend-api-key]
MAIL_FROM_ADDRESS=noreply@yourdomain.com
MAIL_FROM_NAME=Stockix
```

**Mode 2 — Resend SDK (fallback):**

```
RESEND_API_KEY=re_xxx
MAIL_FROM_ADDRESS=noreply@yourdomain.com
```

**Email logging:** Every send attempt is recorded in `email_logs` table:

```typescript
{ templateKey, recipientHash, status, providerMessageId, deliveryStatus, 
  error, tenantId, ownerId, idempotencyKey, createdAt }
```

**Idempotency:** Every `sendMail()` call requires an `idempotencyKey`. The mailer stores a hash and skips duplicate sends within the same window.

---

### Complete Email Template Catalog

**Source: `apps/api/src/mail/send.ts` + `apps/api/src/mail/templates/`**

#### Authentication Emails

| Template | File | Trigger | Recipient | Subject |
|---|---|---|---|---|
| `owner-invite` | `owner-invite.ts` | `POST /owners/:id/invite` | New platform operator | "You're invited to Stockix" |
| `password-reset` | `password-reset.ts` | `POST /auth/password/request-reset` | Owner requesting reset | "Reset your Stockix password" |
| `password-changed` | `password-changed.ts` | Successful password change | Owner whose password changed | "Your Stockix password was changed" |

#### Provisioning Emails

| Template | File | Trigger | Recipient | Subject |
|---|---|---|---|---|
| `tenant-welcome` | `tenant-welcome.ts` | Provision complete | Tenant admin email | "Welcome to Stockix — {tenantName}" |
| `finance-welcome` | `finance-welcome.ts` | Finance stack up + OTP available | Tenant admin email | "Your {brandName} account is ready" |
| `pos-welcome` | `pos-welcome.ts` | POS stack up | Tenant admin email | "Your {brandName} POS staff credentials" |
| `provision-complete-owner` | `provision-complete-owner.ts` | Provision complete | Platform owner who provisioned | "Tenant provisioned: {tenantName}" |
| `org-admin-access` | `org-admin-access.ts` | Sub-organization provisioned | Tenant admin email | "New organization ready — {orgName}" |

#### License/Billing Emails

| Template | File | Trigger | Recipient | Subject |
|---|---|---|---|---|
| `license-activated` | `license-activated.ts` | License activated or renewed | Tenant admin email | "Your {brandName} license is active" |
| `license-expiring` | `license-expiring.ts` | 90/60/30/15/7/3/2/1 days before expiry | Tenant admin + platform owner | "Your Stockix license expires soon" |
| `license-expired` | `license-expired.ts` | License passed expiry date | Tenant admin email | "Your Stockix license has expired" |

---

### Missing Emails — NOT IMPLEMENTED

#### Authentication

| Email | Priority |
|---|---|
| MFA enabled notification | HIGH |
| MFA disabled notification | HIGH |
| New device / suspicious login | HIGH |
| Account locked notification | MEDIUM |
| Account unlocked notification | LOW |

#### Billing

| Email | Priority |
|---|---|
| Trial started | HIGH (no trial system exists) |
| Trial ending soon | HIGH |
| Payment received | HIGH (no payment system) |
| Payment failed | HIGH |
| Subscription cancelled | HIGH |
| Plan upgrade confirmation | HIGH |
| Plan downgrade confirmation | HIGH |

#### Provisioning / Module Lifecycle

| Email | Priority |
|---|---|
| Module added notification to tenant admin | HIGH |
| Module removed notification to tenant admin | HIGH |
| Organization suspended | MEDIUM |
| Provisioning failure notification to platform owner | MEDIUM |
| Deprovision complete notification | LOW |

#### Operational

| Email | Priority |
|---|---|
| Backup success/failure | MEDIUM |
| Worker job failure (critical jobs) | MEDIUM |
| Health check failure | LOW |
| Security alert (new admin access) | HIGH |

---

### Email Retry Logic

**Current:** None. If `sendMail()` fails (e.g., SMTP timeout), the error is logged with `console.error` and the `email_logs` record shows `status="failed"`. No automatic retry is scheduled.

**Recommendation:** Implement a retry queue. Emit failed emails to a `tenant_lifecycle_jobs` retry job with exponential backoff.

---

## PHASE 15 — FEATURE FLAG AUDIT

### Current State — INFRASTRUCTURE EXISTS, NO FLAGS DEPLOYED

---

### Schema

**Source: `packages/db/src/schema.ts:1196–1210`**

```typescript
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  enabledGlobally: boolean("enabled_globally").notNull().default(false),
  tenantOverrides: jsonb("tenant_overrides").notNull().default({}),
  // { "tenant-uuid": true, "tenant-uuid2": false }
  description: text("description"),
  createdAt, updatedAt
}, (t) => [uniqueIndex("feature_flags_key_unique").on(t.key)]);
```

---

### Evaluation Logic

**Source: `packages/shared/src/feature-flags.ts`**

```typescript
export async function isFlagEnabled(redis, db, key, tenantId): Promise<boolean> {
  // 1. Check Redis cache (60s TTL)
  const cacheKey = `ff:${key}:${tenantId}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === "1";

  // 2. Fetch from database
  const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
  if (!flag) return false;

  // 3. Tenant override takes precedence over global
  const overrides = flag.tenantOverrides as Record<string, boolean>;
  const result = overrides[tenantId] !== undefined
    ? overrides[tenantId]
    : flag.enabledGlobally;

  // 4. Cache for 60 seconds
  await redis.set(cacheKey, result ? "1" : "0", "EX", 60);
  return result;
}
```

---

### Scope Levels

| Level | Supported | How |
|---|---|---|
| Global | YES | `enabledGlobally` boolean |
| Tenant | YES | `tenantOverrides[tenantId]` boolean in JSONB |
| Organization | **NO** | Not in schema |
| Branch | **NO** | Not in schema |
| User | **NO** | Not in schema |
| Session | **NO** | Not in schema |

---

### Flags in Use

**Zero feature flags are seeded or used in code.** The infrastructure is complete but entirely empty. No calls to `isFlagEnabled()` were found in the control-plane API source during this audit. Flags may be managed entirely via direct database operations by operators.

---

### Cache Invalidation

**Source: `packages/shared/src/feature-flags.ts:59–79`**

```typescript
export async function invalidateFlagCache(redis, key, tenantId?): Promise<void> {
  if (tenantId) {
    await redis.del(`ff:${key}:${tenantId}`);
  } else {
    const keys = await redis.keys(`ff:${key}:*`);
    if (keys.length > 0) await redis.del(...keys);
  }
}
```

**Risk:** `redis.keys()` is an O(N) operation across all Redis keys. On large deployments with many tenants, invalidating a global flag could cause a Redis performance spike.

---

## PHASE 16 — ROLE & PERMISSION AUDIT

### Current State — CONTROL PLANE IMPLEMENTED, CROSS-MODULE UNLINKED

---

### Control-Plane Roles (Platform Operators)

**Source: `packages/shared/src/roles.ts`**

```typescript
export const ROLES = ["super_admin", "support_agent", "billing_manager", "read_only"] as const;

export const ROLE_RANK: Record<Role, number> = {
  read_only: 0,
  billing_manager: 1,
  support_agent: 2,
  super_admin: 3,
};
```

---

### Permission System

**Source: `packages/shared/src/permissions.ts`**

```typescript
export const PERMISSIONS = [
  "tenants.read",        // List and view tenants
  "tenants.write",       // Edit tenant settings
  "tenants.provision",   // Create and delete tenants
  "tenants.org_scope",   // Scope to specific organizations
  "licenses.read",       // View licenses
  "licenses.write",      // Create/modify licenses
  "licenses.extend",     // Extend license expiry only
  "licenses.suspend",    // Suspend a license
  "owners.manage",       // Create, invite, modify other owners
  "plans.read",          // View plans
  "plans.manage",        // Create/modify plans
  "settings.access",     // Access platform settings
  "audit.read",          // Read audit logs
  "email_logs.read",     // Read email logs
  "api_keys.manage",     // Manage API keys
  "roles.manage",        // Manage custom roles
  "*",                   // All permissions (super_admin only)
] as const;
```

---

### Built-in Role Permission Matrix

| Permission | `read_only` | `billing_manager` | `support_agent` | `super_admin` |
|---|---|---|---|---|
| tenants.read | ✓ | ✓ | ✓ | ✓ |
| tenants.write | ✗ | ✗ | ✓ | ✓ |
| tenants.provision | ✗ | ✗ | ✓ | ✓ |
| tenants.org_scope | ✗ | ✗ | ✓ | ✓ |
| licenses.read | ✓ | ✓ | ✓ | ✓ |
| licenses.write | ✗ | ✗ | ✓ | ✓ |
| licenses.extend | ✗ | ✓ | ✓ | ✓ |
| licenses.suspend | ✗ | ✗ | ✗ | ✓ |
| owners.manage | ✗ | ✗ | ✗ | ✓ |
| plans.read | ✓ | ✓ | ✓ | ✓ |
| plans.manage | ✗ | ✗ | ✗ | ✓ |
| settings.access | ✗ | ✗ | ✗ | ✓ |
| audit.read | ✗ | ✗ | ✗ | ✓ |
| email_logs.read | ✗ | ✗ | ✗ | ✓ |
| api_keys.manage | ✗ | ✗ | ✗ | ✓ |
| roles.manage | ✗ | ✗ | ✗ | ✓ |

---

### Custom Roles

**Source: migration `0044_platform_roles.sql`**

Operators can create custom roles via the `platform_roles` table with arbitrary permission subsets. Custom roles are looked up at runtime by `loadOwnerAuthById()`.

**Risk:** A custom role can be created with `permissions: ["*"]` which grants full super_admin access with no console warning or protection. There is no validation preventing a custom role from having more permissions than the creating role.

---

### RBAC Middleware

**Two middleware layers exist (source: `apps/api/src/middleware/rbac.ts`):**

1. **`createRbacMiddleware(db)`** — Permission-string based. Looks up required permissions from `requiredPermissionsForRoute(path, method)` and verifies actor has all of them. This is the **production middleware**.

2. **`createRoleRankRbacMiddleware(db)`** — Legacy role-rank based. Compares actor's ROLE_RANK against minimum required role. Kept for backward compatibility.

**Session caching:** Auth middleware caches session validations for 15 seconds in Redis (falls back to in-process Map). This means role changes take up to 15 seconds to propagate.

---

### Organization-Scoped Access

**Source: `apps/api/src/org-access-scope.ts`, `packages/db/src/schema.ts:141–161`**

Support agents can be scoped to specific organizations via `ownerOrganizationAccess` table. When scoped, they can only see/manage tenants containing those organizations.

```typescript
export const ownerOrganizationAccess = pgTable("owner_organization_access", {
  id, ownerId, tenantId, organizationId, createdAt
});
```

---

### Finance Internal Roles (Inside Bigcapital)

Finance has its own role/permission system seeded inside MySQL during tenant provisioning:

**Source: `services/stockix-finance/packages/server/src/database/tenant/seeds/core/20210812121909_seed_roles_permissions.ts`**

Typical Finance roles: Admin, Accountant, Cashier, Viewer (seeded by Bigcapital). These are completely separate from control-plane roles and have no programmatic link.

---

### POS Internal RBAC

**Source: `services/posnew/apps/pos-backend/constants/defaultRbacRoles.js`, `permissionsCatalog.js`**

POS has its own RBAC system with MongoDB-stored roles and permissions. POS roles are created during POS org bootstrap and are completely separate from control-plane and Finance roles.

---

### Cross-Module Identity (Missing)

There is no SSO or identity bridge between:

- Control-plane owner accounts
- Finance (Bigcapital) user accounts
- POS user accounts

A "super_admin" in the control plane has no automatic access to Finance or POS. Each system requires separate login credentials. There is no federated identity management.

---

### Privilege Escalation Risks

| Risk | Severity | Notes |
|---|---|---|
| Custom role can be granted `*` permission equaling super_admin | **HIGH** | No validation prevents this |
| Session cache delay (15s) means role revocation is not immediate | **MEDIUM** | Attacker with revoked session can act for 15s |
| `tenants.org_scope` permission limits scope but does NOT prevent support agent from creating new orgs | **MEDIUM** | Blocked at API level but could be bypassed |
| API keys inherit owner permissions — a leaked API key has full owner access | **MEDIUM** | No per-key permission scoping |
| Finance admin password stored encrypted in `tenant_deployments` — compromise of deployment secret key exposes all passwords | **HIGH** | Single key protects all tenant Finance admin passwords |

---

## PHASE 17 — FAILURE RECOVERY AUDIT

### Current State — PARTIALLY IMPLEMENTED

---

### Partial Provision Tracking

**Source: `infra/worker-service/domain/provisioning/partial-provision.ts`**

When provisioning partially succeeds:

```typescript
export async function markTenantPartial(
  db, tenantId,
  kind: "pos_failed" | "wire_failed"
): Promise<void> {
  await db.update(tenants).set({ status: "partial" }).where(eq(tenants.id, tenantId));
  await db.update(tenantDeployments)
    .set({ status: "partial", partialFailureKind: kind, updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, tenantId));
}
```

`partialFailureKind` values:

- `"pos_failed"` — Finance up, POS failed
- `"wire_failed"` — Both stacks up, but Bigcapital integration wiring failed

---

### Provision Failure Handler

**Source: `apps/api/src/provisioning/provision-failure.ts`**

| Job Type | Failure Action |
|---|---|
| `tenant.provision` | `markTenantProvisionFailed()` → sets status "failed" on both tenant + deployment |
| `add_module` | `revertTenantAfterAddModuleFailure()` → reverts tenant back to "active", preserves deployment |
| `organization.provision` | `markOrganizationProvisionFailed()` → sets org status "failed", stores error |
| `tenant.deprovision` | Same as tenant.provision failure → status "failed" |

---

### Reconcilers

**Readiness Reconciler (`apps/api/src/provisioning/readiness-reconciler.ts`):**

- Polls for tenants stuck in "provisioning" state
- Checks provision events for completion signals
- If completed but status not updated: reconciles status

**Stuck Reconciler (`apps/api/src/provisioning/stuck-reconciler.ts`):**

- Detects `tenant_lifecycle_jobs` with status="running" but `startedAt` older than `maxDuration`
- Marks stale jobs as "dead"
- Triggers failure handler

---

### Dead Letter Queue

Failed jobs that exceed `maxAttempts` are moved to `dead_letter_jobs`:

**Source: `packages/db/src/schema.ts:395–413`**

```typescript
export const deadLetterJobs = pgTable("dead_letter_jobs", {
  id, jobId, type, tenantId, correlationId, payload,
  attempts, maxAttempts, lastError, failedAt, createdAt
});
```

Dead-letter jobs are for operator review. There is no automatic retry from the dead-letter queue — operator must manually re-trigger.

---

### Advisory Lock

**Source: `infra/worker-service/domain/provisioning/provision-lock.ts`**

Before any lifecycle job runs, the worker acquires a Postgres advisory lock on the tenant:

```
assertNoConcurrentTenantLifecycleJob()
withTenantLifecycleAdvisoryLock()
```

This prevents two workers from provisioning the same tenant simultaneously.

---

### Recovery Gaps

| Gap | Severity | Details |
|---|---|---|
| Orphaned Finance MySQL tenant when worker crashes after Finance DB creation but before `INSERT tenants` in control plane | **CRITICAL** | No compensation mechanism — MySQL data persists forever with no owner |
| Orphaned Chatwoot account when provisioning fails after Chatwoot creation | **HIGH** | No delete call in failure path |
| Docker volumes not removed on provision failure | **MEDIUM** | Volumes are only removed if `removeVolumes=true` is passed to deprovision |
| Dead-letter jobs have no automated alerting | **MEDIUM** | Operator must check manually |
| Partial provision requires manual operator intervention | **MEDIUM** | Dashboard shows "partial" status but no wizard to complete it |
| Chatwoot account not deleted on tenant deprovision | **MEDIUM** | No Chatwoot cleanup in deprovision job |

---

## PHASE 18 — EVENTS & AUTOMATION AUDIT

### Current State — VERIFIED

---

### Job Queue Architecture

**Engine:** Custom Postgres-backed job queue using `tenant_lifecycle_jobs` table.

**Source: `apps/api/src/services/tenant-jobs.ts`**

```typescript
export async function insertTenantJob(db, opts: {
  type: string;
  tenantId?: string;
  correlationId?: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
}): Promise<TenantLifecycleJob>
```

Jobs are polled by the worker process. Claim tokens prevent two workers from processing the same job.

---

### Complete Job Type Catalog

| Job Type | Trigger | Worker Action |
|---|---|---|
| `tenant.provision` | `POST /tenants` | Full provision sequence (steps 9–52 above) |
| `tenant.deprovision` | `DELETE /tenants/:id` | Stop all stacks, remove compose projects, optionally remove volumes, update status |
| `organization.provision` | `POST /tenants/:id/organizations` | Provision new org stack in existing tenant infrastructure |
| `add_module` | `POST /tenants/:id/add-module` | Start appropriate module stack |
| `remove_module` | `POST /tenants/:id/remove-module` | Stop appropriate module stack |

---

### Cron Jobs

**Source: `infra/worker-service/src/cron/`**

| Cron | Frequency | Action |
|---|---|---|
| License expiry check | Periodic | Sends expiry warning emails at milestone days; suspends tenants after grace period |
| iCal sync | Periodic | Imports OTA calendar feeds for PMS properties (Airbnb, Booking.com, etc.) |

---

### Provision Event Bus

**Source: `apps/api/src/provision-bus.ts`**

Redis pub/sub is used to broadcast provision trace events in real-time to SSE stream subscribers:

```
Worker emits event → Redis pub/sub channel → SSE handler → Browser stream
```

This allows the dashboard to show live provisioning progress without polling.

---

### POS Background Workers

The POS stack runs its own workers inside the `pos-platform-worker` and `pos-bigcapital-worker` Docker containers:

| Worker | Container | Action |
|---|---|---|
| `bigcapitalSyncWorker.js` | `pos-bigcapital-worker` | Polls POS outbox, pushes sale/inventory events to Finance |
| `recurringJournalWorker.js` | `pos-backend` | Generates recurring journal entries on schedule |
| Platform worker | `pos-platform-worker` | Syncs platform-level configurations and license status |

---

### Webhooks

**Source: `apps/api/src/routes/webhooks.ts`**

Webhook routes exist but their complete implementation was not fully audited. **Status: IMPLEMENTED BUT NOT VERIFIED.**

---

### Event Bus Gaps

| Missing Event | Impact |
|---|---|
| License state change events | Finance sync is fire-and-forget; no event bus for consumers |
| Module add/remove events | No fan-out to Finance/POS to adjust configuration |
| Tenant status change events | No external webhook for status transitions |
| User activity events | No event bus across Finance/POS/PMS |

---

## PHASE 19 — DATA OWNERSHIP AUDIT

### Current State

---

### Entity Ownership Matrix

| Entity | Owner | Tables / Collection | Consumers |
|---|---|---|---|
| Tenant metadata | Control Plane | `tenants`, `tenant_deployments`, `tenant_config` (Postgres) | Dashboard, API, all workers |
| License data | Control Plane | `licenses`, `license_history`, `license_activations` (Postgres) | Finance sync, API, POS sync |
| Organization structure | Control Plane | `organizations`, `ownerOrganizationAccess` (Postgres) | Dashboard, worker, Finance |
| Platform operators | Control Plane | `owners`, `platform_roles`, `api_keys` (Postgres) | Auth middleware, dashboard |
| Audit trail | Control Plane | `admin_audit_log`, `pms_audit_log` (Postgres) | Dashboard, compliance |
| Provision trace | Control Plane | `tenant_provision_events`, `tenant_lifecycle_jobs` (Postgres) | Dashboard, provision stream |
| Feature flags | Control Plane | `feature_flags` (Postgres) | Finance app (via JWT), POS (via platform API) |
| PMS Properties/Rooms/Guests | Control Plane shared | `pms_*` tables (Postgres) | PMS app routes |
| PMS Bookings/Payments | Control Plane shared | `pms_bookings`, `pms_payments` (Postgres) | PMS app + Finance sync (planned) |
| Finance Invoices/Journal Entries | Finance stack | MySQL per-tenant | Finance app only |
| Finance Customers/Vendors | Finance stack | MySQL per-tenant | Finance app + POS sync (customers via walk-in) |
| Finance Chart of Accounts | Finance stack | MySQL per-tenant | Finance app + POS (for integration wiring) |
| POS Orders/Sessions | POS stack | MongoDB `{slug}_pos` | POS app |
| POS Inventory/Products | POS stack | MongoDB `{slug}_pos` | POS app + Finance sync |
| POS Staff/Users | POS stack | MongoDB `{slug}_pos` | POS app |
| POS Accounting GL | POS stack | MongoDB `{slug}_pos` | POS app + (via sync) Finance |
| Chat Conversations | Chatwoot external | Chatwoot DB | Chatwoot app only |
| Email delivery | Control Plane | `email_logs` (Postgres) | Dashboard, compliance |

---

### Data Duplication Risks

| Duplicated Data | Risk | Details |
|---|---|---|
| POS sale records exist in both POS MongoDB and Finance MySQL (via sync) | **HIGH** | If sync fails, divergent records. No reconciliation mechanism. |
| PMS booking `accountingSyncStatus` tracks sync state but no worker processes it | **HIGH** | Finance may be missing all PMS revenue |
| Customer records in both POS (MongoDB) and Finance (MySQL) | **MEDIUM** | Walk-in customer is a single shared Finance customer for all POS sales. No customer-level reconciliation. |
| Tenant modules stored in both `tenants.modules` and `licenses.modules` | **MEDIUM** | Must be kept in sync by `updateTenantAndLicenseModules()` — if this call fails, they diverge |
| `posOrganizationId` stored in both `organizations` and `tenant_deployments` | **LOW** | Redundant storage, could diverge if one is updated without the other |

---

## PHASE 20 — LOGGING & OBSERVABILITY

### Current State — PARTIALLY IMPLEMENTED

---

### What Exists

#### Postgres-Based Logs (Control Plane)

| Table | What It Captures | Retention |
|---|---|---|
| `admin_audit_log` | All admin actions: tenant create/delete, license changes, owner changes. Stores: actorId, action, targetTenantId, ipAddress, userAgent, metadata, diff. | Permanent (FK protected — tenant delete does NOT cascade) |
| `pms_audit_log` | PMS-specific admin actions | Permanent |
| `tenant_provision_events` | Every step of provisioning with phase, level, message, meta | Cascaded on tenant delete |
| `tenant_deletion_logs` | Persists after tenant is deleted (no FK) | Permanent |
| `tenant_lifecycle_jobs` | Job history with attempts, errors, timing | Set null on tenant delete |
| `dead_letter_jobs` | Failed jobs beyond maxAttempts | Set null on tenant delete |
| `email_logs` | All email send attempts with status, providerMessageId | Set null on tenant/owner delete |
| `pms_sync_logs` | iCal sync attempts per property | Cascaded on property delete |
| `license_history` | License state changes with previousValues/newValues | Cascaded on license delete |

#### Application Metrics

**Source: `infra/worker-service/src/worker-prometheus.ts`**

Worker exposes Prometheus metrics:

- Job processing counters (success/failure by type)
- Job duration histograms
- Queue depth gauges

**Source: `apps/api/src/lib/metrics.ts`**

Control-plane API emits metrics via `emitMetric()` and `emitInternalJobAudit()`.

---

### What Is MISSING

| Observability Gap | Impact |
|---|---|
| **No centralized error tracking** (no Sentry, Datadog, Rollbar) | Runtime errors in API, worker, Finance, POS are all silent unless in logs |
| **No Finance app logs accessible to control plane** | Cannot debug Finance errors from dashboard |
| **No POS app logs accessible to control plane** | Cannot debug POS errors from dashboard |
| **No cross-service log correlation** | A request spanning API → Worker → Finance has no unified trace ID |
| **No alerting rules** | No automatic alerts on job failures, provision failures, license expirations |
| **No billing/payment event log** | No payment audit trail (because no payment system) |
| **No health dashboard** | No Grafana or similar dashboard configured |
| **No capacity monitoring** | No alerts on disk usage, port exhaustion, MySQL connection pool |
| **No PMS-Finance sync backlog monitoring** | `accountingSyncStatus="pending"` rows accumulate silently |

---

## PHASE 21 — SECURITY REVIEW

### Current State — MIXED

---

### Implemented Security Controls

#### Authentication

| Control | Implementation | Evidence |
|---|---|---|
| Session tokens (JWT-signed) | `apps/api/src/services/auth/tokens.ts` | JWT signed with `AUTH_TOKEN_SECRET` |
| Session versioning | `owners.sessionVersion` integer | Incrementing on password change invalidates all sessions |
| Account lockout | `owners.lockedUntil`, `owners.failedLoginCount` | Lockout after N failed logins |
| MFA (TOTP) | `owners.mfaSecret`, `owners.mfaEnabled` | Schema exists; implementation in auth service |
| Password reset | `owners.passwordResetTokenHash`, `owners.passwordResetExpiresAt` | Time-limited hashed reset tokens |
| API key authentication | `api_keys` table — SHA-256 hashed, prefix-based lookup | `apps/api/src/services/api-keys.ts` |

#### Secrets Management

| Control | Implementation | Evidence |
|---|---|---|
| Tenant secrets encrypted at rest | `enc:v1:{base64}` format | `packages/shared/src/deployment-secrets.ts` |
| HMAC-based bootstrap password derivation | SHA-256 HMAC of slug + secretKey | `tenants-shared.ts:147–155` |
| One-time admin password never stored | 15-min in-memory Map only | `tenants-shared.ts:1533` |
| API secrets in environment variables | Not hardcoded | `.env.example` shows all secrets via env |

#### Request Security

| Control | Implementation | Evidence |
|---|---|---|
| Rate limiting | Global rate limit + license-specific limit | `middleware/global-rate-limit.ts`, `middleware/license-rate-limit.ts` |
| Idempotency keys | 24h TTL, actor-scoped, request hash validation | `middleware/idempotency.ts` |
| Security headers | `middleware/security-headers.ts` | (content not fully audited) |
| CORS | Applied before most route registration | `app/create-control-plane-app.ts` |
| Input validation | Zod schemas on all mutating endpoints | Verified throughout route files |
| IP logging | `x-forwarded-for` in all audit log entries | `tenants-shared.ts:944` |

---

### Security Risks

| Risk | Severity | Evidence | Recommendation |
|---|---|---|---|
| **One-time Finance admin password is lost on API restart** — 15-min in-memory cache only, not persisted | **CRITICAL** | `tenants-shared.ts:1533–1536` — "In-memory job expired — one-time password was only in the earlier status response" | Store encrypted in `tenant_provision_events` with a `secret_consumed` flag (like the current cipher approach) and always attempt DB fallback |
| **Finance admin password stored in `tenant_deployments.financeAdminPassword`** encrypted with single deployment key — compromise of `DEPLOYMENT_SECRET_KEY` exposes all tenant Finance admin passwords | **HIGH** | `schema.ts:224` | Rotate this key quarterly; consider per-tenant encryption keys |
| **PMS RLS not enforced if app uses superuser DB connection** | **HIGH** | `0060_pms_rls.sql` creates `stockix_pms_app` role but runtime connection role unknown | Verify `DATABASE_URL` or `PMS_DATABASE_URL` uses `stockix_pms_app`; add startup assertion |
| **Custom role can be assigned `*` permission** equivalent to super_admin | **HIGH** | `permissions.ts` — no guard on custom role permission set | Validate that custom roles cannot include `*`; require super_admin confirmation for high-privilege custom roles |
| **Session cache (15s) means role revocation is not instant** | **MEDIUM** | `middleware/auth.ts` — Redis + in-process Map cache with 15s TTL | Acceptable for normal operations; implement emergency session revocation endpoint |
| **API keys cannot be scoped to specific permissions** | **MEDIUM** | API keys inherit owner's full permission set | Add per-key permission scoping |
| **Webhook validation not fully audited** | **MEDIUM** | `routes/webhooks.ts` not fully read | Verify all webhook sources use HMAC signatures |
| **No tenant data isolation for control-plane non-PMS tables** | **MEDIUM** | `tenants`, `licenses`, etc. — application-layer only | Consider adding RLS on control-plane tables for defense-in-depth |
| **ProxySQL admin credentials** exposed to worker via env var | **LOW** | `provisioner.ts:76–80` | Use Vault or secrets manager for ProxySQL admin password |
| **Bootstrap admin password deterministically derivable** from slug + secretKey | **LOW** | HMAC is correct but if secretKey leaks, all bootstrap passwords can be computed | Ensure `DEPLOYMENT_SECRET_KEY` is rotated and kept in HSM/Vault |

---

### Data Protection

| PII Field | Location | Protection | Notes |
|---|---|---|---|
| Owner email | `owners.email` Postgres | Plaintext | Unique index |
| Tenant admin email | `tenants.adminEmail` Postgres | Plaintext | Required for provisioning |
| Guest PII (name, email, passport, visa) | `pms_guests` Postgres | Plaintext | RLS if role configured |
| Email recipients | `email_logs.recipientHash` | SHA-256 hashed | Only hash stored |
| Finance admin password | `tenant_deployments.financeAdminPassword` | Encrypted (`enc:v1:*`) | Decrypt only when displayed |
| MySQL/JWT secrets | `tenant_deployments.mysqlPassword`, `jwtSecret` | Encrypted (`enc:v1:*`) | |

**Note:** PMS stores passport numbers, visa numbers, date of birth, and national ID numbers in plaintext in the shared Postgres database (`pms_guests` table, `schema.ts:744–762`). If RLS is not enforced, this is a major GDPR/data protection concern.

---

## PHASE 22 — PRODUCTION READINESS SCORES

### Scoring Methodology

Each area is scored 0–100:

- 0–25: Not suitable for production
- 26–50: Significant gaps, limited production use
- 51–75: Production-capable with known limitations
- 76–100: Production-ready with minor improvements needed

---

### Scores by Area

| Area | Score | Key Strengths | Key Gaps |
|---|---|---|---|
| **Provisioning** | **72/100** | Complete sequence verified, idempotent retries, cancellation, advisory locks, partial state tracking, SSE streaming | Orphaned Finance MySQL on failure, Chatwoot not cleaned up, one-time password loss on restart |
| **Billing** | **20/100** | Custom license system with grace periods and expiry warnings, Finance sync | No payment processing, no trials, no dunning, no self-service billing |
| **Tenancy** | **65/100** | Finance and POS fully isolated (dedicated stacks), organization scope for support agents | PMS shares Postgres, RLS activation unverified, no control-plane RLS |
| **Security** | **58/100** | JWT versioning, lockout, MFA schema, audit log, encrypted secrets, rate limiting | One-time password cache risk, Finance password exposure risk, PMS RLS unknown, API key over-permissioned |
| **Integrations** | **52/100** | POS-Finance sync via outbox pattern (bigcapitalSyncWorker), integration wiring at provision time | PMS-Finance sync worker not found, branch/location mapping absent, no SSO |
| **Emails** | **68/100** | 11 templates implemented, idempotent with idempotency keys, email_logs table, Resend integration | No retry on failure, missing module lifecycle emails, missing security alerts, no payment emails |
| **Permissions** | **62/100** | 4-tier role system, permission strings, custom roles, organization scoping | Custom role `*` risk, no cross-module identity, no per-key API permission scoping |
| **Observability** | **38/100** | Provision trace events (excellent), audit log, email logs, Prometheus metrics on worker | No centralized error tracking, no cross-service correlation, no alerting, no PMS sync monitoring |
| **Recovery** | **55/100** | Partial provision states, stuck reconciler, dead-letter queue, advisory locks, cancellation | No compensation for orphaned Finance data, no Chatwoot cleanup, manual dead-letter recovery |
| **Scalability** | **45/100** | Port-per-tenant allocation is atomic, ProxySQL for MySQL connection pooling | Port-per-tenant model limits density, shared MySQL/Mongo hosts are SPOFs, no worker horizontal scaling visible |

### **Overall Platform Score: 54/100**

---

## CRITICAL FINDINGS — PRIORITY RANKED

### P0 — Production Blockers (Fix Before Go-Live)

**Finding 1: One-time Finance admin password is permanently lost on API restart**

- **File:** `apps/api/src/routes/tenants-shared.ts:1533–1536`
- **Detail:** The Finance bootstrap admin password is stored only in a 15-minute in-memory Map (`provisionPasswordCache`). If the API process restarts between provisioning completing and the operator reading the status endpoint, the password is permanently lost. The operator then cannot log into Finance.
- **Fix:** Use the existing `tenant_provision_events` "secret" phase record with `cipher` field (already implemented for POS PINs). Always attempt DB decryption before returning null.

**Finding 2: POS has a live accounting engine even when Finance module is active**

- **Files:** `services/posnew/apps/pos-backend/routes/accountingRoute.js`, `services/posnew/apps/pos-backend/workers/bigcapitalSyncWorker.js`
- **Detail:** Both POS and Finance write GL entries independently. `bigcapitalSyncWorker` syncs POS sales to Finance, but POS's own GL engine is never disabled. This creates double-entry risk where the same sale appears in both POS trial balance and Finance trial balance.
- **Fix:** Add a `pos.accounting.relay_mode` feature flag that, when `accounting` module is active, switches POS GL writes off and proxies all reporting through Finance.

**Finding 3: No payment processing**

- **Detail:** The platform has no Stripe, Paddle, or any payment integration. All licensing is 100% manual. This means the business cannot scale without operator intervention for every tenant billing event.
- **Fix:** Integrate Stripe Billing. Map Stripe subscription status to license status. Implement webhook-driven license activation/suspension/renewal.

---

### P1 — High Priority (Fix Within 30 Days)

**Finding 4: PMS Row-Level Security may not be enforced**

- **File:** `packages/db/drizzle/0060_pms_rls.sql:24`
- **Detail:** RLS migration creates `stockix_pms_app` role and enables RLS on all 18 PMS tables. However, if the application connects to PostgreSQL as a superuser, RLS is silently bypassed. The runtime connection role is unknown.
- **Fix:** Confirm `DATABASE_URL` or `PMS_DATABASE_URL` uses `stockix_pms_app`. Add a startup assertion: `SELECT has_table_privilege('stockix_pms_app', 'pms_properties', 'SELECT')`.

**Finding 5: Orphaned Finance MySQL databases on provision failure**

- **File:** `infra/worker-service/src/provision-runtime.ts`
- **Detail:** If the worker creates the Finance tenant in MySQL and then crashes before writing the control-plane `tenants` record, the MySQL database persists with no owner. No cleanup mechanism exists.
- **Fix:** Implement a `provision.preflight.check_mysql_orphan` step that checks if MySQL data exists for a slug before provisioning begins, and offers cleanup.

**Finding 6: PMS-Finance sync worker not found**

- **File:** `packages/db/src/schema.ts:799–804`
- **Detail:** `pms_bookings.accountingSyncStatus` and `pms_bookings.financeReceiptId` exist, but no background job that processes `status="pending"` bookings was found. PMS revenue is likely not reaching Finance.
- **Fix:** Implement `pms-finance-sync` job type in the worker. Process pending bookings, create Finance SaleReceipts, update `financeReceiptId` and `accountingSyncStatus`.

**Finding 7: Branch-to-Location mapping absent**

- **Detail:** Finance branches and POS locations are managed in separate systems with no link in the control plane. Multi-location reporting that spans both systems is impossible.
- **Fix:** Add `branch_location_mappings` table. Populate during provisioning by querying Finance for default branch ID and POS for default location ID.

---

### P2 — Medium Priority (Fix Within 90 Days)

**Finding 8: Chatwoot not cleaned up on module remove or tenant delete**

- **File:** `infra/worker-service/src/chatwoot-provision.ts`, `apps/api/src/routes/tenant-modules.ts`
- **Detail:** Removing the `chat` module does not deactivate or delete the Chatwoot account. Tenant admin retains live Chatwoot access. No cleanup in deprovision job either.
- **Fix:** Call `DELETE /platform/api/v1/accounts/:id` on module remove and tenant deprovision.

**Finding 9: No module lifecycle emails**

- **File:** `apps/api/src/mail/send.ts`
- **Detail:** When a module is added or removed, no email is sent to the tenant admin. Users lose access without warning.
- **Fix:** Add `sendModuleAddedEmail()` and `sendModuleRemovedEmail()` called from module job completion handlers.

**Finding 10: No trial period system**

- **Detail:** The platform cannot offer time-limited evaluations. A `trial` license status is not defined in schema or code.
- **Fix:** Add `status: "trial"` to license status enum. Add `trialEndsAt` timestamp. Send `trial-started` and `trial-ending` emails. Auto-convert to `expired` when trial ends.

**Finding 11: Custom role can be granted all permissions (`*`)**

- **File:** `packages/shared/src/permissions.ts:21`
- **Detail:** The `*` permission is included in the `PERMISSIONS` array, making it selectable for custom roles. A `billing_manager` could create a custom role with `*` and escalate their own privileges.
- **Fix:** Restrict `*` to `super_admin` only. Validate permission arrays before INSERT: if `*` is present, role creator must be `super_admin`.

**Finding 12: No centralized error tracking**

- **Detail:** Runtime errors in the API, worker, Finance app, and POS app are logged locally but not aggregated. Production incidents require log-diving across multiple Docker containers.
- **Fix:** Integrate Sentry or similar. Add `SENTRY_DSN` to all service environments. Wrap unhandled promise rejections and uncaught exceptions.

---

### P3 — Low Priority / Technical Debt

**Finding 13: PMS guest PII stored in plaintext**

- Passport numbers, visa numbers, DOB in `pms_guests` table — plaintext in shared Postgres
- Encrypt sensitive fields at application layer before storage

**Finding 14: `redis.keys()` used in feature flag cache invalidation**

- O(N) Redis operation; use Redis SCAN instead for production with many tenants

**Finding 15: Port-per-tenant model limits density**

- Each tenant allocates multiple ports — platform will hit port range limits at scale
- Consider Traefik with domain-based routing instead of port-based routing

**Finding 16: No email retry**

- Failed email sends are fire-and-forget
- Implement retry queue with exponential backoff

**Finding 17: No cross-module identity / SSO**

- Finance, POS, and control-plane are separate identity silos
- Plan SAML/OIDC integration or a shared identity provider

---

## APPENDIX A — DATABASE TABLE INVENTORY

### Control-Plane PostgreSQL Tables (41 tables in schema.ts)

| Table | Purpose |
|---|---|
| `platform_roles` | Custom operator roles |
| `owners` | Platform operators (Stockix employees) |
| `owner_organization_access` | Support agent org scoping |
| `tenants` | Customer companies |
| `tenant_config` | White-label branding per tenant |
| `tenant_deployments` | Docker stack metadata, encrypted secrets, Finance/POS IDs |
| `tenant_provision_events` | Append-only provision audit trail |
| `tenant_lifecycle_jobs` | Job queue for all lifecycle operations |
| `dead_letter_jobs` | Failed jobs beyond maxAttempts |
| `tenant_deletion_logs` | Persists after tenant delete |
| `organizations` | Sub-organizations of tenants |
| `admin_audit_log` | Admin action audit trail |
| `pms_audit_log` | PMS admin action audit trail |
| `api_keys` | Programmatic access keys |
| `api_idempotency_keys` | Request deduplication |
| `plans` | Subscription plan definitions |
| `licenses` | License records |
| `license_history` | License state change audit |
| `license_activations` | Hardware/device activations |
| `blacklisted_fingerprints` | Blocked hardware fingerprints |
| `owner_notifications` | In-app alerts for operators |
| `email_logs` | Email delivery audit |
| `feature_flags` | Feature toggle state |
| `pms_properties` | Hotel/property definitions |
| `pms_rooms` | Room definitions |
| `pms_guests` | Guest profiles |
| `pms_bookings` | Bookings with Finance sync status |
| `pms_payments` | Booking payments |
| `pms_ical_channels` | OTA calendar channel configs |
| `pms_calendar_events` | Synced OTA calendar events |
| `pms_sync_logs` | iCal sync attempt log |
| `pms_date_overrides` | Property closure/open overrides |
| `pms_staff` | PMS staff profiles |
| `pms_cleaners` | Cleaner profiles |
| `pms_cleaner_assignments` | Cleaner-to-property assignments |
| `pms_cleaning_tasks` | Housekeeping task queue |
| `pms_property_managers` | Property manager delegation |
| `pms_property_manager_invites` | Manager invite tokens |
| `pms_message_templates` | Guest messaging templates |
| `pms_guest_form_templates` | Pre-arrival form definitions |
| `pms_guest_form_submissions` | Guest form responses |

---

## APPENDIX B — MIGRATION HISTORY SUMMARY

67 migrations as of audit date. Key migration milestones:

| Migration | What It Added |
|---|---|
| 0000–0003 | Initial schema: tenants, owners, provision events, deployments |
| 0004–0007 | Auth hardening: session versioning, lockout, password hash |
| 0008–0009 | Idempotency keys |
| 0012 | Phase 3 licensing: licenses, plans, activations |
| 0016 | Owner organization access (scoping) |
| 0021 | API keys |
| 0025 | Plan billing fields (price, interval) |
| 0026 | License history audit |
| 0027 | Tenant modules JSON field |
| 0029 | PMS core tables |
| 0030 | Chatwoot account ID |
| 0038 | PMS guest forms |
| 0041 | Owner notifications |
| 0043 | Email logs |
| 0044 | Custom platform roles |
| 0045 | Tenant organization scope permission |
| 0046 | STXI license key format |
| 0047 | Partial failure kind |
| 0049 | Lifecycle job claim token |
| 0052 | One active license per tenant constraint |
| 0057 | Job cancel requested at timestamp |
| 0058 | Deprovisioning tenant status |
| 0060 | PMS Row-Level Security |
| 0063–0067 | Audit log protection, additional indexes, schema hardening |

---

## APPENDIX C — ENVIRONMENT VARIABLES (CRITICAL)

The following environment variables are architecturally critical. Misconfiguration of any of these causes security or data integrity failures:

| Variable | Impact if Missing/Wrong |
|---|---|
| `DEPLOYMENT_SECRET_KEY` | All tenant secrets unencryptable; Finance admin passwords inaccessible |
| `AUTH_TOKEN_SECRET` | All JWT sessions invalid |
| `DATABASE_URL` | No database access |
| `SHARED_MYSQL_HOST` | Finance provisioning fails |
| `SHARED_MYSQL_ROOT_PASSWORD` | Cannot create tenant MySQL users |
| `SHARED_MONGO_HOST` | POS provisioning fails |
| `PROVISION_MODULE_GATING` | If `0`, ALL modules provision regardless of license |
| `POS_PLATFORM_API_KEY` | POS org bootstrap fails; integration wiring fails |
| `RESEND_API_KEY` | POS welcome email fails; POS compose fails |
| `CHATWOOT_BASE_URL` + `CHATWOOT_API_ACCESS_TOKEN` | Chat provisioning silently skipped |
| `PLATFORM_JWT_SECRET` | POS cannot validate platform auth tokens |
| `LICENSE_SIGNING_SECRET` | STXI license key signing/validation fails |
| `FIELD_ENCRYPTION_KEY` | POS field-level encryption fails |

---

*End of FullAppChecker.md — Total coverage: 22 phases, 41 database tables, 5 infrastructure stacks, 67 migrations, 11 email templates, 5 job types, 4 modules.*
