# POS Full Audit — Functionality + Integration + JWT

**Date:** 2026-05-24  
**Mode:** Read-only audit (source inspection; no code changes)  
**Scopes:** A — POS standalone · B — POS + Bigcapital · C — JWT architecture

---

## Section A — POS Standalone

### A1. Authentication

**Current**

POS tenant auth is **dual-path** in `tokenVerification.js`:

1. **Stockix product JWT** (Jose / `@repo/auth`) when `AUTH_TOKEN_SECRET` is set and `STOCKIX_JWT_ENABLED !== "0"`.
   - Verifies via `verifyStockixToken(token, AUTH_TOKEN_SECRET)`.
   - Requires `hasModule(payload, "pos")`.
   - Sets `req.stockix`, `req.tenantId`, `req.organizationIdFromToken`.
   - Does **not** set `req.user`.

2. **Legacy POS JWT** (jsonwebtoken) signed with `JWT_SECRET` (`config.accessTokenSecret`).
   - Audience `aud: "pos"` (`POS_AUD`).
   - Payload: `{ _id, organizationId?, aud }`.
   - Loads `User` from MongoDB; sets `req.user`.
   - Rejects platform tokens (`aud: "platform"`).

**Staff login** (`authController.js`):

| Method | Status | Notes |
|--------|--------|-------|
| **PIN** | Working | 4–6 digits, `pinLookup` HMAC (`PIN_LOOKUP_SECRET \|\| JWT_SECRET`), bcrypt compare, 3-attempt lockout (5 min). Optional subdomain scoping. |
| **Email + password** | Working | Requires subdomain org (`req.subdomainOrg`); scoped to `email + organization`. |
| **Token issue** | POS-owned | `issueTokenPair()` → access + refresh JWTs (`JWT_SECRET`, `JWT_REFRESH_SECRET`). |

**Platform vs tenant JWT**

| Token | Secret(s) | Audience | Purpose |
|-------|-----------|----------|---------|
| **Tenant staff** | `JWT_SECRET`, `JWT_REFRESH_SECRET` | `pos` | Waiter/cashier/kitchen PIN or password sessions |
| **Platform operator** | `PLATFORM_JWT_SECRET`, `PLATFORM_JWT_REFRESH_SECRET` | `platform` | Stockix platform admin / backoffice (`platformAuthTokens.js`) |
| **Stockix product** | `AUTH_TOKEN_SECRET` (shared with control plane) | Jose JWT modules claim | Cross-product license token; verify-only in POS today |

`@repo/auth` is linked in `pos-backend/package.json` (`file:../../../../packages/auth`).

**Gap**

- Stockix JWT is **accepted at the middleware layer** but **cannot drive normal tenant routes**: `authedTenant` stack calls `requireTenantOrganization()`, which requires `req.user.organization`. Stockix path never hydrates `req.user` → 403 for almost all POS API calls unless legacy POS JWT is used.
- No POS endpoint issues Stockix product tokens; staff always get POS JWT from PIN/password login.
- Email login **requires subdomain**; PIN can resolve org globally via `pinLookup` (with optional subdomain filter).

---

### A2. Tenant Isolation

**Current**

| Mechanism | How org is resolved |
|-----------|---------------------|
| **Primary** | Authenticated `User.organization` → `req.tenantOrganizationId` via `attachTenantOrganization` / `requireTenantOrganization` |
| **JWT claim check** | `organizationId` in token must match user's org when both present |
| **Subdomain (login only)** | `extractSubdomainOrg`: `{slug}.pos.zerowix.cloud` or `{slug}.localhost` → `Organization.findOne({ slug })` → `req.subdomainOrg` for PIN/password login scoping |
| **Per-request header** | Not used for org resolution on tenant API routes |
| **`TENANT_ID` env** | Set per tenant POS Docker stack during provision (`module-stacks.ts` passes `TENANT_ID: opts.tenantId`). Stored as `config.stockixTenantId` and on `Organization.stockixTenantId` — **control-plane UUID**, not used as primary API tenant filter |

