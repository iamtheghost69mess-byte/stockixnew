# STOCKIX PLATFORM — COMPREHENSIVE REPAIR PLAN

**Created:** 2026-06-20  
**Based on:** `FullAppChecker.md` — 22-phase full platform audit  
**Current platform score:** 54/100  
**Target score after all repairs:** 88/100  
**Status:** PLAN ONLY — no code has been changed  

---

## HOW TO USE THIS DOCUMENT

This plan converts every finding from the audit into an executable repair specification. Each repair contains:

- **Root cause** — the exact file and line where the problem originates
- **Impact** — what fails if this is not fixed
- **Files to change** — every file that must be modified or created
- **Step-by-step approach** — ordered implementation steps
- **Acceptance criteria** — how to verify the fix is complete
- **Effort estimate** — realistic engineering time
- **Dependencies** — which other repairs must be completed first

Repairs are sequenced so that P0s are independent of each other unless noted, and each tier builds on the previous. Do not start P1 until all P0s are complete and verified.

---

## REPAIR TIERS AT A GLANCE

| Tier | Label | Count | Deadline | Score Impact |
|---|---|---|---|---|
| **P0** | Production Blockers | 5 | Before first live tenant | +12 pts |
| **P1** | Security & Data Integrity | 6 | Within 30 days of launch | +10 pts |
| **P2** | Platform Quality | 9 | Within 90 days | +8 pts |
| **P3** | Technical Debt | 6 | Backlog / ongoing | +4 pts |

---

## DEPENDENCY GRAPH

```
P0-A ──────────────────────────────────────────────────── independent
P0-B ──────────────────────────────────────────────────── independent
P0-C ──────────────────────────────────────────────────── independent
P0-D (PMS RLS) ─────────────────────────────────────────── independent
P0-E (orphaned MySQL) ──────────────────────────────────── independent

P1-A (PMS-Finance sync) ──── requires P0-D verified ───────────────────
P1-B (branch/location map) ── requires P1-A ──────────────────────────
P1-C (Chatwoot cleanup) ─────────────────────────────────── independent
P1-D (custom role guard) ────────────────────────────────── independent
P1-E (error tracking) ───────────────────────────────────── independent
P1-F (Finance sync non-fatal) ──────────────────────────── independent

P2-A (email retry) ─────────────────────────── independent ────────────
P2-B (module lifecycle emails) ───── requires P2-A ────────────────────
P2-C (trial period) ─────── requires P0-C (payment) ──────────────────
P2-D (API key scoping) ───────────────────────── independent ──────────
P2-E (dead-letter alerting) ─── requires P1-E ────────────────────────
P2-F (capacity monitoring) ─────── requires P1-E ─────────────────────
P2-G (email security alerts) ── requires P2-B ────────────────────────
P2-H (webhook hardening) ─────────────────────── independent ──────────
P2-I (PMS PII encryption) ─── requires P0-D ──────────────────────────

P3-A (Redis SCAN fix) ─────────────────────────── independent ─────────
P3-B (email idempotency retry) ─── requires P2-A ─────────────────────
P3-C (port-per-tenant redesign) ──────────── long-running ─────────────
P3-D (cross-module SSO) ──────────────────── long-running ─────────────
P3-E (per-tenant encryption keys) ─── independent ─────────────────────
P3-F (ProxySQL secrets vault) ──────── independent ────────────────────
```

---

## P0 — PRODUCTION BLOCKERS

*These must be resolved before any real tenant data enters the system. Each one represents either permanent data loss, data corruption, or zero revenue capability.*

---

### P0-A — One-Time Finance Admin Password Lost on API Restart

**Audit reference:** FullAppChecker.md Phase 3, Phase 21, Finding 1  
**Severity:** CRITICAL — DATA LOSS (irreversible once cache evicts)

#### Root Cause

`apps/api/src/routes/tenants-shared.ts:1533–1536`

The Finance bootstrap admin password is placed into a `provisionPasswordCache` in-memory `Map` with a 15-minute TTL. This Map lives in the Node.js process heap. If the API server restarts or crashes for any reason in that 15-minute window, the password is gone forever. The operator cannot log into Finance, and the tenant is dead until a manual MySQL password reset is performed directly on the server.

The provision events table (`tenant_provision_events`) already stores POS PIN credentials using a `cipher` field with encrypted-at-rest values and a `secret_consumed` flag. The exact same pattern is implemented but never connected to the Finance OTP path.

#### Impact if Not Fixed

Any API restart during or after provisioning causes permanent Finance login failure for that tenant. In production, API restarts happen constantly — deployments, OOM kills, pod restarts. The password cannot be recovered without direct MySQL root access.

#### Files to Change

| File | Action |
|---|---|
| `apps/api/src/routes/tenants-shared.ts` | Modify `GET /tenants/provision-status/:correlationId` to attempt DB decryption before returning null |
| `infra/worker-service/src/provision-runtime.ts` | After Finance bootstrap, write encrypted OTP into `tenant_provision_events` with `cipher` field and `secret_consumed=false` |
| `apps/api/src/services/provision-secrets.ts` | Create (or extend) service: `storeProvisionSecret(db, correlationId, key, plaintext)` and `consumeProvisionSecret(db, correlationId, key)` |
| `packages/db/drizzle/0068_provision_secret_consumed.sql` | Add `secret_consumed boolean` and `cipher text` columns to `tenant_provision_events` if not already present |

#### Step-by-Step Implementation Plan

1. **Audit the existing POS PIN cipher path** in `provision-runtime.ts` to understand the exact schema: what columns are used, how `encryptDeploymentSecret()` is called, and how `consumeProvisionSecret()` marks the record consumed.

2. **Create a `storeProvisionSecret(db, correlationId, key, plaintext)` helper** that:
   - Calls `encryptDeploymentSecret(plaintext)` to produce `enc:v1:{base64}`
   - Inserts a `tenant_provision_events` row with `phase = "secret:{key}"`, `level = "secret"`, `cipher = encrypted`, `secret_consumed = false`

3. **In `provision-runtime.ts`**, immediately after the Finance bootstrap password is generated (and the in-memory cache is populated), call `storeProvisionSecret(db, correlationId, "finance_admin_password", bootstrapPassword)`.

4. **In `tenants-shared.ts` provision-status handler**, when `provisionPasswordCache.get(correlationId)` returns null or undefined:
   - Query `tenant_provision_events` for `phase = "secret:finance_admin_password"` and `secret_consumed = false`
   - If found: call `decryptDeploymentSecret(row.cipher)` to recover plaintext
   - Return the plaintext to caller
   - On first successful read: set `secret_consumed = true` on the row (one-time delivery)
   - If not found: return `{ oneTimePassword: null, reason: "secret_already_consumed_or_expired" }`

5. **Keep the in-memory cache as a fast path** — it should still be checked first. The DB cipher is the fallback when the cache misses.

6. **Write integration test** (`apps/api/tests/provision-otp-recovery.test.ts`):
   - Simulate provision completion
   - Simulate API restart (clear the in-memory Map)
   - Call the status endpoint
   - Assert the OTP is still returned
   - Call a second time
   - Assert `secret_already_consumed_or_expired` is returned

#### Acceptance Criteria

- [ ] Finance OTP is returned by the status endpoint after a simulated API restart
- [ ] OTP is returned at most once (consumed flag set after first read)
- [ ] Test covers: cache hit path, cache miss + DB hit path, already consumed path
- [ ] Encrypted value in `tenant_provision_events` is never plaintext (verified by direct DB query in test)

#### Effort Estimate

**3–4 hours.** The cipher infrastructure already exists. This is plumbing work, not new invention.

---

### P0-B — POS Double-Posting: Both Accounting Engines Write Simultaneously

**Audit reference:** FullAppChecker.md Phase 9, Finding 2  
**Severity:** CRITICAL — DATA INTEGRITY (financial records corrupted)

