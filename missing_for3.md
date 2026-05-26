# Stockix SaaS Owner Dashboard — Broken / Partial / Missing Audit

**Scope:** Owner dashboard (`apps/dashboard`, `apps/api`), POS (`services/posnew`), Accounting (`services/stockix-finance`), provisioning (`infra/worker-service`, `infra/tenant-stack`).

**Method:** Static code audit (May 2026). **Only open and partial gaps are listed below** — completed work is summarized in [Completed work](#completed-work-may-2026) (not repeated as individual bullets).

**Last implementation review:** May 2026 — plan fixes **1–10**, Section **1.1–1.4** repair, Section **2.1** provisioning repair. Code verified in repo; **staging manual E2E not signed off** unless a row says otherwise.

### Completed work (May 2026) {#completed-work-may-2026}

| Area | Reference |
|------|-----------|
| Owner dashboard core §1.1–1.4 | [docs/section-1-e2e-checklist.md](docs/section-1-e2e-checklist.md), [docs/PROVISIONING_REFERENCE.md](docs/PROVISIONING_REFERENCE.md) |
| POS provisioning §2.1 | [docs/section-2.1-e2e-checklist.md](docs/section-2.1-e2e-checklist.md) |
| Plan fixes 1–7, 9–10 | [Recommended Fix Order](#recommended-fix-order) table |
| STXI license keys (control plane + POS validate) | `@repo/shared/stxi-license-key`, `stxiLicenseValidate.js`, migrations `0046` |
| Custom roles + dashboard RBAC | `platform_roles`, `/settings/roles`, `rbac.test.ts` |
| Owner invite email durable queue (BullMQ) | `owner-invite-mail-queue.ts`, `owner-invite-delivery.ts`, `CONTROL_PLANE_REDIS_URL` |
| POS §2.5 inventory & stock | `offline-stock-mirror.ts`, `adjustInventoryWithOfflineSupport`, stock-take serial guard, `mdfiles/offline-inventory.md` |

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
| 4 | `readyForPinLogin` requires `lifecycle === "active"` | ✅ | ✅ `organization-provisioning-status.test.js` | ⚠️ Not signed off | `platformOrgController.js`; §2.1 also covers peek/consume PIN flow. |
| 5 | Dashboard license suspend / reactivate | ✅ | ⚠️ `apps/api/tests/license-suspend.test.ts` (1 case timed out at 5s) | ⚠️ Not signed off | Proxies: `apps/dashboard/app/api/licenses/[licenseId]/suspend|reactivate/`. UI: license detail header. Optional tenant panel actions **not** added. |
| 6 | Tenant suspend → Finance license + POS org | ✅ | ✅ `apps/api/tests/tenant-suspend-license-sync.test.ts` | ⚠️ Not signed off | `apps/api/src/tenant-license-lifecycle.ts` + `POST /tenants/:id/suspend|reactivate`. Docker stop still separate (by design). |
| 7 | POS credentials reset-only UX | ✅ | ✅ `pos-credentials-http.test.ts` (`masked`) | ⚠️ Not signed off | `tenant-pos-credentials.tsx`; bootstrap PINs via `TenantPosBootstrapBanner` (§2.1). No post-bootstrap plaintext reveal (intentional). |
| 8 | POS offline `offlineSyncKey` idempotency | ⚠️ Partial | 🔲 No duplicate-order test | 🔲 Not signed off | Create path: `makeOfflineSyncKey()` → `posCreateOrder` / `addOrder` dedupe. **Not** using batch `POST /api/orders/sync` for flush; patch/pay queue **without** key. |
| 9 | Email log API + dashboard page | ✅ | ✅ `apps/api/tests/email-logs.test.ts` | ⚠️ Not signed off | `GET /admin/email-logs` + `/email-logs` page. Resend webhook still needs ops config. |
| 10 | Expiry milestones + default dated license | ✅ | ✅ `license-expiry-milestones.test.ts`, `license-expiry-email.test.ts` | ⚠️ Not signed off | Milestones **90/60/30/15/7/3/2/1**; owner email to assigned `ownerId`; tenant auto-suspend after grace; BullMQ when Redis configured. Generate UI defaults fixed term; perpetual still selectable. |

**Deferred (large initiatives):** Stripe billing, event bus, GRN/stock bridge, NeDB/LAN offline, combined module add/remove, Finance whitelabel, partial refund sync — not in plan 1–10 / §2.1 scope.

---

## SECTION 1 — SAAS OWNER DASHBOARD CORE

**§1.1–1.4:** Implemented — see [Completed work](#completed-work-may-2026). Ops: migrations `0044`–`0046`, optional `CONTROL_PLANE_REDIS_URL`. **Manual E2E:** [docs/section-1-e2e-checklist.md](docs/section-1-e2e-checklist.md) (not signed off).

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

**§2.1:** Implemented in repo — see [Completed work](#completed-work-may-2026) and [docs/section-2.1-e2e-checklist.md](docs/section-2.1-e2e-checklist.md). Tests: `organization-provisioning-status.test.js`, `bootstrap-credential-reveal.test.js`, `bootstrap-pos-org.test.ts`, `pos-entitlements-from-modules.test.ts`, `pos-credentials-http.test.ts`.

**Remaining:** staging **manual E2E sign-off** only (Phases 0–4 in checklist). No open code gaps listed here.

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

**Lifecycle block (plan #3):** Done — see [Completed work](#completed-work-may-2026). **Manual E2E / `test:saas-integration`:** not signed off.

⚠️ **License suspend → POS org lifecycle** — Dashboard/license API path uses `pos-license-sync` + `applyTenantLicenseSuspend` (sets POS org lifecycle). **Staging verify** recommended; async sync can still fail non-fatally unless `LICENSE_SYNC_STRICT=1`.

PRIORITY: High  
EFFORT: Low — **verify in staging**

⚠️ **STXI key vs date-only enforcement** — `stxiLicenseValidate.js` on login/middleware when org has `licenseKey` + `LICENSE_SIGNING_SECRET`; legacy orgs may still rely on `licenseStartsAt` / `licenseEndsAt` only. **Not** full “startup gate” for all tenants; location mismatch / checksum failures need E2E.

PRIORITY: Medium  
EFFORT: Medium — **partial**

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

**Finance license sync (plan #1):** Done — see [Completed work](#completed-work-may-2026).

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

**Tenant suspend + Finance + POS (plan #6):** Done — see [Completed work](#completed-work-may-2026). **Manual E2E:** not signed off.

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

⚠️ **License suspend/reactivate syncs Finance + POS when API used** — Async, non-fatal on failure unless `LICENSE_SYNC_STRICT=1` (`license-http.ts`, `pos-license-sync.js`). Dashboard UI done (plan #5). **Staging verify** Finance guard + POS PIN block.

PRIORITY: High  
EFFORT: Low — **verify in staging**

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

**`email_logs` UI (plan #9):** Done — see [Completed work](#completed-work-may-2026).

⚠️ **Delivery status via Resend webhook** — `apps/api/src/routes/webhooks/resend.ts` requires ops configuration.

PRIORITY: Medium  
EFFORT: Low

---

## Summary Table

Open and partial gaps only (completed items: [Completed work](#completed-work-may-2026)).

| # | Area | Status | Priority |
|---|------|--------|----------|
| 1 | Stripe / owner SaaS billing | 🔲 Missing | Critical |
| 2 | Plan change / upgrade-downgrade | 🔲 Missing | Critical |
| 3 | Failed payment / dunning | 🔲 Missing | Critical |
| 4 | Cross-product event bus / `originatedBy` | 🔲 Missing | High |
| 5 | GRN / stock → Finance accounting | 🔲 Missing | High |
| 6 | Combined module upgrade/downgrade | 🔲 Missing | High |
| 7 | POS multi-org ↔ Finance multi-org | 🔲 Missing | High |
| 8 | `tenant_config` whitelabel → Finance UI | 🔲 Missing | High |
| 9 | Partial refund → Finance adjustment | ❌ Broken | High |
| 10 | `offlineSyncKey` / orders sync idempotency | ⚠️ Partial (create only) | High |
| 11 | PIN login offline / NeDB / LAN POS | 🔲 Missing | High |
| 12 | Deferred accounting + print offline | 🔲 / ⚠️ Partial | High |
| 13 | Invite durable mail queue | ⚠️ Partial | Medium |
| 14 | STXI enforcement E2E (all tenants/locations) | ⚠️ Partial | Medium |
| 15 | `defaultCredentials` on tenant staff PIN change | ⚠️ Partial (§2.2) | Medium |
| 16 | Visual floor plan + VIP on POS floor | ⚠️ Partial | Medium / Low |
| 17 | Plan display (no Stripe invoices) | ⚠️ Partial | High |
| 18 | Resend webhook / delivery status | ⚠️ Partial | Medium |
| 19 | Combined bundle `partial` / wire retry | ⚠️ Partial | High |
| 20 | Staging E2E (§1 + §2.1 checklists) | ⚠️ Not signed off | High |

---

## Recommended Fix Order {#recommended-fix-order}

**Plan fixes 1–10 and §2.1:** code complete — see [Plan fixes 1–10](#plan-fixes-110--status) and [Completed work](#completed-work-may-2026).

### Verification backlog (do before prod)

- [ ] [docs/section-1-e2e-checklist.md](docs/section-1-e2e-checklist.md) — all phases
- [ ] [docs/section-2.1-e2e-checklist.md](docs/section-2.1-e2e-checklist.md) — provisioning Phases 0–4
- [ ] `npm run test:saas-integration` (POS) — not re-run in last repo verification
- [ ] Migrations `0044`–`0046` + `CONTROL_PLANE_REDIS_URL` on target env ([infra/prod/OPERATIONS.md](infra/prod/OPERATIONS.md))

### Next engineering priorities (open gaps)

| Priority | Item |
|----------|------|
| Critical | Stripe billing + plan change + failed payment (§1.5) |
| High | Offline POS (NeDB/LAN), `offlineSyncKey` remainder (§2.7), partial refund sync (§4.2) |
| High | Event bus, GRN/stock bridge, combined module add/remove (§4) |
| Medium | Invite mail queue (§1.1), staff PIN → `defaultCredentials` (§2.2), Finance whitelabel (§3.4) |

**Defer (large):** Full offline POS stack, cross-product event bus, GRN accounting bridge, Stripe — track in Summary Table above.

---

*Last updated May 2026 after §2.1 provisioning repair. Re-run staging E2E before production commitments.*
