# Multi-Org Implementation Audit — stockix-finance

**Date:** 2026-05-16  
**Scope:** Phases 1–5 (database → auth → tenancy → invites → internal API → frontend)  
**Mode:** Read-only verification. No code changes.

---

## Executive summary

| Layer | Verdict |
|-------|---------|
| **Source code (phases 1–5)** | Largely **implemented** — models, auth, guards, invite send, internal API, and frontend hooks are present and TypeScript-clean. |
| **Live database (`stockix-finance-mariadb-1`)** | **NOT migrated** — `user_tenants` table missing; phase migrations not in `knex_migrations`. |
| **Running API (`localhost:4160`)** | **Old build** — `GET /api/auth/my-tenants` and `POST /api/internal/attach-user-to-tenant` return **404**. |
| **End-to-end product flow** | **HAS GAPS** — code path exists but DB + deploy + accept-invite + signin null-`tenant_id` + saas-dash caller are incomplete or risky. |

**OVERALL: HAS GAPS**

---

## BLOCK 1 — DATABASE LAYER

### 1a. Migrations on disk — **PASS**

```
20240915070439_create_payment_links_table.js
20240928145627_add_logo_key_to_tenant_metadata.js
20251102082642_create_api_keys_table.js
20260516000000_create_user_tenants_table.js
20260516130000_make_users_tenant_id_nullable.js
```

Both expected files exist under `packages/server/src/database/system/migrations/`.

### 1b. `20260516000000_create_user_tenants_table.js` — **PASS**

| Requirement | Status |
|-------------|--------|
| `user_id` FK → `users.id` ON DELETE CASCADE | PASS |
| `tenant_id` FK → `tenants.id` ON DELETE CASCADE | PASS |
| `organization_id` column | PASS |
| `role` column | PASS |
| `unique(user_id, tenant_id)` | PASS |
| Backfill SQL from `users` + `tenants` | PASS (`ON DUPLICATE KEY UPDATE`) |

### 1c. `20260516130000_make_users_tenant_id_nullable.js` — **PASS**

`users.tenant_id` altered to `nullable()` in `up`; restored `notNullable()` in `down`.

### 1d. Live DB (`bigcapital_system` on `stockix-finance-mariadb-1`) — **FAIL**

```sql
-- knex_migrations (latest): stops at 20251102082642_create_api_keys_table.js
-- Tables present: USERS, TENANTS, USER_INVITES, ... NO user_tenants
```

| Check | Result |
|-------|--------|
| `user_tenants` table | **MISSING** |
| Migrations `20260516000000_*` / `20260516130000_*` applied | **NO** |
| `USERS.TENANT_ID` nullable | **YES** (already nullable in live DB, but not via recorded knex migration) |

**Note:** Runtime code that queries `user_tenants` will throw SQL errors until migrations are run.

---

## BLOCK 2 — BACKEND MODELS

### 2a. `UserTenant.ts` — **PASS**

- Extends `BaseModel`
- `tableName = 'user_tenants'`
- Relations: `user` → `SystemUser`, `tenant` → `TenantModel`
- `export default UserTenant`

### 2b. `SystemUser.ts` — **PASS**

- `tenantId?: number | null`
- `userTenants` HasMany → `UserTenant`

### 2c. `SystemModels.module.ts` — **PASS**

`UserTenant` imported and included in `models` array.

---

## BLOCK 3 — AUTH BACKEND

### 3a. `AuthSignin.service.ts` — **PASS** (with risk notes)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| JWT includes `organizationId` | PASS | `signToken`: `{ sub, organizationId }` |
| `verifyPayload` checks `user_tenants` | PASS | `findOne({ userId, organizationId: payload.organizationId })` |
| Sets CLS `organizationId` | PASS | `clsService.set('organizationId', payload.organizationId)` |
| Rejects non-member | PASS | `throwIfNotFound` → `UserNotFoundException` extends `UnauthorizedException` (401) |

**Risk:** `resolveOrganizationId()` uses `user.tenantId` only. Users with `tenant_id = NULL` and memberships only in `user_tenants` will fail sign-in token resolution.

### 3b. `AuthSignup.service.ts` — **PASS**