All tenant data models use `organization` ObjectId + `orgScopePlugin`. Orders, tables, inventory filtered by `req.tenantOrganizationId`.

**Gap**

- Subdomain routing is for **login context**, not ongoing API tenancy (tenancy = user JWT + DB org).
- Stockix JWT carries `tenantId` / `organizationId` but is not wired into `req.tenantOrganizationId` without a User bridge.

---

### A3. Offline

**Current**

**Frontend (`offline-queue.ts`, `pos-check-sync.ts`, `sync-manager.tsx`)**

- IndexedDB store `pos-offline-db` / mutations.
- Kinds: `create_order`, `patch_order_items`, `inventory_adjust`.
- When offline or request fails → enqueue; `PosSyncManager` flushes every 15s + on `online` event.
- **Does not** queue payment, status change to `paid`, or bulk sync payloads.

**Backend**

- `POST /api/order/sync` (`syncOfflineOrders`): accepts batch (max 25) of full order payloads including `orderStatus: "paid"`, `paymentMethod`, `paymentSplits`, `offlineSyncKey` (idempotent).
- Paid offline replay: transaction → stock → native GL (`onOrderBecamePaid`) → `fireBigcapitalSync(order)`.

**Gap**

- Day-to-day offline UX covers **cart create/patch only**, not **pay-and-close offline** through the same queue.
- Full offline paid flow depends on a client calling `/api/order/sync` (not wired in `pos-check-sync.ts`).
- Offline does not cache menu/catalog/customers locally for browse-only offline.
- No offline Bigcapital void/replay coordination.

---

### A4. Receipt / Void / Refund

**Current**

| Capability | Status |
|------------|--------|
| Receipt print | `POST /api/order/:id/print` `{ type: "receipt", printerId }` |
| Receipt branding | Location + setup (`receiptLogo`, header/footer) |
| Item void (open check) | `patchOrderItems` removes lines; post-send void requires reason ≥3 chars; restores stock if deducted |
| Order void (unpaid) | `deleteOrder` — blocked if `paid`; restores stock for deducted lines |
| Edit after payment | Blocked — terminal statuses `paid` / `cancelled` reject line edits |
| Refund after payment | Admin-only `POST /api/accounting/refunds/:orderId` — native GL partial refund + optional COGS refund ratio |
| GL reversal | Manual `POST /api/accounting/reverse-order/:orderId` (sale + COGS reversal journals) |

**Behavior today — paid order**

1. Payment → `processStockAfterPayment` deducts ingredient stock (recipes/BOM).
2. `onOrderBecamePaid` posts native sale + COGS journals **unless** `AccountingConfig.bigcapitalIntegrationEnabled` (then skipped).
3. `fireBigcapitalSync` enqueues Finance receipt if integration enabled.
4. Order fields: `accountingSaleStatus`, `accountingCogsStatus`, `paidAt`.

**Behavior today — void**

- **Paid order cannot be void-deleted** (`Cannot delete a paid order`).
- Line voids on open checks restore POS stock via `restoreStockForOrderLine`.
- **No automatic** native GL reversal on void/cancel of paid order.
- **No automatic** Finance receipt void.

**Gap**

- No first-class “void paid receipt” POS workflow tying stock restore + GL reversal + Finance void.
- Refund is accounting-admin path, not standard cashier void.
- Re-edit after payment intentionally blocked (by design).

---

### A5. Floor / Tables / KDS

**Current**

| Area | Status |
|------|--------|
| **Tables** | `tableModel`: `tableNo`, `section`, `seats`, `floorAnchorX/Y` (0–1 floor map coords), `currentOrder`, status lifecycle |
| **Table transfer** | `transferOrder` — move open order to another table (transactional) |
| **Floor plan UI** | `pos-floor-page.tsx` consumes table positions |
| **Zones** | `zoneModel` — warehouse ops (receiving/picking/shipping), not dining sections |
| **Kitchen** | `getKitchenOrders` API (`/api/order/kitchen`); roles with `pos.kitchen.read` |
| **Kitchen modes** | `kitchenFlowMode`: `station_tickets` (print by station) or `kitchen_display` (mark in-progress, no print) |
| **KDS frontend** | Backend + RBAC exist; **no dedicated kitchen display page** found under `pos-frontend2/src/app` (query key `kitchenOrders` invalidated on socket events only) |