#### Root Cause

`services/posnew/apps/pos-backend/routes/accountingRoute.js` (full file)  
`services/posnew/apps/pos-backend/workers/bigcapitalSyncWorker.js`

POS has a complete double-entry accounting engine (Chart of Accounts, GL, Trial Balance, P&L, Balance Sheet, recurring journals). When the `accounting` module (Finance/Bigcapital) is also active, the `bigcapitalSyncWorker` pushes POS sales to Finance — which ALSO creates GL entries. The same economic event (a POS sale) therefore appears in:

- POS trial balance (written by POS GL engine)
- Finance trial balance (written when sync pushes the SaleReceipt to Bigcapital)

The POS GL engine is **never disabled** when Finance is present. There is no feature flag, no environment variable, no conditional in the accounting routes.

#### Impact if Not Fixed

Financial reports from Finance and POS will show different totals for the same period, making both unreliable. Accountants will see double the actual revenue in aggregate reports. Auditors will flag the discrepancy. This is a fundamental accounting integrity failure.

#### Files to Change

| File | Action |
|---|---|
| `services/posnew/apps/pos-backend/routes/accountingRoute.js` | Add relay mode guard: check `tenantModules.includes("accounting")` before writing any GL entries |
| `services/posnew/apps/pos-backend/controllers/accountingController.js` | Add Finance proxy: when relay mode, return Finance-sourced data instead of POS GL data |
| `services/posnew/apps/pos-backend/middleware/tenantContext.js` | Expose `tenantModules` on request context (loaded from POS org record or platform API) |
| `services/posnew/apps/pos-backend/workers/bigcapitalSyncWorker.js` | No change needed — sync remains active |
| `infra/worker-service/domain/provisioning/adapters/wire-pos-bigcapital-integration.ts` | On wiring: also SET `relay_mode=true` on POS org record via platform API |
| `services/posnew/apps/pos-backend/models/Organization.js` | Add `accountingRelayMode: Boolean` field to POS org model |
| `apps/api/src/routes/tenant-modules.ts` | When adding/removing `accounting` module, also update POS org `accountingRelayMode` via POS platform API |

#### Step-by-Step Implementation Plan

1. **Define the relay mode toggle.** Add `accountingRelayMode: Boolean` (default `false`) to the POS MongoDB Organization model. When `true`: POS GL writes are suppressed; all accounting reads are proxied from Finance via Bigcapital API.

2. **Create a POS platform API endpoint** `PUT /api/platform/v1/organizations/:orgId/accounting-mode` that accepts `{ relayMode: boolean }` and updates the org record. This endpoint is called by the control plane, not by POS users.

3. **Add tenant context middleware** that loads the org's `accountingRelayMode` flag on each request and attaches it to `req.tenantContext.accountingRelayMode`.

4. **Guard all GL write operations in `accountingRoute.js`**: Before any POST/PUT/DELETE that writes to the POS GL (journals, entries, etc.), check `req.tenantContext.accountingRelayMode`. If true, return `403 { error: "accounting_relay_mode", message: "GL writes are managed by Finance when accounting module is active" }`.

5. **Guard all GL read operations**: When relay mode is active, the GET endpoints for Trial Balance, P&L, Balance Sheet, Cash Flow must proxy to Finance Bigcapital API and return Finance data, not POS data. This can be implemented as a transparent reverse proxy or as a fetch-and-reformat.

6. **Wire relay mode during provisioning**: In `wire-pos-bigcapital-integration.ts`, after the integration is wired, call the new platform API endpoint to set `accountingRelayMode=true`.

7. **Wire relay mode during `add_module` / `remove_module`**:
   - `add_module("accounting")` → set `relayMode=true` on POS org
   - `remove_module("accounting")` → set `relayMode=false` on POS org (POS GL becomes authoritative again)

8. **Data reconciliation script** (one-time): Query POS GL and Finance GL for the same time period. Identify and document any duplicated entries for existing tenants. Provide a SQL + MongoDB cleanup script that an operator can run per tenant.

9. **Write integration test**: Create a POS sale → verify POS GL has an entry → verify Finance GL has the same entry → verify they are NOT both counted as separate in consolidated reporting.

#### Acceptance Criteria

- [ ] `accountingRelayMode=true` is set automatically when Finance wiring completes
- [ ] POST to POS accounting routes returns 403 when relay mode is active
- [ ] POS Trial Balance GET returns Finance-sourced data when relay mode is active
- [ ] `remove_module("accounting")` resets relay mode to false
- [ ] Data reconciliation script produced and documented
- [ ] Test coverage: relay mode on → GL write blocked; relay mode off → GL write succeeds

#### Effort Estimate

**3–5 days.** Largest scope in P0. The POS platform API and relay-mode middleware are new work.

---

### P0-C — No Payment Processing

**Audit reference:** FullAppChecker.md Phase 5, Finding 3  
**Severity:** CRITICAL — BUSINESS CAPABILITY (no revenue collection)

#### Root Cause

No payment gateway code exists anywhere in the control-plane or any platform service. `plans.priceMonthly` and `plans.priceAnnually` columns exist in the schema but are display-only. All licensing is 100% manual — operators must create, assign, and renew licenses by hand.

#### Impact if Not Fixed

The business cannot scale. Every new customer requires a human operator to manually generate a license key, assign it to a tenant, set expiry dates, and manually renew it. There is no online checkout, no renewal flow, no dunning, no failed payment handling.

#### Files to Change / Create

| File | Action |
|---|---|
| `apps/api/src/services/stripe/stripe-client.ts` | Create Stripe SDK wrapper |
| `apps/api/src/services/stripe/stripe-billing.ts` | Create subscription lifecycle service |
| `apps/api/src/routes/billing.ts` | Create billing routes: checkout, portal, subscription status |
| `apps/api/src/routes/webhooks.ts` | Add Stripe webhook handler (extend existing webhooks file) |
| `packages/db/drizzle/0068_stripe_fields.sql` | Add `stripe_customer_id`, `stripe_subscription_id`, `stripe_payment_method_id` to `tenants` table |
| `apps/api/src/tenant-license-lifecycle.ts` | Add `activateLicenseFromStripe()` and `suspendLicenseFromStripe()` |
| `apps/api/src/mail/send.ts` | Add `sendPaymentSuccessEmail()`, `sendPaymentFailedEmail()`, `sendSubscriptionCancelledEmail()` |
| `apps/api/src/mail/templates/payment-success.ts` | New email template |
| `apps/api/src/mail/templates/payment-failed.ts` | New email template |
| `apps/api/src/mail/templates/subscription-cancelled.ts` | New email template |
| `.env.example` | Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` |

#### Step-by-Step Implementation Plan

**Phase 1 — Stripe Setup (Infrastructure)**

1. Add `stripe` npm package to `apps/api`.
2. Create `stripe-client.ts` that initializes `Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })` and exports the singleton.
3. Add `stripe_customer_id text`, `stripe_subscription_id text` to the `tenants` table via a new migration.
4. Create `plans` sync: each `plans` record should map to a Stripe Product + Price. Write a migration/seed script that creates Stripe Products for each active plan and stores the Stripe Price ID in a new `stripe_price_id` column on `plans`.

**Phase 2 — Checkout Flow**

5. Create `POST /billing/checkout-session` endpoint (authenticated owner route):
   - Accepts `{ tenantId, planSlug, billingInterval: "monthly" | "annually" }`
   - Creates or retrieves Stripe Customer for the tenant (using tenant admin email)
   - Creates Stripe Checkout Session with the appropriate Price ID
   - Returns `{ checkoutUrl }` — redirect the operator/customer to Stripe-hosted checkout
   - Idempotency: use Stripe's built-in idempotency key header

6. Create `GET /billing/portal-session` endpoint:
   - Returns a Stripe Customer Portal URL for the tenant to manage their own subscription
   - Requires tenant `stripe_customer_id` to be set

**Phase 3 — Webhook Handler**

7. In `apps/api/src/routes/webhooks.ts`, add a Stripe webhook route (`POST /webhooks/stripe`):
   - Verify signature using `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
   - Handle these events:
     - `checkout.session.completed` → activate license (call `activateLicenseFromStripe(tenantId, subscriptionId)`)
     - `invoice.payment_succeeded` → extend license `expiresAt` by billing period
     - `invoice.payment_failed` → send `sendPaymentFailedEmail()`, start dunning sequence
     - `customer.subscription.deleted` → suspend license (`applyTenantLicenseSuspend()`)
     - `customer.subscription.updated` → sync plan changes to license
   - All events logged to `admin_audit_log`
   - All events are idempotent (use `stripe_event_id` as idempotency key)

