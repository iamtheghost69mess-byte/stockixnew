# Stockix SaaS Owner Dashboard — Broken / Partial / Missing Audit

**Scope:** Owner dashboard (`apps/dashboard`, `apps/api`), POS (`services/posnew`), Accounting (`services/stockix-finance`), provisioning (`infra/worker-service`, `infra/tenant-stack`).

**Method:** Static code audit (May 2026). Only gaps are listed — working behavior is omitted.

**Last implementation review:** May 2026 — phased plan fixes **1–10** (see [Recommended Fix Order](#recommended-fix-order) below). Status below is from **code inspection + targeted automated tests**, not full staging E2E unless noted.

### Legend (plan fixes 1–10)

| Label | Meaning |
|-------|---------|
| ✅ Tested | Implemented; named automated test(s) pass in repo |
| ⚠️ Code | Implemented in repo; automated test missing, flaky, or E2E not run |
| ⚠️ Partial | Some requirements met; gaps listed |
| 🔲 Open | Not implemented (or explicitly deferred) |

### Plan fixes 1–10 — status

| # | Fix | Code | Automated tests | Manual E2E | Remaining / notes |
|---|-----|------|-----------------|------------|-------------------|
| 1 | Finance license sync fail-fast on provision | ✅ | ✅ `apps/api/tests/sync-finance-license-adapter.test.ts` | ⚠️ Not signed off | `FINANCE_LICENSE_SYNC_OPTIONAL=1` only in `development`. Rebuild worker: `pnpm infra:worker:build`. |
| 2 | Mail-not-configured on forgot-password / invite | ✅ | ✅ `apps/api/tests/password-reset-mail-status.test.ts` | ⚠️ Not signed off | Dashboard forgot-password + owners invite UI wired. `auth-routes.test.ts` does **not** assert forgot-password shape. |
| 3 | POS lifecycle blocks login + tenant API | ✅ | ✅ `services/posnew/apps/pos-backend/tests/unit/organization-lifecycle-access.test.js` | ⚠️ Not signed off | `get-organization-access-state.js` + `.ts` synced. `npm run test:saas-integration` **not re-run** in last verification. |
| 4 | `readyForPinLogin` requires `lifecycle === "active"` | ✅ | ⚠️ No dedicated test | ⚠️ Not signed off | `platformOrgController.js` guards lifecycle. No platform controller unit test added. |
| 5 | Dashboard license suspend / reactivate | ✅ | ⚠️ `apps/api/tests/license-suspend.test.ts` (1 case timed out at 5s) | ⚠️ Not signed off | Proxies: `apps/dashboard/app/api/licenses/[licenseId]/suspend|reactivate/`. UI: license detail header. Optional tenant panel actions **not** added. |
| 6 | Tenant suspend → Finance license + POS org | ✅ | ✅ `apps/api/tests/tenant-suspend-license-sync.test.ts` | ⚠️ Not signed off | `apps/api/src/tenant-license-lifecycle.ts` + `POST /tenants/:id/suspend|reactivate`. Docker stop still separate (by design). |
| 7 | POS credentials reset-only UX | ✅ | ⚠️ `pos-credentials-http.test.ts` (no `masked` assertion) | ⚠️ Not signed off | `tenant-pos-credentials.tsx` + API `masked` flag. No secure plaintext reveal after bootstrap (intentional). |
| 8 | POS offline `offlineSyncKey` idempotency | ⚠️ Partial | 🔲 No duplicate-order test | 🔲 Not signed off | Create path: `makeOfflineSyncKey()` → `posCreateOrder` / `addOrder` dedupe. **Not** using batch `POST /api/orders/sync` for flush; patch/pay queue **without** key. |
| 9 | Email log API + dashboard page | ✅ | ✅ `apps/api/tests/email-logs.test.ts` | ⚠️ Not signed off | `GET /admin/email-logs` + `/email-logs` page. Resend webhook still needs ops config. |
| 10 | Expiry milestones + default dated license | ✅ | ✅ `license-expiry-milestones.test.ts`, `license-expiry-email.test.ts` | ⚠️ Not signed off | Milestones **90/60/30/15/7/3/2/1**; owner email to assigned `ownerId`; tenant auto-suspend after grace; BullMQ when Redis configured. Generate UI defaults fixed term; perpetual still selectable. |

**Deferred (unchanged):** Stripe billing, event bus, GRN/stock bridge, NeDB/LAN offline, `STXI` keys, combined module add/remove, Finance whitelabel — not in plan scope.

---

## SECTION 1 — SAAS OWNER DASHBOARD CORE

**Section 1.1–1.4 full repair (May 2026):** Implemented in repo. Apply migrations: `0044_platform_roles.sql`, `0045_tenants_org_scope_permission.sql`, `0046_stxi_license.sql`. Optional: `CONTROL_PLANE_REDIS_URL` for BullMQ milestone queue (inline fallback when unset). Manual checklist: [docs/section-1-e2e-checklist.md](docs/section-1-e2e-checklist.md).

| Phase | Automated tests | Manual E2E |
|-------|-----------------|------------|
| 0 Baseline | `rbac`, `password-reset-mail-status`, `license-suspend`, `license-expiry-*`, `org-access-scope` | Not signed off |
| 1 Auth | + `org-access-scope` (org_scope), invite audit on resend | Not signed off |
| 2 Tenants | UI + list fields in API | Not signed off |
| 3 Licenses | `stxi-license-key.test.ts`, generate STXI when `scopedLocationId` | Not signed off |
| 4 Expiry | `license-expiry-milestones`, BullMQ when Redis configured | Not signed off |

### 1.1 Authentication & Access

✅ **Custom roles with configurable permissions** — **Implemented (Section 1 repair Phase 2).** `platform_roles` table + `GET/POST/PATCH/DELETE /admin/roles`; permission catalog in `@repo/shared/permissions`; dashboard **Settings → Roles** (`/settings/roles`). Invite accepts `roleId`. **Tested:** `rbac.test.ts` (permission middleware + `/auth/me` capabilities). **Apply migration:** `0044_platform_roles.sql`.

PRIORITY: High  
EFFORT: High — **done**

✅ **Custom roles enforced in dashboard UI** — Sidebar and **Add tenant** gated via `useHasPermission` / capabilities from `/auth/me` `permissions[]`. **Tested:** `rbac.test.ts`. **Manual E2E:** verify `read_only` nav + buttons.

PRIORITY: High  
EFFORT: Medium — **done**

✅ **Per-organization access scope** — `tenants.org_scope` permission; `GET /tenants` + `GET /tenants/:id` filtered by `owner_organization_access`; org CRUD scoped. **Tested:** `org-access-scope.test.ts`. **Manual E2E:** not signed off.

PRIORITY: Medium  
EFFORT: High — **done**

✅ **Invite link expiry UX** — `inviteTokenExpiresAt` on `GET /owners`, `GET /auth/invite/:token`; shown on owner table + accept-invite page. **Manual E2E:** not signed off.

PRIORITY: Medium  
EFFORT: Low — **done**

⚠️ **Invite email delivery failure** — `invite.email_failed` audit; 2s retry on invite/resend; **Resend invitation** in owners table. **No** durable mail queue (deferred). **Tested:** API paths; dedicated audit test optional.

PRIORITY: Medium  
EFFORT: Medium — **partial (no queue)**

✅ **Forgot password for pending-invite owners** — API returns `accountPending: true`; forgot-password UI explains accept-invite-first. Still no email sent (by design). **Tested:** `password-reset-mail-status.test.ts` (extend if needed).

PRIORITY: Low  
EFFORT: Low — **done**

✅ **Forgot password when mail not configured** — **Fixed (plan #2).** API returns `mailConfigured` / `emailSent` (`password-reset.ts`, `routes/auth/index.ts`); dashboard forgot-password page shows ops warning when mail off or send failed. **Tested:** `apps/api/tests/password-reset-mail-status.test.ts`. **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: Low — **done**

---

### 1.2 Tenant Details & Organization View

✅ **Tenant creation date on list** — `createdAt` on API + **Created** / **Provisioned** columns in tenant list.

PRIORITY: Medium  
EFFORT: Low — **done**

✅ **License start/expiry on tenant list** — `GET /tenants` returns `licenseExpiresAt`, `licenseValidFrom`, `licenseIsPerpetual`; list **Expires** column. **Tested:** API change only; add `tenants-list-fields.test.ts` optional.

PRIORITY: Medium  
EFFORT: Low — **done**

✅ **Default license on provision** — Auto-assigned license is `isPerpetual: false` with `expiresAt = validFrom + DEFAULT_LICENSE_TERM_DAYS`. Generate UI defaults to fixed 1-year term. **Tested:** milestone/expiry unit tests; provision path not separately asserted.

PRIORITY: High  
EFFORT: Medium — **provision default done**

✅ **Tenant detail page license actions** — Suspend/Reactivate on tenant license panel + license detail. **Tested:** `license-suspend.test.ts`. **Manual E2E:** not signed off.

PRIORITY: Medium  
EFFORT: Medium — **done**

✅ **Tenant vs deployment status confusion** — Partial filter + column `title` tooltips on tenant list.

PRIORITY: Medium  
EFFORT: Medium — **done (docs in UI)**

---

### 1.3 License Management

✅ **License suspend/reactivate in dashboard** — **Fixed (plan #5).** Proxies `apps/dashboard/app/api/licenses/[licenseId]/suspend|reactivate/`; suspend/reactivate on license detail (`license-detail-header.tsx`, `use-license-detail-page.ts`). **Tested:** `license-suspend.test.ts` (one case flaky timeout). **Optional:** tenant license panel actions not added. **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: Medium — **done**

✅ **POS / Accounting / combined product models** — **Preset: Platform + Accounting** in generate dialog; fixed-term default.

PRIORITY: Medium  
EFFORT: Medium — **done (preset; no new product enum)**

✅ **License key format (`STXI` spec vs implementation)** — `STXI-{tenantShort}-{locationShort}-{checksum}` in `@repo/shared/stxi-license-key`; DB `key_format` + `scoped_location_id`; POS `stxiLicenseValidate.js` on auth + middleware. Legacy STKX until `LICENSE_ACCEPT_STKX_UNTIL` / org `acceptStkxUntil`. **Tested:** `stxi-license-key.test.ts`.

PRIORITY: Medium  
EFFORT: High — **done**

✅ **`suspended` / `expired` badge styling** — Distinct styles in `license-status-badge.tsx`.

PRIORITY: Low  
EFFORT: Low — **done**

✅ **License suspend → POS/Accounting block (dashboard path)** — Suspend API returns `financeSync` / `posSync` / `errors[]`; `LICENSE_SYNC_STRICT=1` fails request on sync error. **Tested:** `license-suspend.test.ts`. **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: Medium — **done (staging verify recommended)**

---

### 1.4 License Expiry Notification System

✅ **Milestone schedule (3mo, 2mo, 1mo, 15d, 7d, 3d, 2d, 1d)** — Canonical **90/60/30/15/7/3/2/1** days (~3mo/2mo/1mo). **Tested:** `license-expiry-milestones.test.ts`.

PRIORITY: Critical  
EFFORT: High — **done**

✅ **BullMQ / dedicated cron per milestone** — `apps/api/src/jobs/license-expiry-queue.ts` + worker when `CONTROL_PLANE_REDIS_URL` set; idempotent `jobId=licenseId:milestone`; inline fallback without Redis. Log: `license_expiry_milestone_fired`.

PRIORITY: High  
EFFORT: High — **done**

✅ **Notification deduplication (milestones)** — **Fixed for milestone path (plan #10).** Email idempotency `license-expiring/{licenseId}/{milestoneDays}`; in-app dedupe via `meta.milestoneDays` + `hasLicenseExpiryMilestoneNotification`. Legacy non-milestone key still used if `milestoneDays` omitted. **Tested:** `license-expiry-email.test.ts`, `license-expiry-milestones.test.ts`.

✅ **Notify SaaS owner by email** — Milestone emails also go to tenant’s assigned `owners.email` (`sendLicenseExpiringEmailToPlatformOwner`). **Tested:** `license-expiry-milestones.test.ts` (mocked). Not all super_admins globally.

PRIORITY: High  
EFFORT: Medium — **done (assigned owner only)**

✅ **Auto-suspend on expiry date** — After grace, worker sets `tenants.status` and `tenantDeployments.status` to `suspended` (`license-expire-followup.ts`). **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: Medium — **done**

✅ **Perpetual default licenses on provision** — New auto-assigned and generate-dialog defaults are dated (see §1.2). Operators may still explicitly choose perpetual in generate UI.

PRIORITY: High  
EFFORT: Medium — **provision default done**

---

### 1.5 Plans & Billing

🔲 **Stripe integration (owner SaaS billing)** — No Stripe customer/subscription/checkout/webhook in `apps/api` or `apps/dashboard`. Plans are internal DB catalog only (`packages/db/src/schema.ts` `plans` table).

PRIORITY: Critical  
EFFORT: High

🔲 **Plan change / upgrade-downgrade flow** — No API or UI to change tenant subscription, prorate, or link plan changes to license `modules`/product type.

PRIORITY: Critical  
EFFORT: High

🔲 **Failed payment handling** — No `payment_failed` webhook, dunning, or dashboard billing-failure indicators in owner app.

PRIORITY: Critical  
EFFORT: High

⚠️ **Plan display per tenant** — Profile resolves plan name + catalog `priceMonthly`/`priceAnnually` from internal catalog; disclaimer that Stripe billing is not attached. No next billing date or invoices. **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: High — **partial (no Stripe)**

✅ **`billing_manager` vs Plans page** — Seeded role includes `plans.read`; Plans nav uses `plans.read` permission. Plan **write** remains `plans.manage` (super_admin).

PRIORITY: Medium  
EFFORT: Medium — **done**

---

## SECTION 2 — POS AUDIT

### 2.1 Provisioning

✅ **`readyForPinLogin` and org lifecycle** — **Fixed (plan #4).** Requires `lifecycle === "active"` plus license window (`platformOrgController.js`). **Tested:** lifecycle access unit test only; no dedicated `readyForPinLogin` test. **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: Low — **done**

⚠️ **POS-only tenant defaults** — New orgs default `modules: { inventory: true, accounting: true }` unless overridden; no POS-only entitlement profile from Stockix worker.

PRIORITY: Medium  
EFFORT: Medium

⚠️ **One-time bootstrap PIN reveal** — Full PINs live in Redis ~1h then consumed; org stores **masked** PINs only. Missed worker poll during provision → failure. Owner `GET .../credentials` returns masked PINs → dashboard table empty unless **Reset PIN**.

PRIORITY: High  
EFFORT: Medium

✅ **Owner “Reveal Staff PINs” after provision** — **Fixed as reset-only UX (plan #7).** Copy explains bootstrap PINs shown once; dialog shows masked roles + reset. API returns `masked` per role. No post-bootstrap plaintext reveal (by design). **Tested:** `pos-credentials-http.test.ts` (PIN paths, not `masked` field). **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: Medium — **UX aligned to security model**

⚠️ **`defaultCredentials` drift** — Repair scripts exist (`repairCredentials.js`, `migrate-bootstrap-credentials.js`); indicates production drift between org doc and staff users.

PRIORITY: Medium  
EFFORT: Medium

---

### 2.2 Authentication

🔲 **PIN login offline** — `loginWithPin` requires live MongoDB; no local credential mirror for Electron/offline.

PRIORITY: High  
EFFORT: High

⚠️ **`defaultCredentials` not synced on tenant staff PIN change** — `staffController.js` updates `user.pin` but not `defaultCredentials`; only platform reset syncs (`platformOrgController.js` ~1150–1186).

PRIORITY: Medium  
EFFORT: Medium

⚠️ **Bootstrap 6-digit PIN vs login 4–6** — Bootstrap allocates 6 digits; login accepts `^\d{4,6}$` (inconsistent UX/docs).

PRIORITY: Low  
EFFORT: Low

---

### 2.3 License Enforcement in POS

✅ **`lifecycle: suspended` blocks PIN login and tenant API** — **Fixed (plan #3).** `getOrganizationAccessState` blocks `suspended` / `pending_closure` / `deleted` / `draft` with `ORGANIZATION_NOT_ACTIVE`; wired in `organizationAccessService.js`, `requireActiveOrganization.js`, `authController.js`. **Tested:** `organization-lifecycle-access.test.js`. **Not re-verified:** `npm run test:saas-integration`. **Manual E2E:** not signed off.

PRIORITY: Critical  
EFFORT: Medium — **done in code**

⚠️ **License suspend from owner dashboard → POS** — Date-based license + Stockix-driven suspend via `pos-license-sync` can work when license API suspend is invoked; org lifecycle suspend does not block login (above).

PRIORITY: Critical  
EFFORT: Medium (with lifecycle fix)

🔲 **Per-location `STXI-...` license key validation on POS startup/login** — Not implemented; enforcement is `licenseStartsAt` / `licenseEndsAt` on Organization only.

PRIORITY: Medium  
EFFORT: High

---

### 2.4 Floor & Table Management

⚠️ **Visual spatial floor plan** — API supports `floorAnchorX/Y`; POS floor is a **card grid**, not anchor-based layout. Backoffice floor is a data table, not drag-and-drop plan. Anchors default null on create.

PRIORITY: Medium  
EFFORT: High

⚠️ **VIP indicator on POS floor** — `reservatorIsVip` exists in API and backoffice table (★ in columns); **not** shown on `pos-floor-page.tsx` terminal cards.

PRIORITY: Low  
EFFORT: Low

⚠️ **Guest/table menu vs org lifecycle** — Table-path guest menu may not check org `lifecycle` before serving (documented in `mdfiles/guest menu.md`).

PRIORITY: Medium  
EFFORT: Low

⚠️ **Table session ↔ inventory** — Orders enforce stock server-side (`assertOrderLinesFulfillable`); client uses cached menu availability (~15s stale). No dedicated “table session stock check” bridge beyond order save/pay paths; race between tills possible under `strictOversell`.

PRIORITY: Medium  
EFFORT: Medium

---

### 2.5 Inventory & Stock

⚠️ **Live stock check offline** — Server-side MongoDB stock check works when online; offline queue has no stock mirror.

PRIORITY: High  
EFFORT: High

⚠️ **Stock take — serial-tracked lines** — Backend rejects post without serials; stock-take detail UI lacks serial-tracked banner/guard.

PRIORITY: Medium  
EFFORT: Medium

⚠️ **Offline `inventory_adjust` queue kind** — Processor exists; frontend never enqueues it.

PRIORITY: Low  
EFFORT: Low

---

### 2.6 Receipt & Printing

⚠️ **Bluetooth printing cloud-dependent** — Server sets Bluetooth jobs to `pending` for client Socket.IO dispatch; requires browser tab open + `pairedPrinterId`. Not true offline/local agent print.

PRIORITY: Medium  
EFFORT: Medium

⚠️ **WebSocket print stability** — `printer:register` requires org/printer/location; misconfiguration fails silently without strong POS UI errors.

PRIORITY: Medium  
EFFORT: Low

🔲 **Deferred print jobs for offline pay** — No offline print queue tied to order replay.

PRIORITY: Medium  
EFFORT: Medium

---

### 2.7 Offline Mode

🔲 **NeDB local database** — Not in repo; Mongo-only backend (`mdfiles/electron.md`, `worfkflow.md`).

PRIORITY: High  
EFFORT: High

🔲 **LAN-elected local Express server** — Not implemented; client uses cloud API origin.

PRIORITY: High  
EFFORT: High

⚠️ **IndexedDB write queue only** — `offline-queue.ts` / `pos-check-sync.ts` for create/patch/pay; no read model for catalog/tables offline.

PRIORITY: High  
EFFORT: High

⚠️ **`offlineSyncKey` / `POST /api/orders/sync`** — **Partial (plan #8).** Offline **create** sets `offlineSyncKey` (`offline-queue.ts`, `pos-check-sync.ts`, `pos-order-api.ts`); `addOrder` dedupes by key. Flush still replays individual create/patch APIs, **not** batch `POST /api/orders/sync`. Patch/pay offline mutations have **no** key. **No** automated duplicate-replay test. **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: Medium — **create path only**

⚠️ **Deferred accounting on offline pay** — Pay queues locally; `onOrderBecamePaid` / BigCapital sync only on server when replay succeeds. Split-bill pay blocked offline.

PRIORITY: High  
EFFORT: High

⚠️ **Flush ordering after offline create** — Patch-before-create ordering risk; store not hydrated after `create_order` replay.

PRIORITY: High  
EFFORT: Medium

⚠️ **`navigator.onLine` only connectivity** — No API heartbeat for true online detection.

PRIORITY: Medium  
EFFORT: Low

---

## SECTION 3 — ACCOUNTING AUDIT (BigCapital)

### 3.1 Provisioning

✅ **Finance license sync on provision** — **Fixed (plan #1).** `syncFinanceLicense` throws `FinanceLicenseSyncError` when secret missing or HTTP fails (optional skip only if `FINANCE_LICENSE_SYNC_OPTIONAL=1` and `NODE_ENV=development`). **Tested:** `apps/api/tests/sync-finance-license-adapter.test.ts`. **Manual:** provision accounting tenant without secret — not signed off.

PRIORITY: Critical  
EFFORT: Low — **done**

⚠️ **Combined bundle `partial` state** — Finance stack active while POS bootstrap/wire failed; operator must retry/repair.

PRIORITY: High  
EFFORT: Medium

⚠️ **Stuck `provisioning` / missing `finance_tenant_id`** — Legacy/failed bootstrap paths; repair flows exist but ops burden.

PRIORITY: High  
EFFORT: Medium

⚠️ **Tenant `.env` secrets plaintext on disk** — Documented until Finance can decrypt (`crypto-tenant-secret-generator.ts`).

PRIORITY: Medium  
EFFORT: High

🔲 **Mandatory first-login setup wizard not enforced by worker** — `setup_completed_at` in Finance DB; worker pre-builds org/COA but does not set completion flag.

PRIORITY: Medium  
EFFORT: Medium

---

### 3.2 Organization Model

⚠️ **Multi-org on one Finance stack** — Control-plane `organization.provision` driven; not self-service in Finance UI alone.

PRIORITY: Medium  
EFFORT: Medium

⚠️ **Separate-stack child org — no COA copy** — Parent-stack sub-org path copies COA; separate-stack children do not (non-fatal failure).

PRIORITY: Medium  
EFFORT: Medium

🔲 **Owner dashboard CRUD for Finance sub-orgs** — Second org requires worker/API path; no owner UI workflow.

PRIORITY: Medium  
EFFORT: High

⚠️ **`maxOrganizations` vs provision defaults** — Finance enforces limit; provision/sync can default to `1` if plan payload not applied.

PRIORITY: High  
EFFORT: Low

---

### 3.3 License Enforcement in Accounting

⚠️ **Expired license blocks all API including reads** — No read-only degraded mode (`LicenseGuard.middleware.ts`).

PRIORITY: Medium  
EFFORT: Low

⚠️ **No license row → writes blocked, reads allowed** — Mis-synced provision looks usable until first POST.

PRIORITY: High  
EFFORT: Low

✅ **Tenant suspend + Finance license + POS org** — **Fixed (plan #6).** `POST /tenants/:id/suspend` still enqueues Docker stop **and** `applyTenantLicenseSuspend` (license row + Finance sync + POS suspend). Reactivate mirrors. **Tested:** `tenant-suspend-license-sync.test.ts`. **Manual E2E:** not signed off.

PRIORITY: High  
EFFORT: Medium — **done**

---

### 3.4 Whitelabeling

⚠️ **`tenant_config` not injected into Finance stack** — Logo/colors in control-plane DB not passed to tenant `.env` / webapp boot (`tenant-env.ts` only sets Stockix API URL + tenant id).

PRIORITY: High  
EFFORT: Medium

⚠️ **BigCapital branding remnants** — `bigcapital:*` localStorage keys, `bigcapital-loading` CSS, mail templates with Bigcapital assets (`UserInvite.html`, etc.).

PRIORITY: Medium  
EFFORT: Medium

🔲 **Per-tenant product name/colors → Finance PDF/branding** — Finance `preferences/branding` is per-org inside tenant, not wired from Stockix `tenant_config`.

PRIORITY: High  
EFFORT: High

---

## SECTION 4 — POS + ACCOUNTING COMBINED AUDIT

### 4.1 Organization Sync

⚠️ **1:1 wire at provision only** — One `financeTenantId` per POS org (`integrationConfigModel.js`, `wire-pos-bigcapital-integration.ts`).

PRIORITY: High  
EFFORT: —

🔲 **Second POS org does not auto-create Finance org** — `platformOrgController` create org has no Finance counterpart job.

PRIORITY: High  
EFFORT: High

⚠️ **Sync one-way (POS → Finance)** — No Finance org/COA changes propagated back to POS.

PRIORITY: Medium  
EFFORT: —

⚠️ **Wire failure → `partial` tenant; retry `hasOp` skip** — Retry may skip `wire_pos_integration` if journal marks op complete while integration still error.

PRIORITY: High  
EFFORT: Medium

---

### 4.2 Sales → Accounting Flow

🔲 **Cross-product event bus / `originatedBy`** — No shared event bus; zero `originatedBy` matches in monorepo. Bridge is BullMQ `bigcapital_sync` → HTTP `POST /api/internal/pos/receipts` only.

PRIORITY: High  
EFFORT: High

⚠️ **Paid orders only** — Enqueue from paid paths + `syncOfflineOrders`; other sale types not unified.

PRIORITY: Medium  
EFFORT: Medium

❌ **Partial refund does not adjust Finance** — Full void only; partial refund leaves Finance receipt unchanged (`docs/INTEGRATION_REFERENCE.md`).

PRIORITY: High  
EFFORT: High

⚠️ **Multi-tender → single deposit account** — Largest split wins in `bigcapitalSyncProcessor.js`.

PRIORITY: Medium  
EFFORT: Medium

⚠️ **Manual item mapping required** — Unmapped lines dropped; partial cart totals can diverge.

PRIORITY: High  
EFFORT: High (product)

⚠️ **Offline accounting replay** — Offline paid orders enqueue sync when replayed online; no durable accounting outbox beyond BullMQ job idempotency.

PRIORITY: Medium  
EFFORT: Medium

---

### 4.3 Stock → Accounting Flow

🔲 **GRN / purchase → Finance AP** — Not in `bigcapitalSyncProcessor.js` (receipt-only).

PRIORITY: High  
EFFORT: High

🔲 **POS ingredient adjustments → Finance inventory** — POS deducts ingredients; Finance COGS uses item `costPrice`, not recipe cost.

PRIORITY: High  
EFFORT: High

⚠️ **COGS on sale via Finance receipt only** — POS does not send unit cost; wrong Finance item cost → wrong COGS.

PRIORITY: High  
EFFORT: Medium

🔲 **Stock adjustments reflected in accounting** — No bridge for stock-take/adjustment events.

PRIORITY: High  
EFFORT: High

---

### 4.4 License Enforcement — Combined

⚠️ **License suspend/reactivate syncs Finance + POS when API used** — Async, non-fatal on failure (`license-http.ts`, `pos-license-sync.js`). **Dashboard UI added (plan #5).** Verify Finance guard + POS PIN block in staging.

PRIORITY: High  
EFFORT: Low — **API + dashboard wired**

🔲 **Downgrade combined → POS-only** — `remove-module` allows `pos` | `pms` | `chat` only; does not stop Finance stack (`tenant-modules-http.ts`, `worker.ts`).

PRIORITY: High  
EFFORT: High

🔲 **Upgrade POS-only → combined mid-cycle** — `add-module` schema excludes `accounting`; requires full reprovision/ops.

PRIORITY: High  
EFFORT: High

⚠️ **Combined license suspend both products** — Possible via license API suspend path; tenant Docker suspend alone does not sync Finance/POS license state.

PRIORITY: High  
EFFORT: Medium

---

### 4.5 Multi-Organization in Combined Mode

⚠️ **Many POS locations → one Finance org** — `locationMapping[]` on integration config; not many Finance orgs per POS org.

PRIORITY: Medium  
EFFORT: —

🔲 **Two POS orgs ≠ two Finance orgs** — Single `financeTenantId` on `IntegrationConfig`.

PRIORITY: High  
EFFORT: High

⚠️ **Reports scoped per Finance organization** — Mixing only if wrong org context selected; no cross-org consolidation in bridge.

PRIORITY: Medium  
EFFORT: —

⚠️ **Multi-org combined E2E not validated in repo** — Docs mark live scenarios NOT RUN.

PRIORITY: High  
EFFORT: Medium (QA)

---

## SECTION 5 — EMAIL & NOTIFICATIONS SYSTEM

### Provider & templates

⚠️ **Email provider** — Resend via SMTP (`nodemailer`, `MAIL_PASSWORD`); not Resend SDK. Silent `skipped` when unset.

PRIORITY: High  
EFFORT: Low

🔲 **Outbound mail queue on control plane** — Synchronous `sendMail`; no BullMQ retries/dead-letter for owner app (Finance has mail queue only).

PRIORITY: Medium  
EFFORT: High

⚠️ **Transactional email coverage** — Invite, forgot-password, license expiry exist; password-changed, login alert, MFA, magic link, billing receipts not implemented (`docs/email.md`).

PRIORITY: Low–Medium  
EFFORT: Medium

⚠️ **Templates not tenant white-label** — Owner/ops templates use global Stockix branding; `tenant_config` not applied to sender/logo.

PRIORITY: Medium  
EFFORT: Medium

---

### In-app notifications

⚠️ **License notifications** — `owner_notifications` + bell for expiring/expired/suspended; not full milestone ladder; not provision-complete for all paths.

PRIORITY: Medium  
EFFORT: Medium

🔲 **In-app notifications for tenant admins** — Only Stockix owners (`owner_notifications` table); tenant-facing dashboard alerts not built.

PRIORITY: Medium  
EFFORT: High

⚠️ **Provision SSE bus unused for fan-out** — `subscribeProvision` never called; SSE polls DB.

PRIORITY: Low  
EFFORT: Low

---

### Notification / email log

✅ **`email_logs` operator UI** — **Fixed (plan #9).** `GET /admin/email-logs` (`routes/email-logs.ts`); dashboard `/email-logs` + sidebar. **Tested:** `apps/api/tests/email-logs.test.ts`. **Manual:** trigger invite → see row — not signed off.

PRIORITY: Medium  
EFFORT: Medium — **done**

⚠️ **Delivery status via Resend webhook** — `apps/api/src/routes/webhooks/resend.ts` requires ops configuration.

PRIORITY: Medium  
EFFORT: Low

---

## Summary Table

| # | Area | Status | Priority | Effort |
|---|------|--------|----------|--------|
| 1 | License expiry milestone notifications (3mo→1d) | ⚠️ Partial (90…1d in follow-up; no BullMQ) | Critical | High |
| 2 | Stripe / owner SaaS billing | 🔲 Missing | Critical | High |
| 3 | Finance license sync skip when no secret | ✅ Fixed + tested | Critical | Low |
| 4 | POS `lifecycle: suspended` does not block login | ✅ Fixed + unit test | Critical | Medium |
| 5 | Failed payment / dunning | 🔲 Missing | Critical | High |
| 6 | License suspend/reactivate dashboard UI | ✅ Fixed (E2E not signed off) | High | Medium |
| 7 | Cross-product event bus / `originatedBy` | 🔲 Missing | High | High |
| 8 | GRN / stock → Finance accounting | 🔲 Missing | High | High |
| 9 | Combined module upgrade/downgrade (accounting) | 🔲 Missing | High | High |
| 10 | POS multi-org ↔ Finance multi-org | 🔲 Missing | High | High |
| 11 | `tenant_config` whitelabel → Finance UI | 🔲 Missing | High | High |
| 12 | Partial refund → Finance adjustment | ❌ Broken | High | High |
| 13 | Default perpetual license on provision | ✅ Fixed on provision (UI perpetual still possible) | High | Medium |
| 14 | Owner PIN reveal after bootstrap | ✅ Reset-only UX (no plaintext reveal) | High | Medium |
| 15 | `offlineSyncKey` / orders sync idempotency | ⚠️ Partial (create only) | High | Medium |
| 16 | Tenant Docker suspend vs license suspend | ✅ Fixed + unit test | High | Medium |
| 17 | Custom roles + dashboard RBAC UI | 🔲 / ⚠️ | High | High |
| 18 | `STXI` license key format | ⚠️ Partial | Medium | Low–High |
| 19 | NeDB + LAN offline POS | 🔲 Missing | High | High |
| 20 | Visual spatial floor plan + VIP on POS floor | ⚠️ Partial | Medium | High / Low |
| 21 | `email_logs` dashboard | ✅ Fixed + API test | Medium | Medium |
| 22 | Mail silent skip UX | ✅ Fixed forgot-password/invite (E2E not signed off) | High | Low |
| 23 | Invite email retry / expiry display | ⚠️ Partial | Medium | Low–Medium |
| 24 | BigCapital branding in mail/CSS | ⚠️ Partial | Medium | Medium |
| 25 | PIN offline / deferred accounting offline | 🔲 Missing | High | High |

---

## Recommended Fix Order {#recommended-fix-order}

Ordered for **quickest operational win → largest build**. Status reflects **May 2026 implementation** (code + targeted tests; staging E2E not assumed).

| # | Item | Status |
|---|------|--------|
| 1 | Enforce `INTERNAL_API_SECRET`; fail provision on Finance license sync failure | ✅ **Done** — `sync-finance-license.ts`; test `sync-finance-license-adapter.test.ts` |
| 2 | Surface mail-not-configured on forgot-password / invite | ✅ **Done** — API + dashboard; test `password-reset-mail-status.test.ts` |
| 3 | POS: `lifecycle !== "active"` on login + tenant routes | ✅ **Done** — `get-organization-access-state`; test `organization-lifecycle-access.test.js` |
| 4 | `readyForPinLogin` requires `lifecycle === "active"` | ✅ **Done** — `platformOrgController.js`; no dedicated test |
| 5 | Dashboard license suspend / reactivate | ✅ **Done** — proxies + license detail UI; `license-suspend.test.ts` flaky |
| 6 | Tenant suspend → Finance license + POS org | ✅ **Done** — `tenant-license-lifecycle.ts`; test `tenant-suspend-license-sync.test.ts` |
| 7 | POS credentials reset-only UX | ✅ **Done** — `tenant-pos-credentials.tsx`; partial API test coverage |
| 8 | POS offline `offlineSyncKey` / sync endpoint | ⚠️ **Partial** — create + `addOrder` dedupe only; no batch sync flush test |
| 9 | Dashboard email log API + page | ✅ **Done** — `GET /admin/email-logs`, `/email-logs`; test `email-logs.test.ts` |
| 10 | Expiry milestones + default dated license | ⚠️ **Partial** — 90…1d milestones + provision default; BullMQ / owner email / tenant auto-suspend still open |

### Still open after plan 1–10 (not deferred)

- **Manual staging E2E** for all rows above (forgot-password mail off, provision without secret, suspend → PIN 403, offline double-flush, email log row, 7-day milestone bell).
- **`npm run test:saas-integration`** (POS) — not re-run in last verification.
- **Fix #8 remainder:** batch `POST /api/orders/sync`, `offlineSyncKey` on patch/pay, duplicate-order automated test.
- **Fix #10 remainder:** BullMQ per milestone; email to platform owners; `tenants.status` on expiry; license generate UI default term.
- **Section gaps unchanged:** Stripe, event bus, GRN/stock, NeDB/LAN offline, `STXI` keys, combined modules, Finance whitelabel, partial refund sync, custom roles UI, etc.

**Defer to later initiatives (large effort):** NeDB + LAN offline POS, full `STXI` license keys, Stripe billing, cross-product event bus, GRN/stock accounting bridge, combined module add/remove for accounting, Finance whitelabel injection, partial refund sync.

---

*Generated from static analysis of `apps/dashboard`, `apps/api`, `packages/db`, `infra/worker-service`, `services/posnew`, `services/stockix-finance`. **Plan fixes 1–10:** re-verified in repo May 2026 (code + named vitest/node tests). Re-run staging E2E before production commitments.*