| Requirement | Status |
|-------------|--------|
| Org-scoped email uniqueness | PASS (`validateEmailUniqiness(email, organizationId)`) |
| Find-or-create user | PASS |
| Inserts `user_tenants` role `owner` | PASS (idempotent) |
| Sets `users.tenant_id` for backward compat | PASS (patch if null) |

### 3c. `Auth.controller.ts` — **PARTIAL** (routes live elsewhere)

| Requirement | Status | Notes |
|-------------|--------|-------|
| `GET /auth/my-tenants` | **PASS*** | On `Authed.controller.ts` (JWT), not `Auth.controller.ts` |
| `POST /auth/switch-tenant` | **PASS*** | Same |
| `await signToken` | **PASS** | `accessToken: await this.authSignin.signToken(user)` |

\*Checklist referenced `Auth.controller.ts`; implementation is correct on `Authed.controller.ts` under the same `/auth` prefix.

### 3d. `ListMyTenants.service.ts` — **PASS**

Queries `user_tenants` by CLS `userId`, returns `tenantId`, `organizationId`, `role`, `name` (from tenant metadata).

### 3e. `SwitchTenant.service.ts` — **PASS**

Validates membership, signs new JWT with target `organizationId`, returns `{ accessToken, organizationId, tenantId, userId }` (serialized to snake_case by global interceptor).

### 3f. `Auth.interfaces.ts` — **PASS**

`JwtPayload` includes `organizationId: string`.

---

## BLOCK 4 — TENANCY GUARD

### 4a. `TenancyGlobal.guard.ts` — **PASS** (with risk)

| Requirement | Status |
|-------------|--------|
| Async guard | PASS |
| Reads `userId` from CLS | PASS |
| Reads `organization-id` header | PASS |
| Checks `user_tenants` membership | PASS (when `userId` set) |
| 403 if not member | PASS (`ForbiddenException`) |
| Bypass: `@PublicRoute`, `@TenantAgnosticRoute`, API key | PASS |

**Risk:** If `userId` is not yet in CLS when this guard runs, membership check is **skipped** (only header presence enforced). Guard order vs JWT matters.

**Risk:** Guard validates **header** org, while `TenancyContext.getTenant()` uses CLS `organizationId` from **JWT**. A user member of org A and B could send header B with JWT for A unless clients always switch JWT when switching org (frontend does on switch).

### 4b. `TenancyContext.service.ts` — **PASS**

CLS-based; `getTenant()` resolves tenant by `cls.get('organizationId')`.

---

## BLOCK 5 — INVITE FLOW

### 5a. `SyncSystemSendInvite.subscriber.ts` — **PASS**

- Find-or-create system user by email (no duplicate `users` row)
- Inserts `user_tenants` (`role: 'member'`) idempotently
- Loads tenant for `organizationId`
- Creates invite + links tenant user

### 5b. `SyncTenantAcceptInvite.subscriber.ts` — **FAIL (GAP)**

- **Does not** write to `user_tenants`
- Only updates tenant-scoped `TenantUser` (name, email, `inviteAcceptedAt`)
- Membership is established on **send invite**, not accept — acceptable if send always runs first; **GAP** if invite path skips system sync

---

## BLOCK 6 — INTERNAL ENDPOINT

### 6a. `Internal.controller.ts` — **PASS** (code)

`POST /internal/attach-user-to-tenant` exists; `@UseGuards(InternalSecretGuard)`.

### 6b. `InternalSecret.guard.ts` — **PASS**

Reads `x-internal-secret`; compares to `ConfigService.get('INTERNAL_API_SECRET')`; 401 on mismatch or missing config.

### 6c. `AttachUserToTenant.service.ts` — **PASS**

Find user by email, tenant by `organizationId`, idempotent insert into `user_tenants`.

### 6d. `App.module.ts` — **PASS**

`InternalModule` registered (line ~195).

**Runtime:** `POST http://localhost:4160/api/internal/attach-user-to-tenant` → **404** (deployed stack does not include this build).

**Integration:** No caller in `infra/worker-service` or monorepo grep for `attach-user-to-tenant` — **GAP** for saas-dash provisioning.

---

## BLOCK 7 — FRONTEND