**Phase 4 — License Bridge**

8. Create `activateLicenseFromStripe(db, tenantId, stripeSubscriptionId, planSlug)`:
   - Calls existing `generateLicenseKey()` for new tenants
   - Sets `licenses.status = "active"`, `validFrom = now()`, `expiresAt` based on billing period
   - Stores `stripe_subscription_id` on the tenant row
   - Calls `syncFinanceLicenseForStockixTenant()` to push to Finance

9. Create `suspendLicenseFromStripe(db, tenantId)`:
   - Calls existing `applyTenantLicenseSuspend()`
   - Sends `sendSubscriptionCancelledEmail()`

**Phase 5 — Dunning**

10. On `invoice.payment_failed`:
    - Send `sendPaymentFailedEmail()` immediately
    - Insert a `tenant_lifecycle_jobs` record with type `"dunning_retry"` and `runAt = now() + 3 days`
    - Worker processes `dunning_retry` by checking subscription status; if still failed, send escalating email
    - After 3 failed dunning attempts (configured): call `applyTenantLicenseSuspend()`

**Phase 6 — Dashboard UI**

11. Add "Billing" section to the owner dashboard:
    - Shows current plan, subscription status, next renewal date
    - "Manage Billing" button → generates Stripe Customer Portal URL
    - For super_admin: "Create Checkout" button to assign a paid subscription to a tenant

#### Acceptance Criteria

- [ ] A new tenant can be provisioned and immediately receive a Stripe checkout link
- [ ] Completing checkout activates the license and sends `license-activated` email
- [ ] `invoice.payment_succeeded` extends the license expiry correctly
- [ ] `customer.subscription.deleted` suspends the tenant and sends cancellation email
- [ ] Failed payments trigger dunning emails on correct schedule
- [ ] All Stripe webhook events are idempotent (replaying same event twice is safe)
- [ ] Webhook signature verification rejects unsigned requests

#### Effort Estimate

**1–2 weeks.** Stripe integration is well-documented. The license bridge is the most custom work.

---

### P0-D — PMS Row-Level Security Not Verified Active

**Audit reference:** FullAppChecker.md Phase 2, Phase 21, Finding 4  
**Severity:** CRITICAL — DATA ISOLATION (cross-tenant guest PII exposure)

#### Root Cause

`packages/db/drizzle/0060_pms_rls.sql` creates the `stockix_pms_app` PostgreSQL role and enables RLS policies on all 18 `pms_*` tables. However, RLS policies are silently bypassed for any connection that uses a PostgreSQL superuser or a role with `BYPASSRLS`. The connection role used by the application at runtime is determined by `DATABASE_URL` in the environment — this was never verified during the audit.

If the application connects as `postgres` (default superuser), all 18 RLS policies on PMS tables are completely ignored. Any PMS query will return all tenants' data.

Additionally, `pms_guests` contains passport numbers, visa numbers, date of birth, and national ID numbers — some of the most sensitive PII in any hotel/hospitality system.

#### Files to Change

| File | Action |
|---|---|
| `.env.example` | Add `PMS_DATABASE_URL` as a separate, required variable using `stockix_pms_app` role |
| `apps/api/src/db/create-pms-db.ts` | Create separate Drizzle connection factory using `PMS_DATABASE_URL` |
| `apps/api/src/routes/` — all PMS routes | Switch to using PMS-specific DB client |
| `apps/api/src/index.ts` or startup | Add startup assertion: verify current DB role is NOT superuser for PMS connection |
| `packages/db/drizzle/0068_pms_rls_grant.sql` | Add GRANT SELECT, INSERT, UPDATE, DELETE on all pms_* tables TO stockix_pms_app |
| `scripts/verify-pms-rls.sh` | Create a verification script that connects as `stockix_pms_app` and confirms RLS is active |

#### Step-by-Step Implementation Plan

1. **Verify current state** before writing any code:
   - Run: `psql $DATABASE_URL -c "SELECT current_user, pg_has_role(current_user, 'stockix_pms_app', 'member')"`
   - Run: `psql $DATABASE_URL -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'pms_%'"`
   - Document the current connection role and whether RLS is actually `ON` for each table.

