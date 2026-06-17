# RBAC & Multi-Tenant Isolation Audit — Stockix Finance

**Audited:** 2026-06-17
**Scope:** `services/stockix-finance/packages/server/src`
**System:** NestJS, CASL, BullMQ, per-tenant MySQL databases

---

## A. Tenant Isolation

### How It Works

Physical per-tenant database isolation: each organization gets its own database named `stockix_tenant_{id}`. A CLS-scoped Knex connection is resolved per request through a global guard chain:

1. `ThrottlerGuard` — rate limiting
2. `MixedAuthGuard` → `JwtAuthGuard` or `ApiKeyAuthGuard` — authentication
3. `EnsureUserVerifiedGuard` — email verified check
4. `TenancyGlobalGuard` — validates `organization-id` header against JWT claim + re-queries `UserTenant` membership, sets CLS
5. `EnsureTenantIsInitializedGuard`, `EnsureTenantIsSeededGuard`, `TenancyInitializeModelsGuard` — lifecycle checks

### Verified Paths (Solid)

- `AuthSigninService.verifyPayload` verifies both user existence and `UserTenant` membership for the token's `organizationId` before populating CLS.
- `TenancyGlobalGuard` cross-checks `header[organization-id]` against the JWT claim, then re-validates membership via a fresh DB query. Neither value alone is trusted.
- API key auth derives `organizationId` from the key record (not the header).
- `SwitchTenantService` re-validates `UserTenant` membership before issuing a new JWT.

### Latent Injection Path

`App.module.ts` writes `organizationId` from the raw `organization-id` header into CLS **before any guard runs**:

```ts
setup: (cls, req) => { cls.set('organizationId', req.headers['organization-id']); }
```

On `@PublicRoute()` or `@TenantAgnosticRoute()` routes the `TenancyGlobalGuard` skips validation — the raw attacker-supplied value stays in CLS. If any such route ever calls a `TenantModelProxy`, it will connect to whichever tenant database the attacker specifies, without membership check. No current public route triggers this, but the pattern is a latent injection path.

---

## B. RBAC Model

### Roles

| Role | Source | Permissions |
|------|--------|-------------|
| `admin` | Hardcoded in `TenantAbilities.ts:37-39` | `{ action: 'manage', subject: 'all' }` — full CASL wildcard |
| `staff` (roleId=2) | DB seed `20210812121909_seed_roles_permissions.ts` | SaleInvoice, SaleEstimate, SaleReceipt, PaymentReceive, Bill, PaymentMade — full CRUD |
| `accountant`, `viewer` | Referenced in `InternalProvision.controller.ts` | Not fully seeded in audited files |
| Custom roles | Tenant DB via `POST /roles` | Any subset of `AbilitySchema` subjects and actions |

### How Permissions Are Enforced

`AuthorizationGuard` + `PermissionGuard` must be applied **explicitly** per controller via `@UseGuards()` — they are **not registered as global `APP_GUARD`**. Every controller omitting them is effectively unguarded beyond authentication.

### Controllers With Guards Correctly Applied (Sampled)

`TaxRate`, `VendorCredits`, `CreditNotesApplyInvoice`, `GeneralLedger`, `ARAgingSummary`, `JournalSheet`

### Controllers With NO Permission Guards (~47 of ~52)

Any authenticated tenant member has full access to all endpoints in these controllers:

| Controller | Exposed Operations |
|-----------|-------------------|
| `Roles.controller.ts` | Create / edit / delete roles |
| `Users.controller.ts` | Edit any user including role, delete, activate/inactivate |
| `UsersInvite.controller.ts` | Send invite with any role |
| `Branches.controller.ts` | Full branch CRUD + activate |
| `Warehouses.controller.ts` | Full warehouse CRUD + activate |
| `WarehouseItems.controller.ts` | Warehouse item management |
| `Organization.controller.ts` | Org settings |
| `BankRules.controller.ts` | Bank rule management |
| `BankAccounts.controller.ts` | Bank account management |
| `BankingCategorize.controller.ts` | Transaction categorization |
| `BankingMatching.controller.ts` | Transaction matching |
| `BankingTransactions/controllers/*.controller.ts` (all 3) | All banking transactions |
| `Import.controller.ts` | Import arbitrary data |
| `SaleReceipts.controller.ts` | Full receipts access |
| `TransactionsLocking.controller.ts` | Lock / unlock periods |
| `Attachments.controller.ts` | All file attachments |
| Multiple FinancialStatements controllers | CustomerBalanceSummary, InventoryItemDetails, InventoryValuation, PurchasesByItems, SalesByItems, etc. |