**Gap**

- Kitchen staff role exists but **KDS UI route appears missing/incomplete** in pos-frontend2.
- Dining “floor zones” are table `section` strings, not the warehouse Zone model.

---

### A6. Inventory

**Current**

- Stock deduction on **payment** (`processStockAfterPayment` → `deductForOrderLine`).
- Per-line `stockDeductedAt`; restore on cancel/void via reversing movements.
- `StockBalance` per location × ingredient; recipes link menu items → ingredients.
- Low stock: computed at deduction + `inventoryAlertService` (scheduled alerts, backoffice notifications).
- Reports: `GET /api/inventory/low-stock`, `/report`, `/report/valuation`, slow-moving, wastage.

**Gap**

- Low stock alerts are backoffice-oriented; no in-POS cashier push notification documented in frontend audit.
- Finance inventory is separate; POS→Finance sync does not push stock adjustments (sale receipt only).

---

## Section B — POS + Bigcapital Integration

### B1. Bridge status

| File | Status |
|------|--------|
| `models/integrationConfigModel.js` | ✅ Exists |
| `models/integrationItemMappingModel.js` | ✅ Exists |
| `services/bigcapitalSyncProcessor.js` | ✅ Exists |
| `services/bigcapitalSyncEnqueue.js` | ✅ Exists |
| `workers/bigcapitalSyncWorker.js` | ✅ Exists (`npm run worker:bigcapital`) |
| `routes/integrationRoute.js` | ✅ Exists |
| Finance `InternalPos.controller.ts` | ✅ Exists |
| Finance `InternalPosReceipts.service.ts` | ✅ Exists |

**Note:** The 2026-05-23 `POS_BIGCAPITAL_INTEGRATION_AUDIT.md` predates this bridge; **integration code is now present**.

**Flow (paid order)**

```
order → paid → fireBigcapitalSync()
  → BullMQ queue "bigcapital_sync" (Redis)
  → buildSaleReceiptPayload()
  → POST {internalBaseUrl}/api/internal/pos/receipts
     headers: x-internal-secret
     body: { tenantId: financeTenantId, payload }
```

Enabling integration via `PUT /integration/config` also sets `AccountingConfig.bigcapitalIntegrationEnabled = true`, which **disables native POS GL** posting for sale/COGS.

---

### B2. Void sync to Finance

**Current**

- Finance exposes `DELETE /api/internal/pos/receipts/by-reference/:referenceNo` → `voidByReference()` → `deleteSaleReceipt` (restores Finance inventory/GL via Bigcapital delete path).
- POS **has zero references** to void/delete Bigcapital receipt on order cancel, void, refund, or accounting reverse.

**Gap**

- Paid POS void/refund **does not** trigger Finance void.
- No BullMQ job type for void/reverse sync.
- Finance receipt keyed by `referenceNo = String(order._id)` — reversible, but POS never calls it.

---

### B3. Offline → Finance chain

**Current**

- `syncOfflineOrders`: if replayed payload has `orderStatus: "paid"`, runs payment pipeline and **`fireBigcapitalSync(order)`** ✅
- Chain: offline batch replay → paid → stock → (native GL skipped if integration on) → BullMQ → Finance receipt

**Gap**

- Frontend offline queue **does not** invoke `/api/order/sync`; only create/patch mutations.
- Offline paid-at-table requires separate client implementation.

---

### B4. Walk-in customer / accounts

**Current**