2. **If the app uses a superuser role**: create a separate `PMS_DATABASE_URL` environment variable that connects as `stockix_pms_app`. Write migration `0068_pms_rls_grant.sql`:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stockix_pms_app;
   GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO stockix_pms_app;
   ```

3. **Create a PMS-specific Drizzle connection** in `apps/api/src/db/pms-db.ts` that uses `PMS_DATABASE_URL`. This client must NOT be used for control-plane tables (tenants, owners, licenses, etc.).

4. **Add a startup assertion** in the API bootstrap (`apps/api/src/index.ts`):
   ```
   On startup: connect with PMS_DATABASE_URL, run:
     SELECT has_table_privilege('pms_properties', 'SELECT') as can_select
   Connect with main DATABASE_URL, run same check.
   If main DB URL can select pms_properties without setting app.current_tenant_id → log SECURITY WARNING.
   ```

5. **Create a verification script** `scripts/verify-pms-rls.sh` that:
   - Connects as `stockix_pms_app` with no `app.current_tenant_id` set
   - Runs `SELECT COUNT(*) FROM pms_properties`
   - Asserts result is 0 (RLS blocks without tenant context)
   - Sets `app.current_tenant_id = 'some-uuid'`
   - Asserts only that tenant's properties are returned

6. **Update all PMS route handlers** to:
   - Use the PMS DB client
   - Set `app.current_tenant_id` session variable before any query: `SET LOCAL app.current_tenant_id = $tenantId`
   - Clear it after: `RESET app.current_tenant_id` (or rely on connection pooler resetting per-transaction)

7. **Update the PMS Docker Compose stack** to use `PMS_DATABASE_URL` env var.

#### Acceptance Criteria

- [ ] `scripts/verify-pms-rls.sh` exits 0 (RLS blocks cross-tenant access)
- [ ] Startup assertion logs OK (not WARNING) for PMS DB role
- [ ] Integration test: tenant A creates a property; tenant B's PMS DB connection cannot see it
- [ ] All 18 `pms_*` tables show `rowsecurity = true` in pg_tables
- [ ] No PMS query uses the main `DATABASE_URL` Drizzle client

#### Effort Estimate

**1–2 days.** If the app already uses a non-superuser role, this is primarily verification + testing. If it uses superuser, it's 1 day of migration and connection refactoring.

---

### P0-E — Orphaned Finance MySQL Databases on Provision Failure

**Audit reference:** FullAppChecker.md Phase 4, Phase 17, Finding 5  
**Severity:** HIGH — DATA HYGIENE / SECURITY (MySQL databases with no owner accumulate)

#### Root Cause

`infra/worker-service/src/provision-runtime.ts` — provisioning sequence

The provisioning sequence creates the Finance MySQL tenant (step 21 of 52) before writing the control-plane `tenants` row. If the worker crashes anywhere between MySQL tenant creation and the Postgres `INSERT tenants`, a MySQL database exists with no corresponding control-plane record. No cleanup path exists for this orphan. Over time, these orphans consume MySQL storage and represent security exposure (databases no one knows exist).

#### Files to Change

| File | Action |
|---|---|
| `infra/worker-service/src/provision-runtime.ts` | Add preflight MySQL orphan detection step before Finance compose up |
| `infra/worker-service/domain/provisioning/adapters/check-mysql-orphan.ts` | Create — checks if MySQL DB for slug exists without a control-plane tenant record |
| `scripts/cleanup-mysql-orphans.ts` | Create — operator-run script to list and delete orphaned MySQL databases |
| `apps/api/src/provisioning/provision-failure.ts` | Add Finance MySQL cleanup to the terminal failure handler |

#### Step-by-Step Implementation Plan

1. **Create `checkMysqlOrphan(slug)`** in a new adapter file:
   - Connect to shared MySQL host as root
   - Run `SHOW DATABASES LIKE 'slugToMysqlSafe(slug)'`
   - If database exists: query control-plane Postgres for a tenant with that slug
   - If no Postgres record found: return `{ isOrphan: true, mysqlDatabase: dbName }`

2. **Add orphan detection as step 10.5 in provision-runtime.ts** (after advisory lock, before Docker):
   - Call `checkMysqlOrphan(slug)`
   - If orphan found:
     - If the provision job was triggered with `needsScrub=true`: drop the MySQL database and proceed
     - If `needsScrub=false`: log a WARNING and proceed with caution (the slug was supposed to be clean)
   - Write a provision trace event recording the orphan state

3. **Add MySQL cleanup to the terminal failure handler** in `provision-failure.ts`:
   - When `markTenantProvisionFailed()` is called for a `tenant.provision` job: attempt to drop the MySQL database for this tenant's slug
   - Use `IF EXISTS` to make this idempotent
   - Failure to drop MySQL is logged as a WARNING but does not prevent the control-plane from marking the job failed

4. **Create `scripts/cleanup-mysql-orphans.ts`**:
   - Connects to shared MySQL and lists all databases
   - For each database that matches the naming pattern (`stockix_*`), queries control-plane Postgres for a tenant with that slug
   - Prints a table: `| database | control-plane tenant | orphan? |`
   - With `--dry-run=false` flag: drops orphaned databases after user confirmation prompt

5. **Run the cleanup script** against any non-production environments to see current orphan count.

#### Acceptance Criteria

- [ ] Provision failure test: simulate crash after MySQL tenant created → verify cleanup script identifies this as orphan
- [ ] Preflight check catches orphan and logs it before any provisioning continues
- [ ] Terminal failure handler drops the MySQL DB when provision fails
- [ ] Cleanup script runs safely with `--dry-run` (default) showing orphans without deleting

#### Effort Estimate

**4–6 hours.** Straightforward detection + cleanup logic.

---

## P1 — SECURITY & DATA INTEGRITY

*These must be fixed within 30 days of first live tenant. They represent data integrity failures, security vulnerabilities, and missing critical infrastructure.*

---

### P1-A — PMS-Finance Sync Worker Missing

**Audit reference:** FullAppChecker.md Phase 10, Finding 6  
**Severity:** HIGH — FINANCIAL DATA LOSS

#### Root Cause

`packages/db/src/schema.ts:799–804` — `pms_bookings.accountingSyncStatus` and `pms_bookings.financeReceiptId` exist with the clear intent that PMS bookings should sync to Finance. However, no background job exists that reads bookings with `accountingSyncStatus="pending"` and pushes them to Finance.

**Prerequisite:** P0-D must be complete (PMS RLS must be verified) before building this sync, since the sync worker needs reliable tenant-isolated DB access.

#### Files to Change / Create

| File | Action |
|---|---|
| `apps/api/src/jobs/pms-finance-sync.ts` | Create — the sync job processor |
| `apps/api/src/services/tenant-jobs.ts` | Add `enqueuePmsFinanceSync(db, tenantId)` |
| `infra/worker-service/src/worker.ts` | Register `pms_finance_sync` job type handler |
| `infra/worker-service/src/cron/pms-finance-sync-cron.ts` | Create — cron trigger for periodic sync |
| `packages/db/drizzle/0069_pms_sync_job_type.sql` | Add `pms_finance_sync` as allowed job type (if enum-constrained) |
| `apps/api/src/mail/send.ts` | Add `sendPmsFinanceSyncFailureAlert()` for operators |

#### Step-by-Step Implementation Plan

1. **Define the Finance API call** for creating a SaleReceipt. Finance (Bigcapital) has a `POST /api/sale-receipts` endpoint. Understand the payload structure: `{ customerId, date, warehouseId, branchId, entries: [{ itemId, quantity, rate }] }`.

2. **Create `pms-finance-sync.ts`** job processor:
   - Accepts `{ tenantId }` payload
   - Fetches `pms_bookings` WHERE `accountingSyncStatus = "pending"` AND `tenantId = $tenantId` AND `checkoutAt IS NOT NULL` (only checked-out bookings)
   - For each pending booking:
     - Build a Finance SaleReceipt payload:
       - Customer: use Finance walk-in customer ID (stored in `tenant_deployments.financeWalkInCustomerId`)
       - Date: booking checkout date
       - Branch: Finance default branch ID (stored in `tenant_deployments.financeDefaultBranchId` — add this column if missing)
       - Line items: room rate × nights, plus any extras
     - POST to Finance Bigcapital API
     - On success: UPDATE `pms_bookings SET accountingSyncStatus='synced', financeReceiptId=$id WHERE id=$bookingId`
     - On Finance API failure: UPDATE `accountingSyncStatus='failed', syncError=$errorMessage, syncAttempts=syncAttempts+1`
   - After processing: insert a `pms_sync_logs` entry summarizing what was synced

3. **Handle `pms_payments` table** similarly:
   - For each payment WHERE `financePaymentId IS NULL` AND booking `accountingSyncStatus='synced'`
   - POST Finance payment record referencing the `financeReceiptId`
   - UPDATE `financePaymentId`

4. **Retry logic**: bookings with `accountingSyncStatus='failed'` and `syncAttempts < 3` should be retried on the next cron run. After 3 failures: set `accountingSyncStatus='error'` and send operator alert.

5. **Create cron job** `pms-finance-sync-cron.ts` that runs every 15 minutes:
   - Queries all active tenants that have BOTH `pms` and `accounting` modules
   - For each: `enqueuePmsFinanceSync(db, tenantId)` — only if no `pms_finance_sync` job is already pending for this tenant

6. **Add backfill tracking columns** to `pms_bookings` via migration:
   - `sync_attempts integer not null default 0`
   - `sync_error text`
   - `synced_at timestamp`

#### Acceptance Criteria

- [ ] A checkout-complete PMS booking within 15 minutes has `accountingSyncStatus='synced'` and `financeReceiptId` set
- [ ] The Finance P&L report shows revenue matching PMS booking totals
- [ ] After 3 failed sync attempts, booking moves to `error` status and operator receives email alert
- [ ] Cron does not enqueue duplicate jobs for the same tenant
- [ ] Integration test: create booking → checkout → wait for sync → verify Finance SaleReceipt exists

#### Effort Estimate

**2–3 days.** Finance API call structure needs to be reverse-engineered from Bigcapital source, but the queue/cron infrastructure is already in place.

---

### P1-B — Finance Branch to POS Location Mapping Missing

**Audit reference:** FullAppChecker.md Phase 12, Finding 7  
**Severity:** HIGH — OPERATIONAL (multi-location reporting impossible)

**Prerequisite:** P1-A (PMS-Finance sync) — because the sync worker uses Finance branch IDs, the branch ID storage must be in place first.

#### Files to Change / Create

| File | Action |
|---|---|
| `packages/db/drizzle/0070_branch_location_mappings.sql` | New migration — create `branch_location_mappings` table |
| `packages/db/src/schema.ts` | Add `branchLocationMappings` Drizzle table definition |
| `infra/worker-service/domain/provisioning/adapters/seed-branch-location-mapping.ts` | Create — queries Finance for default branch ID, POS for default location ID, inserts mapping |
| `infra/worker-service/src/provision-runtime.ts` | Call `seedBranchLocationMapping()` after Finance + POS are both wired |
| `apps/api/src/routes/tenants-shared.ts` | Add `GET /tenants/:id/branch-location-mappings` route |
| `apps/dashboard/` | Add branch/location mapping UI to organization detail panel |

#### Step-by-Step Implementation Plan

1. **Create the DB migration**:
   ```sql
   CREATE TABLE branch_location_mappings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     finance_branch_id INTEGER NOT NULL,
     pos_location_id TEXT NOT NULL,
     finance_branch_name TEXT,
     pos_location_name TEXT,
     is_primary BOOLEAN NOT NULL DEFAULT false,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE(organization_id, finance_branch_id),
     UNIQUE(organization_id, pos_location_id)
   );
   ```

2. **Create `seedBranchLocationMapping()`** adapter:
   - After Bigcapital wiring, call Finance API `GET /api/branches` to get the default branch ID and name
   - Call POS platform API `GET /api/platform/v1/organizations/:orgId/locations` to get the default location ID and name
   - INSERT into `branch_location_mappings` with `is_primary=true`
   - Store `finance_branch_id` in `tenant_deployments` (new column via migration)

3. **Call this adapter** in `provision-runtime.ts` immediately after `wirePosBigcapitalIntegration()` completes.

4. **Also call it in `add_module` worker** when `accounting` is added to a tenant that already has `pos` (or vice versa).

5. **Add API routes** for operators to view and manage mappings:
   - `GET /tenants/:id/organizations/:orgId/branch-location-mappings` — list all mappings
   - `POST /tenants/:id/organizations/:orgId/branch-location-mappings` — create custom mapping
   - `DELETE /tenants/:id/organizations/:orgId/branch-location-mappings/:mappingId` — remove mapping

6. **Dashboard UI**: Show the branch-location mapping on the organization detail page, with the ability to add custom mappings for multi-branch/multi-location tenants.

#### Acceptance Criteria

- [ ] After provisioning a tenant with both `accounting` and `pos`, a `branch_location_mappings` row exists with `is_primary=true`
- [ ] `GET /tenants/:id/organizations/:orgId/branch-location-mappings` returns the mapping
- [ ] P1-A sync worker uses `finance_branch_id` from this table
- [ ] Mapping table is populated for both: Finance-first provisioning and POS-first provisioning

#### Effort Estimate

**1 day.** Migration + adapter + wiring is straightforward.

---

### P1-C — Chatwoot Account Not Cleaned Up on Remove or Delete

**Audit reference:** FullAppChecker.md Phase 13, Phase 17, Finding 8  
**Severity:** MEDIUM-HIGH — RESOURCE LEAK + UNAUTHORIZED ACCESS

#### Root Cause

`apps/api/src/routes/tenant-modules.ts` — `remove-module` handler  
`infra/worker-service/src/worker.ts` — deprovision job handler

When `chat` module is removed, no Chatwoot API call is made. When a tenant is fully deprovisioned, the Chatwoot account is also not deleted. This means:
1. Tenant admin retains live Chatwoot access after paying for a downgraded plan
2. Orphaned Chatwoot accounts accumulate, consuming Chatwoot resources

#### Files to Change

| File | Action |
|---|---|
| `infra/worker-service/src/chatwoot-provision.ts` | Add `deprovisionChatwootAccount(accountId)` function |
| `infra/worker-service/src/worker.ts` | Call `deprovisionChatwootAccount` in `remove_module("chat")` worker handler |
| `infra/worker-service/src/deprovision-runtime.ts` | Call `deprovisionChatwootAccount` in full tenant deprovision |
| `apps/api/src/routes/tenant-modules.ts` | After `remove-module` job completes, null out `tenants.chatwootAccountId` |

#### Step-by-Step Implementation Plan

1. **Create `deprovisionChatwootAccount(accountId, chatwootBaseUrl, chatwootApiKey)`**:
   - Call `DELETE {chatwootBaseUrl}/platform/api/v1/accounts/{accountId}` with `api_access_token` header
   - If 404: account already gone — treat as success
   - If 500 or network error: log WARNING but do not fail the overall job (Chatwoot is optional external service)
   - Return `{ success: boolean, error?: string }`

2. **In `remove_module` worker** for `chat` module:
   - After module stop (which was previously a no-op for chat): call `deprovisionChatwootAccount(tenant.chatwootAccountId)`
   - UPDATE `tenants SET chatwootAccountId = NULL WHERE id = $tenantId`

3. **In `deprovision-runtime.ts`** full tenant deprovision:
   - Add a step: if `tenant.chatwootAccountId IS NOT NULL`: call `deprovisionChatwootAccount()`
   - Proceed with deprovision regardless of outcome (non-blocking)

4. **Write a cleanup script** `scripts/cleanup-chatwoot-orphans.ts`:
   - Queries all Chatwoot accounts via `GET /platform/api/v1/accounts`
   - Cross-references with `tenants.chatwootAccountId` in control plane
   - Prints table of orphaned Chatwoot accounts (accounts with no matching tenant)
   - With `--delete` flag: calls `DELETE` on each orphan after confirmation

#### Acceptance Criteria

- [ ] `remove_module("chat")` results in Chatwoot account deletion + `chatwootAccountId=null`
- [ ] Full tenant deprovision results in Chatwoot account deletion
- [ ] 404 from Chatwoot on delete is handled gracefully (idempotent)
- [ ] Cleanup script identifies pre-existing orphans

#### Effort Estimate

**3–4 hours.**

---

### P1-D — Custom Role Can Be Granted `*` (Full Admin) Permission

**Audit reference:** FullAppChecker.md Phase 16, Finding 11  
**Severity:** HIGH — SECURITY (privilege escalation)

#### Root Cause

`packages/shared/src/permissions.ts:21` — `"*"` is included in the exported `PERMISSIONS` array, making it selectable when creating custom roles. The `platform_roles` table has no constraint preventing a `billing_manager` from creating a custom role with `permissions: ["*"]` and assigning it to themselves, achieving super_admin level access.

#### Files to Change

| File | Action |
|---|---|
| `packages/shared/src/permissions.ts` | Remove `"*"` from the exported PERMISSIONS array (or move to a separate SUPER_PERMISSIONS constant) |
| `apps/api/src/routes/owners.ts` | Add validation: if permissions array contains `"*"`, require actor role to be `super_admin` |
| `apps/api/src/routes/owners.ts` | Add validation: actor cannot assign more permissions than they themselves have |
| `packages/db/drizzle/0071_platform_roles_constraint.sql` | Add check constraint: if permissions contains `"*"`, only super_admin can set it |
| `apps/api/src/middleware/rbac.ts` | Add guard in `createRoleRankRbacMiddleware` |

#### Step-by-Step Implementation Plan

1. **Separate `*` from the user-facing permissions list**. In `permissions.ts`:
   - Keep `"*"` in a `SUPER_PERMISSIONS = ["*"] as const` export
   - The `PERMISSIONS` array that drives the UI should NOT include `"*"`

2. **In the custom role creation/update handler** (`owners.ts` or `routes/platform-roles.ts`):
   - Validate incoming `permissions` array: if it contains `"*"`, verify actor `role === "super_admin"`
   - Validate that no permission in the array exceeds what the actor themselves can do: `every(perm => actorHasPermission(actor, perm))`
   - Return 403 if validation fails

3. **Add a DB-level constraint** via migration (defense-in-depth):
   ```sql
   -- Prevent non-null role assignment with wildcard unless created by known super_admin
   -- This is a belt-and-suspenders check; the API layer is the primary guard
   ```
   (Note: A Postgres check constraint on JSONB is complex — document the API-layer guard as primary, DB constraint as optional enhancement)

4. **Write tests** covering:
   - `super_admin` can create a role with `"*"` ✓
   - `billing_manager` creating a role with `"*"` returns 403 ✓
   - `support_agent` creating a role with `licenses.suspend` (which they don't have) returns 403 ✓

#### Acceptance Criteria

- [ ] `POST /platform-roles` with `permissions: ["*"]` from a `billing_manager` returns 403
- [ ] `POST /platform-roles` with `permissions: ["*"]` from a `super_admin` returns 201
- [ ] `POST /platform-roles` with `permissions: ["licenses.suspend"]` from a `support_agent` returns 403
- [ ] No UI selector shows `"*"` as a selectable option

#### Effort Estimate

**2–3 hours.**

---

### P1-E — No Centralized Error Tracking

**Audit reference:** FullAppChecker.md Phase 20, Finding 12  
**Severity:** HIGH — OPERATIONAL (production incidents are invisible)

#### Root Cause

Runtime exceptions in the API, worker, Finance app, and POS app are logged to local console/file but not aggregated. In production, a crash in the Finance Bigcapital app produces a Docker log entry that only appears when an engineer manually runs `docker logs stockix-{slug}_stockix-app`. There is no alerting, no aggregated error view, no stack traces in a searchable system.

#### Files to Change

| File | Action |
|---|---|
| `apps/api/src/index.ts` | Add Sentry `init()` call and unhandled rejection handler |
| `apps/api/package.json` | Add `@sentry/node` dependency |
| `infra/worker-service/src/worker.ts` | Add Sentry `init()` and wrap job processor in `Sentry.startSpan` |
| `infra/worker-service/package.json` | Add `@sentry/node` dependency |
| `.env.example` | Add `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` |
| `infra/tenant-stack/docker-compose.yml` | Pass `SENTRY_DSN` to Finance container (Finance/Bigcapital has Sentry support natively) |
| `infra/pos-tenant-stack/docker-compose.yml` | Pass `SENTRY_DSN` to POS backend container |

#### Step-by-Step Implementation Plan

1. **Set up Sentry project(s)**:
   - Create one Sentry project per service: `stockix-api`, `stockix-worker`, `stockix-finance`, `stockix-pos`
   - Note: can be a single Sentry organization with multiple projects

2. **Instrument `apps/api`**:
   - Add `Sentry.init({ dsn, environment, release, integrations: [Http(), Express()] })`
   - Add `Sentry.setupExpressErrorHandler(app)` (or Hono equivalent: `app.onError((err) => Sentry.captureException(err))`)
   - Add `process.on("unhandledRejection", (err) => Sentry.captureException(err))`
   - Tag all errors with `tenantId` if available in context: `Sentry.setTag("tenant_id", tenantId)`

3. **Instrument `infra/worker-service`**:
   - Same Sentry init
   - Wrap each job processing function in a try/catch that calls `Sentry.captureException(err, { extra: { jobType, tenantId, jobId } })`

4. **Finance and POS**: Both are third-party-based apps that may already have Sentry support. Pass `SENTRY_DSN` env var and check if Finance (Bigcapital) picks it up. For POS, add `Sentry.init()` to `pos-backend/index.js`.

5. **Set up Sentry alerts**:
   - Alert on any new error: notify `#platform-alerts` Slack channel (or email)
   - Alert on error rate spike: >10 errors/minute triggers immediate alert
   - Alert on provision job failures: `tag:job_type:tenant.provision AND level:error`