---

## C. Sub-Org Scoping (Branches / Warehouses)

### Cross-Tenant

Solid — physical DB isolation prevents any cross-tenant access to branch or warehouse records.

### Within-Tenant (Branch-Level)

**Not enforced at the server layer.** There is:

- No user-to-branch assignment table
- No query-level filter restricting users to their assigned branch
- No `@RequirePermission` on `BranchesController` or `WarehousesController`
- Only UI-side assumptions about which branch a user belongs to

Any authenticated tenant user can list all branches, create a new branch, edit or delete any branch, and create transactions against any branch.

---

## D. JWT & Session Security

### Token Contents (`src/modules/Auth/Auth.interfaces.ts:6-11`)

```
{ sub: email, organizationId, iat, exp }
```

### Trust Model

`organizationId` in the JWT is validated against the `UserTenant` membership table on every request via `verifyPayload`. The `TenancyGlobalGuard` additionally cross-checks it against the `organization-id` request header. Neither value alone is trusted.

### Issues

| Issue | Location | Detail |
|-------|----------|--------|
| Default JWT secret `'123123'` | `src/common/config/jwt.ts:5` | If `APP_JWT_SECRET` is unset, HMAC-HS384 uses this hardcoded value — any attacker can forge tokens for any user/org |
| `/auth/impersonate` unverified token | `src/modules/Auth/Auth.controller.ts:204-253` | Accepts arbitrary string via `?t=` or POST body, sets as `httpOnly: false` cookie without verifying JWT signature — XSS-readable |
| No `jti` / no revocation | JWT config | Stolen tokens valid for full 24h with no server-side invalidation |
| `uniqid()` for reset tokens | `src/modules/Auth/commands/AuthSendResetPassword.service.ts:40` | Time-based, low-entropy identifiers — predictable under certain conditions |

---

## E. Privilege Escalation Risks

### Role Assignment

`PUT /users/:id` → `EditUserService.editUser()` (`src/modules/UsersModule/commands/EditUser.service.ts:29-68`)

`validateMutateRoleNotAuthorizedUser()` only blocks a user from changing **their own** role. It does not prevent user A (any role) from elevating user B to admin. `Roles.controller.ts` and `UsersInvite.controller.ts` have no guards at all.

### CASL Cache Never Purged

- Cache stored with key `"${userId}_${organizationId}"` (string) in `TenantAbilities.ts`
- Purge attempted with key `systemUserId` (number) in `PurgeUserAbilityCache.subscriber.ts:26`
- Keys never match → role changes and deactivations **never take effect** until LRU naturally evicts (capacity: 1000 entries)

### Deactivated Users Not Blocked

`InactivateUser.service.ts` sets `TenantUser.active = false` but no guard or interceptor checks this field. A deactivated user with a valid JWT retains full API access for up to 24 hours.

### Cross-Tenant API Key Revocation

`GenerateApiKey.revoke()` (`src/modules/Auth/commands/GenerateApiKey.service.ts:46-47`):

```ts
await ApiKeyModel.query().findById(apiKeyId).patch({ revokedAt: new Date() });
```

No `WHERE tenantId = ?` filter. Any authenticated user can revoke any tenant's API keys by guessing or enumerating numeric IDs.

---

## F. Vulnerability Summary