| Layer | Status |
|-------|--------|
| **Finance provision** | `seedFinancePosDefaults` → `POST /api/internal/tenants/:id/seed-pos-defaults` creates walk-in customer + cash/card deposit accounts when accounting+POS licensed |
| **Worker journal** | Persists `walkInCustomerId`, `cashAccountId`, `cardAccountId` in provision result |
| **POS IntegrationConfig** | Fields exist: `defaultWalkInCustomerId`, `defaultCashDepositAccountId`, `defaultCardDepositAccountId` |
| **Auto-populate POS config** | ❌ Provision seeds **Finance only**; does **not** write POS `IntegrationConfig` with those IDs |

**Gap**

- Operator must manually configure integration config (or future provision step) with Finance IDs + `financeTenantId` + `internalBaseUrl` + `internalSecret`.

---

### B5. Location → Warehouse mapping

**Current**

- `IntegrationConfig.bigcapital.locationMapping[]`: `{ posLocationId, bigcapitalBranchId, bigcapitalWarehouseId }`
- `defaultWarehouseId` fallback
- `bigcapitalSyncProcessor.resolveLocationMapping()` applies mapping per order location
- CRUD via `/integration/config/location-mapping`

**Gap**

- Not auto-seeded at provision; manual setup required.
- Unmapped location falls back to `defaultWarehouseId` only (branch optional).

---

### B6. Unmapped items behavior

**Current** (`buildMappedEntries` / `buildSaleReceiptPayload`)

1. Load mappings for order menu item IDs.
2. Lines without mapping get `itemId: null`.
3. `.filter((e) => e.itemId != null)` drops unmapped lines.
4. If **no mapped entries remain** → job returns `{ skipped: true, reason: "No mapped items in order — nothing to push" }` — **silent skip**, no operator notification.
5. No `defaultItemId` / generic fallback in model or processor.

**Gap**

- Burger with no mapping → **not synced**, no alert, order may show `accountingSaleStatus` unchanged or prior state.
- Partial orders sync **mapped lines only** (Finance receipt total ≠ POS total if mixed cart).

---

### B7. Service charge / discounts / multi-payment

**Current**

| Feature | Sync behavior |
|---------|---------------|
| **Multi-payment splits** | `resolveDepositAccountId()` picks **one** deposit account from largest split (or paymentMethod card/cash heuristic). Entire receipt uses single `depositAccountId`. |
| **Service charge** | Not included in Finance payload |
| **Discounts** | Hardcoded `discount: 0` on every entry; order-level discounts not mapped |
| **FX** | `exchangeRate` set when `order.documentCurrency` + `fxRateToCompany` present |

**Gap**

- Split payments not faithfully represented in Finance (single deposit account).
- Service charge and manual discounts cause **POS vs Finance total mismatch**.

---

### B8. Sync status visibility

**Current**

| Surface | Fields |
|---------|--------|
| **Order model** | `accountingSaleStatus` (`ok`/`failed`/`skipped`), `accountingSaleError` — reused for Bigcapital sync outcome |
| **IntegrationConfig** | `syncStatus`, `lastSyncedAt`, `lastSyncError` (org-level, not per-order) |
| **API** | `GET /integration/sync/status`, `POST /integration/sync/replay/:orderId` |
| **POS frontend** | **No UI** references to `accountingSaleStatus`, `syncStatus`, or Bigcapital (grep clean) |

**Gap**

- Operators cannot see per-order Finance sync state in POS UI.
- Org-level `syncStatus` overwrites on each job (not per-order queue visibility).

---

## Section C — JWT Architecture

### C1. Per-product JWT reality