6. **Add correlation ID to all Sentry events**: The provision `correlationId` should be attached as a Sentry tag so that a failing provision job can be traced from Sentry → provision trace events → tenant.

#### Acceptance Criteria

- [ ] Throwing an unhandled exception in the API appears in Sentry within 30 seconds
- [ ] Worker job failure appears in Sentry with `tenantId` and `jobType` tags
- [ ] Finance app errors appear in Sentry
- [ ] Sentry alerts trigger on error rate spikes
- [ ] `correlationId` is attached to all provision-related Sentry events

#### Effort Estimate

**4–6 hours.** Sentry integration is well-documented. Most work is configuration.

---

### P1-F — Finance License Sync Failure Is Silent

**Audit reference:** FullAppChecker.md Phase 5  
**Severity:** MEDIUM-HIGH — DATA INTEGRITY (Finance may enforce wrong limits)

#### Root Cause

`apps/api/src/tenant-license-lifecycle.ts` — `syncFinanceLicenseForStockixTenant()` is called fire-and-forget. If the Finance app is down, unreachable, or returns an error, the control plane logs the error and continues. Finance will then be out of sync — it may still enforce the old plan's user caps while the control plane shows a new plan.

#### Files to Change

| File | Action |
|---|---|
| `apps/api/src/tenant-license-lifecycle.ts` | Add retry logic: if sync fails, enqueue a `license_sync_retry` job |
| `apps/api/src/services/tenant-jobs.ts` | Add `enqueueLicenseSyncRetry(db, tenantId, payload)` |
| `infra/worker-service/src/worker.ts` | Register `license_sync_retry` job type handler |
| `apps/api/src/mail/send.ts` | Add `sendLicenseSyncFailureAlert()` for operators — send after 3 failed retries |