### 7a. `useStockixOrgs.tsx` — **PASS**

- Primary: `GET auth/my-tenants` via `useApiRequest`
- Fallback: `REACT_APP_STOCKIX_API_URL` + `REACT_APP_STOCKIX_TENANT_ID` external org list
- Returns `StockixOrg[]` with `organizationId`

### 7b. `useSwitchTenant.tsx` — **PASS**

- `POST auth/switch-tenant` with `{ organization_id }` (snake_case; server transforms to `organizationId`)
- Updates cookies + Redux batch + `queryClient.invalidateQueries()`

### 7c. `SidebarHead.tsx` — **PASS**

- `useStockixOrgs` + `useSwitchTenant`
- Same-host → `switchTenant(org.organizationId)`
- Cross-host → `window.location.href` to `publicUrl` / subdomain
- Highlights current org; disabled while switching

### 7d. `hooks/query/index.tsx` — **PASS**

Exports `useSwitchTenant` and `useStockixOrgs`.

---

## BLOCK 8 — END-TO-END FLOW (code evidence)

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| Q1 | Signup creates `user_tenants` row? | **YES** | `AuthSignup.service.ts` insert `role: 'owner'` |
| Q2 | Login JWT has `organizationId`? | **YES** | `AuthSignin.service.ts` `signToken` |
| Q3 | API validates membership vs `organization-id` header? | **YES** (if CLS `userId` set) | `TenancyGlobal.guard.ts` |
| Q4 | Invite creates `user_tenants`? | **YES** | `SyncSystemSendInvite.subscriber.ts` |
| Q5 | Accept invite updates `user_tenants`? | **NO** | `SyncTenantAcceptInvite` — tenant user only |
| Q6 | `GET /auth/my-tenants` returns all orgs? | **YES** (code) | `ListMyTenants.service.ts` — **blocked in prod until DB + deploy** |
| Q7 | Switch org updates cookies + Redux? | **YES** | `useSwitchTenant.tsx` |
| Q8 | Internal attach without new user? | **YES** (code) | `AttachUserToTenant.service.ts` — **no platform caller found** |
| Q9 | Two users same org both have rows? | **YES** (by design) | Separate `user_tenants` per user on invite/signup |
| Q10 | One user, two orgs, switch without logout? | **YES** (same origin) | `SwitchTenant` + `useSwitchTenant`; cross-origin uses full navigation |

**Sign-in caveat (Q2/Q10):** `Auth.controller` signin still loads tenant via `user.tenantId` only — multi-org user with null `tenant_id` may get wrong org or error on login until `signToken` resolves from `user_tenants`.

---

## BLOCK 9 — TYPESCRIPT CHECK

| Package | Command | Result |
|---------|---------|--------|
| `packages/server` | `npx tsc --noEmit` | **PASS** — exit 0, no output |
| `packages/webapp` | `npx tsc --noEmit` | **PASS** — exit 0, no output |

---

## BLOCK 10 — GAP ANALYSIS

```
GAP: user_tenants migration not applied on live MariaDB (stockix-finance-mariadb-1)
SEVERITY: HIGH
FILE: packages/server — run system knex migrations
FIX: Apply 20260516000000 and 20260516130000 before any multi-org traffic

GAP: Running API stack (localhost:4160) returns 404 for /auth/my-tenants and /internal/attach-user-to-tenant
SEVERITY: HIGH
FILE: Deploy/rebuild stockix-finance server image with current packages/server
FIX: Redeploy server after migrations; verify routes with authenticated curl

GAP: Auth signin/signToken assumes users.tenant_id for default organization
SEVERITY: HIGH
FILE: packages/server/src/modules/Auth/commands/AuthSignin.service.ts, Auth.controller.ts
FIX: Resolve org from first user_tenants row or explicit login org param when tenant_id is null

GAP: Accept-invite does not touch user_tenants (relies on send-invite sync only)
SEVERITY: MEDIUM
FILE: packages/server/src/modules/UsersModule/subscribers/SyncTenantAcceptInvite.subscriber.ts
FIX: Upsert user_tenants on accept if missing, or document invariant that send always precedes accept

GAP: No saas-dash / worker caller for POST /internal/attach-user-to-tenant
SEVERITY: MEDIUM
FILE: infra/worker-service (provisioning adapters)
FIX: Call internal attach after org provision with shared INTERNAL_API_SECRET

GAP: TenancyGlobalGuard skips membership check when CLS userId absent
SEVERITY: MEDIUM
FILE: packages/server/src/modules/Tenancy/TenancyGlobal.guard.ts
FIX: Ensure guard order runs JWT before tenancy, or fail closed if userId missing on protected routes

GAP: JWT organizationId vs organization-id header can diverge
SEVERITY: MEDIUM
FILE: TenancyGlobal.guard.ts / AuthSignin.service.ts
FIX: Reject requests where header org !== JWT org, or set CLS org from header after membership check

GAP: INTERNAL_API_SECRET only in .env.example; not in typed config module
SEVERITY: LOW
FILE: packages/server/src/common/config/, InternalSecret.guard.ts
FIX: Add to config schema or document required env for all deploy environments

GAP: OpenAPI / SDK not regenerated for my-tenants / switch-tenant / internal routes
SEVERITY: LOW
FILE: shared/sdk-ts/openapi.json
FIX: Re-export OpenAPI after route additions
```