| Product | Auth type | Secret name(s) | Issues own token? | Uses `@repo/auth`? |
|---------|-----------|----------------|-------------------|-------------------|
| **Stockix control plane** | HMAC session + product JWT | `AUTH_TOKEN_SECRET` (fallback `SESSION_SECRET`) | Yes — owner session (`tokens.ts` HMAC); product token (`signStockixToken`) | Yes — sign/verify product tokens |
| **Finance (tenant staff)** | NestJS JWT | `APP_JWT_SECRET` | Yes — tenant user sessions | No |
| **Finance (internal S2S)** | Shared secret header | `INTERNAL_API_SECRET` | No | No |
| **POS (tenant staff)** | POS JWT + PIN | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PIN_LOOKUP_SECRET` | Yes — PIN/password → POS JWT | Partial — verify Stockix only |
| **POS (platform)** | Platform JWT | `PLATFORM_JWT_SECRET`, `PLATFORM_JWT_REFRESH_SECRET` | Yes | No |
| **POS (Stockix verify)** | Product JWT verify | `AUTH_TOKEN_SECRET` | No (verify only) | Yes |
| **PMS** | Stockix JWT | `AUTH_TOKEN_SECRET` via `apiConfig.authTokenSecret` | No | Yes — `createHonoAuthMiddleware` |
| **Chatwoot** | Devise Token Auth | Rails `secret_key_base` (standard Devise) | Yes | No |

**`@repo/auth` usage (files, excl. node_modules)**

- `packages/auth/src/index.ts` — library
- `apps/api/src/services/auth/stockix-product-token.ts` — issuer
- `services/pms/src/index.ts` — consumer
- `services/posnew/apps/pos-backend/middlewares/tokenVerification.js` — consumer (verify)
- `services/posnew/apps/pos-backend/middlewares/verifyStockixJWT.js` — consumer (verify)

---

### C2. Decision: should POS staff use Stockix JWT?

**Analysis**

- **PIN login** is optimized for shared devices, speed, and offline-tolerant staff UX; it correctly issues short-lived **POS-scoped** JWTs bound to a MongoDB `User` with RBAC, location scope, and audit trails.
- **Stockix product JWT** encodes **license modules** and **tenantId** for cross-product navigation (dashboard → POS) but lacks POS-native fields (Mongo user id, location assignments, POS role permissions matrix).
- Current Stockix verify path **does not hydrate `req.user`**, so migrating staff to Stockix JWT without a bridge breaks the entire `authedTenant` stack.
- PMS pattern (Stockix JWT only, no local user table for auth) differs from POS (rich local User model).

**Recommendation**

**Do not replace PIN/ POS JWT for floor staff.** Keep POS-issued tenant JWT as the operational auth mechanism.

**Do** use Stockix JWT for:
- Cross-product SSO from Stockix dashboard (embed/link into POS) — with a **bridge middleware** that maps `payload.userId` → POS `User` or a synthetic service user.
- Service-to-service calls (already platform API key pattern exists).

Optional: issue Stockix product token **in addition to** POS JWT on login for dashboard handoff, not as replacement.

---

### C3. What `@repo/auth` covers today vs what it should

| Today | Should cover (target) |
|-------|----------------------|
| `verifyStockixToken`, `signStockixToken`, `hasModule`, `hasRole` | Same |
| Express + Hono middleware factories | Same + **Express bridge** that resolves POS User from Stockix claims |
| Module licensing (`pos`, `accounting`, `pms`, `chat`) | Same |
| No POS token issuance | Optional: unified product token refresh from control plane |
| No PIN/password flows | Out of scope — product-specific |

---

## Gap Priority List

| Gap | Scope | Severity | Impact |
|-----|-------|----------|--------|
| Stockix JWT accepted but no `req.user` bridge | A / C | **Critical** | Stockix SSO into POS tenant API non-functional |
| No Finance void on POS void/refund/cancel | B | **Critical** | Paid void leaves orphan Finance receipt + wrong inventory/GL |
| IntegrationConfig not auto-filled at provision | B | **High** | Manual setup friction; sync silently disabled |
| Unmapped items skipped silently | B | **High** | Revenue/inventory drift; no operator warning |
| Offline queue lacks pay-and-close | A / B | **High** | Offline paid sales don't reach Finance via normal UX |
| Service charge / discounts not synced | B | **High** | Finance totals ≠ POS totals |
| Multi-payment → single deposit account | B | **Medium** | Incorrect cash/card GL in Finance |
| No KDS frontend page | A | **Medium** | Kitchen role cannot use display workflow in UI |
| No per-order sync status in POS UI | B | **Medium** | Support blind to failed Finance pushes |
| No auto GL reversal on paid void | A | **Medium** | Native books wrong if integration off and manual reverse missed |

---

## Behavior Today (step by step)

### Scenario: Sell 1 burger, pay, void it

**Assumptions:** Burger mapped in `IntegrationItemMapping`; Bigcapital integration enabled; native GL disabled.

| Step | POS | Finance |
|------|-----|---------|
| 1. Add burger, pay | Order → `paid`; stock deducted; `fireBigcapitalSync` enqueued | — |
| 2. Sync job runs | `accountingSaleStatus: ok` | Sale receipt created (`referenceNo = orderId`), inventory reduced, GL posted |
| 3. Attempt void in POS | **Blocked** — cannot delete paid order; no standard void-paid action | Receipt remains |
| 4. Admin reverse (optional) | Manual `POST /accounting/reverse-order/:id` reverses **native** journals only (skipped if integration on) | **No change** — receipt still open |
| 5. Refund (optional) | Admin `POST /accounting/refunds/:id` — native partial refund GL | **No change** |

**Gap:** End-to-end void breaks at step 3–4; Finance receipt orphaned unless manually deleted in Finance UI.

---

### Scenario: Offline sale, reconnect

**Path A — Frontend offline queue (current default UX)**

| Step | What happens |
|------|--------------|
| 1 | Offline: `create_order` / `patch_order_items` queued in IndexedDB |
| 2 | Reconnect: `flushOfflineMutationQueue` replays create/patch |
| 3 | User pays online separately | Normal paid flow + Finance sync ✅ |
| 4 | User pays while offline | **Not queued** by pos-check-sync — payment lost unless custom client calls `/api/order/sync` |

**Path B — Bulk offline sync API**

| Step | What happens |
|------|--------------|
| 1 | Client saves order with `offlineSyncKey`, `orderStatus: "paid"` |
| 2 | `POST /api/order/sync` replays batch | 
| 3 | Stock + GL + `fireBigcapitalSync` | Finance receipt if mapped ✅ |

**Gap:** Default offline UX does not complete paid offline sale → Finance chain without additional client work.

---

## Final Verdict

| Question | Answer |
|----------|--------|
| **POS standalone ready** | **YES** (with caveats) — core F&B POS, inventory, native GL, floor, payments, refunds (admin), kitchen API work. Gaps: KDS UI, paid-void workflow, offline pay path. |
| **POS + Finance integration ready** | **NO** — sale push works when configured; void/refund sync, discount/charge fidelity, provision auto-config, and operator visibility are incomplete. |
| **JWT architecture consistent** | **NO** — three parallel systems (POS JWT, platform JWT, Stockix product JWT); POS verifies Stockix but cannot operate tenant API with it. |

### Top 3 things to fix first

1. **Finance void sync** — On POS paid cancel/refund/reverse, call `DELETE /api/internal/pos/receipts/by-reference/:orderId` (BullMQ job + idempotency).
2. **Stockix JWT → POS User bridge** — Map Stockix token to `req.user` / `req.tenantOrganizationId` OR document POS JWT as the only supported staff path and remove half-migrated verify path from tenant stacks.
3. **Provision → IntegrationConfig wiring** — After `seedFinancePosDefaults`, write POS `IntegrationConfig` with `financeTenantId`, walk-in customer, deposit accounts, `internalBaseUrl`, and enable flag when accounting+POS licensed.

---

## Appendix — Secret names quick reference

```
Stockix control plane:  AUTH_TOKEN_SECRET, SESSION_SECRET
POS tenant staff:       JWT_SECRET, JWT_REFRESH_SECRET, PIN_LOOKUP_SECRET
POS platform:           PLATFORM_JWT_SECRET, PLATFORM_JWT_REFRESH_SECRET
POS Stockix verify:     AUTH_TOKEN_SECRET (same as control plane)
Finance tenant:         APP_JWT_SECRET
Finance internal:       INTERNAL_API_SECRET  (header: x-internal-secret)
PMS:                    AUTH_TOKEN_SECRET (via @repo/config)
Chatwoot:               secret_key_base (Rails / Devise)
```