#### Step-by-Step Implementation Plan

1. **Wrap the Finance sync call** in `tenant-license-lifecycle.ts`:
   - On success: continue as normal
   - On failure: instead of `console.error`, call `enqueueLicenseSyncRetry(db, tenantId, syncPayload)` with `maxAttempts=3` and `runAt = now() + 5 minutes`

2. **Worker processes `license_sync_retry`**:
   - Calls `syncFinanceLicenseForStockixTenant()` again
   - On success: log success, mark job completed
   - On failure: increment attempts; if attempts >= maxAttempts: move to dead-letter and send operator alert email

3. **Dead-letter for sync failures**: ensure `dead_letter_jobs` captures the last payload so operators can manually re-trigger

4. **Add a monitoring endpoint** `GET /internal/health/finance-sync` that returns:
   - Count of pending `license_sync_retry` jobs
   - Count of dead-letter jobs with type `license_sync_retry`
   This allows a health check to detect Finance sync degradation.

#### Acceptance Criteria

- [ ] Simulating Finance unreachable → license sync failure → job enqueued for retry
- [ ] 3 failed retries → dead-letter + operator email alert
- [ ] Health endpoint shows correct pending count
- [ ] Successful retry clears the pending job

#### Effort Estimate

**2–3 hours.**

---

## P2 — PLATFORM QUALITY

*These repairs address missing features, incomplete implementations, and quality gaps. Target completion within 90 days of launch.*

---

### P2-A — No Email Retry on Failure

**Audit reference:** FullAppChecker.md Phase 14, Finding 16  
**Severity:** MEDIUM — RELIABILITY

#### Root Cause

`apps/api/src/mail/send.ts` — all 11 `sendXxxEmail()` functions. If `sendMail()` throws (SMTP timeout, Resend API 500, DNS failure), the error is caught, logged as `console.error`, and the `email_logs` record shows `status="failed"`. No retry is attempted.

#### Implementation Plan

1. **Modify `sendMail()`** to: on failure, call `enqueueTenantJob(db, { type: "email_retry", payload: { templateKey, to, subject, html, idempotencyKey }, maxAttempts: 3, runAt: now() + 2 minutes })`.
2. **Worker processes `email_retry`**: calls the email send function again with the same idempotency key (deduplication prevents double sends).
3. **Exponential backoff**: attempt 1 = 2 min, attempt 2 = 10 min, attempt 3 = 30 min.
4. **After 3 failures**: write to dead-letter, update `email_logs.status = "permanently_failed"`.

**Effort:** 3–4 hours.

---

### P2-B — No Module Lifecycle Emails