---

## FINAL REPORT TABLE

| Component | Status | Notes |
|-----------|--------|-------|
| user_tenants migration | **PASS** | On disk; **not applied** to live DB |
| users.tenant_id nullable migration | **PASS** | On disk; live DB already nullable; knex record absent |
| UserTenant model | **PASS** | |
| SystemUser nullable tenantId | **PASS** | |
| SystemModels registration | **PASS** | |
| AuthSignin — JWT has organizationId | **PASS** | |
| AuthSignin — verifyPayload checks membership | **PASS** | 401 via UserNotFoundException |
| AuthSignup — org-scoped email check | **PASS** | |
| AuthSignup — writes user_tenants | **PASS** | |
| TenancyGlobalGuard — membership check | **PASS** | When userId in CLS |
| GET /auth/my-tenants | **PASS** | `Authed.controller.ts`; **404 on running stack** |
| POST /auth/switch-tenant | **PASS** | Same |
| Invite flow — writes user_tenants | **PASS** | On send |
| Accept invite — updates user_tenants | **FAIL** | Not implemented |
| POST /internal/attach-user-to-tenant | **PASS** | Code only; **404 runtime**; no platform caller |
| useStockixOrgs — reads /auth/my-tenants | **PASS** | |
| useSwitchTenant hook | **PASS** | |
| SidebarHead org switcher | **PASS** | |
| TypeScript — server exit 0 | **PASS** | |
| TypeScript — webapp exit 0 | **PASS** | |

---

## OVERALL: **HAS GAPS**

### Must build / run before claiming complete

1. **Run system DB migrations** (`20260516000000`, `20260516130000`) on every finance environment.
2. **Deploy** current `packages/server` + `packages/webapp` (running stack at `:4160` is behind).
3. **Fix signin** for users with `tenant_id = NULL` but multiple `user_tenants` rows.
4. **Wire saas-dash** (or worker) to `POST /api/internal/attach-user-to-tenant` with `x-internal-secret`.
5. **Decide accept-invite policy** — document send-before-accept or add `user_tenants` upsert on accept.

### Verification commands (post-migrate + deploy)

```bash
# After migrations
docker exec stockix-finance-mariadb-1 mysql -u bigcapital -pbigcapital bigcapital_system \
  -e "DESCRIBE user_tenants; SELECT name FROM knex_migrations ORDER BY id DESC LIMIT 3;"

# After deploy (replace TOKEN)
curl.exe -H "Authorization: Bearer TOKEN" http://localhost:PORT/api/auth/my-tenants

curl.exe -X POST http://localhost:PORT/api/auth/switch-tenant \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d "{\"organization_id\":\"ORG_ID\"}"

curl.exe -X POST http://localhost:PORT/api/internal/attach-user-to-tenant \
  -H "x-internal-secret: SECRET" -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"organization_id\":\"ORG_ID\"}"
```

---

*Audit performed read-only against `services/stockix-finance` source tree, `stockix-finance-mariadb-1`, and `http://localhost:4160` (stockix-test nginx).*