| # | Severity | Location | Description | Expected | Actual | Fix |
|---|----------|----------|-------------|----------|--------|-----|
| 1 | **CRITICAL** | `src/common/config/jwt.ts:5` | JWT secret defaults to `'123123'` | Secret required, no default | Any party can forge valid JWTs | Remove `\|\| '123123'` fallback; throw at startup if env var missing |
| 2 | **CRITICAL** | `Roles.controller.ts` (all routes) | Any user can create/edit/delete roles | Admin-only | No `AuthorizationGuard` in place | Add `@UseGuards(AuthorizationGuard, PermissionGuard)` + `@RequirePermission('manage', 'Role')` |
| 3 | **CRITICAL** | `Users.controller.ts` `PUT /:id` | Any user can change another user's role to admin | Admin-only, privilege ceiling enforced | `validateMutateRoleNotAuthorizedUser` only blocks self-role-change | Add guard + server-side check that caller's role ≥ target role |
| 4 | **CRITICAL** | `UsersInvite.controller.ts` `PATCH /` | Any user can invite with any role including admin | Requires invite permission; roleId capped at caller's role | No authorization guard | Add guard + validate `roleId` cannot exceed caller's role |
| 5 | **HIGH** | `GenerateApiKey.service.ts:46` | Cross-tenant API key revocation | Only own tenant's keys | Any user can revoke any tenant's key by numeric ID | Add `.where({ tenantId })` to revoke query |
| 6 | **HIGH** | `TenantAbilities.ts` + `PurgeUserAbilityCache.subscriber.ts:26` | CASL cache purge key mismatch (string vs number) | Role/deactivation changes apply immediately | Changes never reflected until LRU evicts entry | Fix purge key to match storage key: `"${systemUserId}_${organizationId}"` |
| 7 | **HIGH** | `InactivateUser.service.ts` + `Authorization.guard.ts` | Deactivated users retain full API access for 24h | Deactivated = blocked immediately | `tenantUser.active` never checked after deactivation | Add `!tenantUser.active` → `ForbiddenException` in `AuthorizationGuard.getAbilityForUser()` |
| 8 | **HIGH** | `Branches.controller.ts`, `Warehouses.controller.ts` | Full branch/warehouse management, no RBAC | Permission required | Any tenant member can manage branches/warehouses | Add `@UseGuards(AuthorizationGuard, PermissionGuard)` + `@RequirePermission` |
| 9 | **MEDIUM** | `Auth.controller.ts:204-253` | `/auth/impersonate` sets unverified JWT in JS-readable cookie | Token verified; cookie `httpOnly: true` | Signature not verified; `httpOnly: false` — XSS-stealable | Verify JWT before setting cookie; use `httpOnly: true` |
| 10 | **MEDIUM** | `AuthSendResetPassword.service.ts:40` | `uniqid()` for password reset tokens (time-based) | CSPRNG-generated tokens | Predictable under timing analysis | Replace with `crypto.randomBytes(64).toString('hex')` |
| 11 | **MEDIUM** | `InternalSecret.guard.ts:23` | Non-timing-safe secret comparison | `crypto.timingSafeEqual()` | `secret !== expected` (string compare) | Use `crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))` |
| 12 | **MEDIUM** | `InternalProvisionController`, `InternalLicenseController` | `@UseGuards(InternalSecretGuard)` per-method instead of class level | All routes protected by default | New methods added without guard create unprotected internal routes | Move decorator to class level |
| 13 | **MEDIUM** | Bull Board middleware | Dashboard publicly accessible when credentials not set | Always requires auth when enabled | If `BULL_BOARD_USERNAME`/`PASSWORD` unset, board is open | Fail closed: require credentials, throw at startup if missing |
| 14 | **LOW** | JWT config (global) | No `jti` claim, no server-side revocation | Compromised tokens can be invalidated | Stolen token valid for full 24h | Add `jti` + Redis revocation list with TTL matching token expiry |
| 15 | **LOW** | ~47 of ~52 business controllers | Missing `@RequirePermission` — any tenant member reaches all endpoints | RBAC enforced consistently | Any authenticated user accesses banking, reporting, import, attachments, etc. | Systematically apply guards following `TaxRate.controller.ts` pattern |

---

## G. Remediation Priority

### Immediate (Pre-Deploy Blocker)
- **#1** — Remove `|| '123123'` JWT secret fallback. Add startup assertion.

### Within 24 Hours
- **#5** — Scope `GenerateApiKey.revoke()` to current tenant.

### Within 48 Hours
- **#6** — Fix CASL cache purge key mismatch.
- **#7** — Add `tenantUser.active` check in `AuthorizationGuard`.

### Within 1 Sprint
- **#2** — Guard `Roles.controller.ts` with admin-only permission.
- **#3** — Guard `Users.controller.ts` + add privilege ceiling on role assignment.
- **#4** — Guard `UsersInvite.controller.ts` + cap `roleId` at caller's role.
- **#8** — Guard `Branches` and `Warehouses` controllers.

### Within 1 Quarter
- **#15** — Systematically apply `@UseGuards(AuthorizationGuard, PermissionGuard)` + `@RequirePermission` across all 47 remaining business controllers.
- **#9** — Harden `/auth/impersonate` endpoint.
- **#10** — Replace `uniqid()` with `crypto.randomBytes()` for reset tokens.
- **#11** — Timing-safe internal secret comparison.
- **#12** — Move `InternalSecretGuard` to class level on remaining controllers.
- **#13** — Fail closed on Bull Board when credentials missing.
- **#14** — Add JWT `jti` + revocation mechanism.