**Audit reference:** FullAppChecker.md Phase 14, Finding 9  
**Severity:** MEDIUM — USER EXPERIENCE

**Prerequisite:** P2-A (email retry)

#### Implementation Plan

1. **Create `sendModuleAddedEmail(adminEmail, tenantName, moduleName, moduleUrl)`** template and function.
2. **Create `sendModuleRemovedEmail(adminEmail, tenantName, moduleName, removalDate)`** template and function.
3. **In `add_module` worker**: on job completion, call `sendModuleAddedEmail()`.
4. **In `remove_module` worker**: before stack stop, call `sendModuleRemovedEmail()` with `removalDate = now() + 24h` (giving a 24-hour notice).
5. Optionally: **delay the actual stack stop by 24 hours** after the removal email — stack is stopped at `runAt = now() + 24h` in the remove_module job.

**Effort:** 1 day (templates + wiring).

---

### P2-C — No Trial Period System

**Audit reference:** FullAppChecker.md Phase 5, Finding 10  
**Severity:** MEDIUM — BUSINESS CAPABILITY

**Prerequisite:** P0-C (payment processing must be in place to convert trials to paid)

#### Implementation Plan

1. **Add `trialEndsAt TIMESTAMPTZ` column** to `licenses` table via migration.
2. **Add `"trial"` as a valid license status** value.
3. **Create `startTrial(tenantId, trialDays)`** function:
   - Sets `licenses.status = "trial"`, `trialEndsAt = now() + trialDays days`
   - Syncs to Finance (`syncFinanceLicenseForStockixTenant` with status `"trial"`)
4. **Add trial status to expiry cron**: check `trialEndsAt` — send `trial-ending` email at 7 days and 1 day before `trialEndsAt`. Auto-expire when `trialEndsAt < now()`.
5. **Create email templates**: `trial-started.ts`, `trial-ending.ts`, `trial-expired.ts`.
6. **Stripe integration** (from P0-C): when a trial-status tenant completes Stripe checkout, convert from `trial` → `active`.

**Effort:** 1–2 days.

---

### P2-D — API Keys Have No Permission Scoping

**Audit reference:** FullAppChecker.md Phase 16  
**Severity:** MEDIUM — SECURITY

#### Implementation Plan

1. **Add `permissions JSONB` column** to `api_keys` table via migration (nullable — null means inherit owner permissions).
2. **Modify `createApiKey()`**: accept optional `permissions` array. Validate permissions are a subset of the creating owner's permissions.
3. **Modify API key auth middleware**: when a request is authenticated via API key, override the actor's effective permissions with `key.permissions ?? actor.permissions`.
4. **Update dashboard UI**: show permission selector when creating an API key.

**Effort:** 4–6 hours.

---

### P2-E — Dead-Letter Jobs Have No Automated Alerting

**Audit reference:** FullAppChecker.md Phase 17  
**Severity:** MEDIUM — OPERATIONAL

**Prerequisite:** P1-E (Sentry or error tracking in place)

#### Implementation Plan

1. **Add a dead-letter monitor cron** (runs every 5 minutes):
   - Query `dead_letter_jobs` for records created in the last 5 minutes
   - For each new dead-letter job: `Sentry.captureMessage("Dead letter job: {type}", { extra: job })`
   - Also send an in-app notification to all `super_admin` owners
2. **Add `GET /admin/dead-letter-jobs`** route for dashboard review.
3. **Add `POST /admin/dead-letter-jobs/:id/retry`** to re-enqueue a specific dead-letter job.

**Effort:** 3–4 hours.

---

### P2-F — No Capacity Monitoring

**Audit reference:** FullAppChecker.md Phase 20  
**Severity:** MEDIUM — OPERATIONAL (disk/port exhaustion is silent)

#### Implementation Plan

1. **Port exhaustion monitoring**: Query `tenant_deployments` for highest allocated port. Alert when within 100 ports of the configured max (`TENANT_PORT_RANGE_MAX`).
2. **Disk monitoring**: Add a worker health check job (runs hourly) that calls `df -h {TENANT_ENV_ROOT}` and emits a metric. Alert when > 80% full.
3. **MySQL connection pool**: Query ProxySQL stats endpoint for connection count. Alert when > 80% of max connections.
4. **Expose these metrics** via the existing Prometheus metrics endpoint (`/metrics` on the worker).
5. **Add Grafana dashboard template** (JSON) that visualizes these metrics.

**Effort:** 1 day.

---

### P2-G — Missing Security Alert Emails

**Audit reference:** FullAppChecker.md Phase 14  
**Severity:** MEDIUM — SECURITY

**Prerequisite:** P2-B (email infrastructure improvements)

#### Implementation Plan

1. **Create `sendMfaEnabledEmail(ownerEmail)`** — sent when owner enables MFA.
2. **Create `sendMfaDisabledEmail(ownerEmail)`** — sent when MFA is disabled (high risk action).
3. **Create `sendSuspiciousLoginEmail(ownerEmail, ipAddress, userAgent)`** — sent when login occurs from a new IP or device.
4. **Create `sendAccountLockedEmail(ownerEmail, lockedUntil)`** — sent on lockout.
5. Wire each to the corresponding auth event in `apps/api/src/routes/auth/`.
6. For suspicious login: implement simple device fingerprinting (hash of `userAgent + IP prefix`). Store known devices per owner. Alert on first-seen device.

**Effort:** 1–2 days.

---

### P2-H — Webhook Validation Not Audited

**Audit reference:** FullAppChecker.md Phase 18  
**Severity:** MEDIUM — SECURITY

#### Implementation Plan

1. **Read and audit `apps/api/src/routes/webhooks.ts`** fully (was not read during audit).
2. **For each webhook source**, verify:
   - HMAC-SHA256 signature verification using the provider's signing key
   - Timestamp validation to prevent replay attacks (reject if `timestamp < now - 5 minutes`)
   - Idempotency: store `webhookId` in `api_idempotency_keys` to prevent replay
3. **If any source lacks signature verification**: add it. Reject unsigned webhooks with 401.
4. **Add `webhook_logs` table** (or reuse `email_logs` pattern) to capture all incoming webhooks with signature status.

**Effort:** 4–8 hours depending on how many webhook sources exist and current validation state.

---

### P2-I — PMS Guest PII Stored in Plaintext

**Audit reference:** FullAppChecker.md Phase 21, Finding 13  
**Severity:** MEDIUM — GDPR / COMPLIANCE

**Prerequisite:** P0-D (PMS RLS must be enforced before encrypting PII — otherwise encrypted data has no isolation boundary either)

#### Files to Change

| Field | Location | Encryption Approach |
|---|---|---|
| `passportNumber` | `pms_guests` | Application-layer AES-256-GCM before INSERT, decrypt on SELECT |
| `visaNumber` | `pms_guests` | Same |
| `dateOfBirth` | `pms_guests` | Same |
| `nationalIdNumber` | `pms_guests` | Same |

#### Implementation Plan

1. **Choose encryption key**: use a dedicated `PMS_FIELD_ENCRYPTION_KEY` env var (separate from `DEPLOYMENT_SECRET_KEY` — different attack surface).
2. **Create `encryptPmsField(value, key)` / `decryptPmsField(cipher, key)`** utilities using Node.js `crypto.createCipheriv("aes-256-gcm", ...)`. Store as `enc2:v1:{iv}:{tag}:{ciphertext}` in the text column.
3. **Create a data migration script** `scripts/encrypt-pms-pii.ts`:
   - For each existing `pms_guests` row: read plaintext fields, encrypt, UPDATE row
   - Run within a transaction per tenant
   - Verify: read back and decrypt, compare to original
4. **Update all Drizzle ORM queries** that read/write PII fields to call encrypt/decrypt helpers.
5. **Ensure encrypted fields cannot be searched directly** — if any code does `WHERE passportNumber = $x`, this must be changed to a one-way search (hash for lookup, cipher for storage).

**Effort:** 1–2 days for field encryption + data migration script. Test thoroughly on a copy of production data first.

---

## P3 — TECHNICAL DEBT

*These are important but can be scheduled as backlog items. They do not block launch or security.*

---

### P3-A — Redis `keys()` O(N) in Feature Flag Cache Invalidation

**Audit reference:** FullAppChecker.md Phase 15  
**File:** `packages/shared/src/feature-flags.ts:59–79`

**Fix:** Replace `redis.keys("ff:${key}:*")` with `redis.scan(0, "MATCH", "ff:${key}:*", "COUNT", 100)` pattern — use cursor-based scan in a loop until cursor returns 0. This avoids blocking the Redis event loop on deployments with many tenants.

**Effort:** 1 hour.

---

### P3-B — No Email Idempotency Retry (External)

This is covered by P2-A. Listed here as a dependency reminder.

---

### P3-C — Port-Per-Tenant Model Density Limit

**Audit reference:** FullAppChecker.md Phase 22 (Scalability: 45/100)

With the current port-per-tenant model, each tenant consumes 3–4 ports (Finance internal port, POS backend port, POS frontend port). A standard Linux system allows ~60,000 ports. At ~3 ports/tenant, the platform supports ~20,000 tenants per host before port exhaustion.

**Recommended long-term architecture:**
- Replace port-based Traefik routing with subdomain-based routing using a single Traefik entry point per service type
- Finance: `{slug}.finance.{rootDomain}` → Traefik rule: `Host(\`{slug}.finance.{domain}\`)` → upstream by container name
- POS: `{slug}.pos.{rootDomain}` → same pattern
- This eliminates the need for unique ports entirely

**Effort:** 2–3 days. Requires careful migration of all existing Traefik configs. Do not attempt while tenants are active without a maintenance window.

---

### P3-D — No Cross-Module Identity / SSO

**Audit reference:** FullAppChecker.md Phase 16  
**Severity:** LOW (now) — HIGH (at scale)

Finance, POS, and the control plane each have separate user tables, credentials, and sessions. A tenant company's finance manager must remember three separate passwords.

**Recommended approach:**
1. Integrate an identity provider (Keycloak, Auth0, or custom OIDC server)
2. Finance and POS both support OIDC/SAML — configure them to trust the IdP
3. Control plane issues OIDC tokens on login that Finance and POS honor
4. Single sign-on: log in once to the control plane, access Finance and POS without re-authentication

**Effort:** 1–2 weeks. Major architectural undertaking — schedule as a dedicated project.

---

### P3-E — Single Deployment Key Protects All Tenant Secrets

**Audit reference:** FullAppChecker.md Phase 21  
**File:** `packages/shared/src/deployment-secrets.ts`

Currently one `DEPLOYMENT_SECRET_KEY` encrypts/decrypts all tenant secrets (MySQL passwords, JWT secrets, Finance admin passwords). Compromise of this key exposes all tenants simultaneously.

**Fix:** Move to per-tenant encryption keys derived from a master key:
- Derive a tenant-specific key: `HKDF(masterKey, tenantId, "tenant-secrets")` → 32-byte key
- Use this key for all encrypt/decrypt operations for that tenant's secrets
- Compromise of one tenant's encrypted data does not expose others

**Migration:** Requires decrypting all existing secrets with the current key and re-encrypting with tenant-specific keys. Large but mechanical.

**Effort:** 1–2 days.

---

### P3-F — ProxySQL Admin Credentials in Environment Variables

**Audit reference:** FullAppChecker.md Phase 21  
**File:** `infra/worker-service/domain/provisioner.ts:76–80`

The ProxySQL admin password is passed as a plain environment variable. In a production Kubernetes or Docker Swarm environment, use Docker Secrets or HashiCorp Vault instead.

**Fix:** Mount ProxySQL credentials as a Docker Secret. Modify the worker to read from `/run/secrets/proxysql_admin_password` when the file exists, falling back to env var for local dev.

**Effort:** 2–4 hours.

---

## SPRINT SCHEDULE

### Sprint 0 — Before First Live Tenant (Current)

| Repair | Engineer Days |
|---|---|
| P0-A: Finance OTP persistence | 0.5 |
| P0-D: PMS RLS verification | 1 |
| P0-E: MySQL orphan detection | 0.75 |
| P1-D: Custom role `*` guard | 0.5 |
| **Subtotal** | **~3 days** |

### Sprint 1 — Week 1–2 Post-Setup

| Repair | Engineer Days |
|---|---|
| P0-B: POS relay mode (double-posting fix) | 4 |
| P1-C: Chatwoot cleanup | 0.5 |
| P1-E: Sentry error tracking | 0.75 |
| P1-F: Finance sync retry | 0.5 |
| **Subtotal** | **~6 days** |

### Sprint 2 — Week 3–4

| Repair | Engineer Days |
|---|---|
| P0-C: Stripe payment integration | 8 |
| P1-A: PMS-Finance sync worker | 2.5 |
| P1-B: Branch-location mapping | 1 |
| **Subtotal** | **~12 days** |

### Sprint 3 — Month 2

| Repair | Engineer Days |
|---|---|
| P2-A: Email retry | 0.5 |
| P2-B: Module lifecycle emails | 1 |
| P2-C: Trial period system | 1.5 |
| P2-D: API key permission scoping | 0.75 |
| P2-E: Dead-letter alerting | 0.5 |
| P2-G: Security alert emails | 1.5 |
| P2-H: Webhook hardening | 1 |
| **Subtotal** | **~7 days** |

### Sprint 4 — Month 3

| Repair | Engineer Days |
|---|---|
| P2-F: Capacity monitoring | 1 |
| P2-I: PMS PII encryption | 1.5 |
| P3-A: Redis SCAN fix | 0.1 |
| P3-E: Per-tenant encryption keys | 1.5 |
| P3-F: ProxySQL secrets | 0.5 |
| **Subtotal** | **~5 days** |

### Backlog (Schedule Separately)

| Repair | Effort |
|---|---|
| P3-C: Port-per-tenant redesign | 2–3 days |
| P3-D: Cross-module SSO | 1–2 weeks |

---

## POST-REPAIR SCORE PROJECTION

| Area | Current | After All P0+P1 | After All P2 | After All P3 |
|---|---|---|---|---|
| Provisioning | 72 | 82 | 85 | 88 |
| Billing | 20 | 75 | 82 | 85 |
| Tenancy | 65 | 80 | 85 | 88 |
| Security | 58 | 78 | 85 | 90 |
| Integrations | 52 | 72 | 80 | 82 |
| Emails | 68 | 75 | 88 | 90 |
| Permissions | 62 | 80 | 85 | 88 |
| Observability | 38 | 65 | 80 | 85 |
| Recovery | 55 | 72 | 80 | 82 |
| Scalability | 45 | 48 | 52 | 78 |
| **Overall** | **54** | **73** | **82** | **88** |

---

## ACCEPTANCE DEFINITION FOR "DONE"

A repair is done when ALL of the following are true:

1. **Code written** and reviewed by at least one other engineer
2. **Tests written** covering the acceptance criteria defined in this plan
3. **Tests pass** in CI without flakiness
4. **No regression** in existing tests
5. **Manually verified** in a staging environment with a real tenant
6. **Audit log updated** — the fix is documented with a note in `admin_audit_log` if it changed behavior for existing tenants
7. **FullAppChecker.md updated** — the finding's status changed from its current state to IMPLEMENTED AND VERIFIED

---

*End of STOCKIX_REPAIR_PLAN.md*  
*Total repairs: 23 (5 P0, 6 P1, 9 P2, 6 P3)*  
*Total estimated engineering effort: ~35 engineer-days to complete P0+P1+P2*  
*No code has been changed. This document is plan only.*
