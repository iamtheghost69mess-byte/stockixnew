# POS + Accounting Integration Audit

**Date:** 2026-05-30  
**Platform:** Stockix (control plane + Stockix Finance / BigCapital fork + POS)  
**Reverse Proxy:** Traefik v3.4 (edge TLS) + per-tenant Nginx (HTTP upstream)  
**Database Strategy:** Hybrid — shared Postgres control plane; per-tenant Finance stack (MySQL database-per-org + shared Mongo for jobs); separate per-tenant POS MongoDB  
**Audited by:** Cursor AI

---

## 🚨 Critical Blockers (must fix before production)

1. **POS subdomain routing mismatch** — Traefik/provisioning routes POS at `{slug}-pos.{ROOT_DOMAIN}` (`infra/worker-service/domain/traefik-config.ts:100-106`, `infra/worker-service/src/module-stacks.ts:244`) but POS backend resolves orgs only from `{slug}.pos.zerowix.cloud` hardcoded (`services/posnew/apps/pos-backend/middlewares/extractSubdomainOrg.js:4-29`). On Stockix-hosted tenants, subdomain-based org resolution likely fails unless hostname matches the legacy pattern.

2. **Two inventory sources of truth in combined mode** — POS deducts ingredient stock locally on payment (`services/posnew/apps/pos-backend/controllers/orderController.js:537+` via `inventoryService.js`); Finance updates inventory only for mapped **menu→Finance item** on closed sale receipts (`services/stockix-finance/packages/server/src/modules/SaleReceipts/commands/SaleReceiptWriteInventoryTransactions.ts:21-33`). Recipe/ingredient quantities are not synced to Finance on each sale.

3. **Multi-currency FX dropped at Finance boundary** — POS sends `exchangeRate` in receipt payload (`services/posnew/apps/pos-backend/services/bigcapitalSyncProcessor.js:307-310`) but Finance internal DTO has no `exchangeRate` field (`services/stockix-finance/packages/server/src/modules/Internal/dtos/InternalPosReceipt.dto.ts:55-96`) and `mapPayloadToDto` omits it (`InternalPosReceipts.service.ts:75-95`). Combined-mode FX posting is effectively broken.

4. **Customer sync missing** — All synced receipts use `defaultWalkInCustomerId`; order customer is never mapped (`bigcapitalSyncProcessor.js:298`, `integrationConfigModel.js:16`). No `IntegrationCustomerMapping` model found in POS codebase.

5. **On-account (AR) sales not synced to Finance** — POS creates local invoices for on-account billing (`accountingController.js:1153-1164`); BigCapital bridge always posts **Sale Receipts** only. No `POST /api/internal/pos/invoices` endpoint (`InternalPos.controller.ts:40-95`).

6. **Finance webapp `organization-id` header likely broken** — Axios interceptor reads `state.authentication.organization` (`services/stockix-finance/packages/webapp/src/services/axios.tsx:62-70`) but reducer only stores `organizationId` (`authentication.reducer.tsx:13,67-71`). `withCurrentOrganization.tsx:11` also references nonexistent `organization` field.

7. **POS proxy API routes lack module licensing guard** — Only `/pos/tenant-org` checks `assertTenantModuleLicensed` (`apps/api/src/routes/pos-proxy-http.ts:27-28`); `/pos/organizations` and other routes are unguarded (`:34-47`).

8. **No admin email on Finance sync failure** — Failures update Mongo + in-app backoffice notification for unmapped items only (`bigcapitalSyncProcessor.js:15-43`, `:524-542`); no email/webhook alert to platform admin on sync failure.

9. **Tax lines not mapped POS→Finance** — `buildSaleReceiptPayload` has no tax bucket mapping (`bigcapitalSyncProcessor.js:297-305`); location VAT config in POS (`locationModel.js:41-49`) is not synced.

10. **Finance user invitation email** — Code path exists (`InviteSendMailNotification.subscriber.ts:29-50`, `SendInviteUserMail.processor.ts:25-36`) but requires per-tenant `MAIL_*` SMTP (`services/stockix-finance/packages/server/src/loaders/mail.ts:5-13`). Documented as broken in `prompt2.md:183` (never reaches SMTP in practice).

---

## 1. Infrastructure

### 1.1 Reverse proxy

| Item | Finding | Reference |
|------|---------|-----------|
| Edge proxy | **Traefik v3.4** | `infra/prod/docker-compose.yml:131-168` |
| Per-tenant proxy | **Nginx** (HTTP only; Traefik terminates TLS) | `infra/tenant-stack/docker-compose.yml:7-14`, `services/stockix-finance/docker/nginx/sites/server.template:14-32` |
| Caddy | **NOT FOUND** in repo | Searched `infra/`, `services/` |
| Standalone POS prod | Host **Nginx** + Cloudflare Origin Certificate (separate from Stockix Traefik stack) | `services/posnew/docker-compose.production.yml:4-5`, `services/posnew/deploy/nginx/zerowix.conf` |

**Subdomain routing per tenant:**

| Product | Host pattern | Config writer |
|---------|--------------|---------------|
| Accounting (Finance) | `{slug}.{ROOT_DOMAIN}` | `infra/worker-service/domain/traefik-config.ts:62-67` |
| POS frontend | `{slug}-pos.{ROOT_DOMAIN}` | `traefik-config.ts:100-106` |
| POS API | `{slug}-pos-api.{ROOT_DOMAIN}` | `traefik-config.ts:107-113` |
| Control-plane dashboard | `{ROOT_DOMAIN}`, `www.{ROOT_DOMAIN}` | `infra/prod/docker-compose.yml:404-408` |
| Control-plane API | `api.{ROOT_DOMAIN}` | `infra/prod/docker-compose.yml:265-271` |

**Wildcard SSL:** Traefik ACME DNS-01 via Cloudflare; dashboard router declares SAN `*.${ROOT_DOMAIN}` (`docker-compose.yml:407-408`). Tenant routers use `certResolver: cloudflare` per host rule (`traefik-config.ts:66-67`).

**Dynamic updates (no restart):** Worker writes YAML files to `TRAEFIK_DYNAMIC_DIR` (`traefik-config.ts:74`, `provision-runtime.ts` via worker env `infra/prod/docker-compose.yml:72`). Traefik file provider has `watch=true` (`docker-compose.yml:155-156`). **No Traefik restart required** for new tenants.

**Hardcoded domains:**

| Domain | Location | Impact |
|--------|----------|--------|
| `pos.zerowix.cloud` | `extractSubdomainOrg.js:4-5` | 🚨 POS org resolution tied to legacy host, not `{slug}-pos.{ROOT_DOMAIN}` |
| `localhost` fallback | `apps/api/src/lib/organization-domain.ts:3-9` | Dev only |

### 1.2 Docker / deployment

**No root `docker-compose.yml` or `docker-compose.prod.yml`.** Canonical files:

| File | Services |
|------|----------|
| `infra/prod/docker-compose.yml` | socket-proxy, traefik, postgres, control-plane-redis, api, api-bullmq, infra-worker, dashboard, db-backup |
| `infra/prod/docker-compose.chat.yml` (optional) | chatwoot, chatwoot-postgres, chatwoot-redis |
| `infra/tenant-stack/docker-compose.yml` | nginx, webapp, server, database_migration, mysql, mongo, redis |
| `infra/pos-tenant-stack/docker-compose.yml` | pos-backend, pos-platform-worker, pos-bigcapital-worker, pos-frontend, pos-mongo, pos-mongo-init, pos-redis |
| `services/stockix-finance/docker-compose.prod.yml` | nginx, webapp, server, database_migration, mysql, mongo, redis |
| `services/stockix-finance/docker-compose.yml` (dev) | mariadb, redis, gotenberg |

**POS vs Accounting containers:** **Separate.** Accounting = Finance tenant stack (`infra/tenant-stack/`). POS = dedicated stack (`infra/pos-tenant-stack/`). Combined tenants run **both** stacks; wired at provision time (`provision-runtime.ts:2499-2533`).

**Production env injection:** Explicit Compose env anchors in `infra/prod/docker-compose.yml:17-85`; sourced from `infra/prod/.env` (`docker-compose.yml:3-8`). Worker also mounts tenant env under `TENANT_ENV_ROOT` (`docker-compose.yml:69`). `STOCKIX_LOAD_ROOT_ENV: "0"` prevents container from reading repo-root `.env` (`docker-compose.yml:64`).

**`.env.example` coverage:**

| File | Scope |
|------|-------|
| `.env.example` (repo root) | Canonical schema; references `docs/envexplanation.md` (`:1-13`) |
| `infra/prod/.env.example` | Production control plane |
| `apps/api/.env.example` | API (note: runtime prefers repo root per root `.env.example:8`) |
| `services/stockix-finance/.env.example`, `packages/server/.env.example` | Finance tenant stack |
| `services/posnew/apps/pos-backend/.env.example` | POS backend |

❓ UNKNOWN whether every production-required var is documented — see also `docs/env-missing.md`, `docs/ENV_REFERENCE.md`.

### 1.3 Database architecture

| Layer | Engine | Scope | Decision point |
|-------|--------|-------|----------------|
| Control plane | Postgres `stockix_platform` | Shared all tenants | `packages/db/src/schema.ts:74-212`, `infra/prod/docker-compose.yml:183-191` |
| Finance system DB | MySQL `stockix_system` | Per tenant stack | `infra/worker-service/domain/provisioning/tenant-env.ts:81` |
| Finance tenant data | MySQL `stockix_tenant_{organizationId}` | **Database-per-org** inside stack | `TenantDBManager.ts:34-35` |
| Finance jobs | MongoDB `stockix` | Per tenant stack (Agenda) | `infra/tenant-stack/docker-compose.yml:131`, `mongoose.ts:6-8` |
| POS | MongoDB `pos` (default) | Per tenant stack; org-scoped via `organization` field | `infra/pos-tenant-stack/docker-compose.yml:21`, `orgScopePlugin.js:5-27` |

**POS uses a separate DB from Accounting** — no shared Mongo/MySQL between products (`infra/pos-tenant-stack/docker-compose.yml:134-149` vs `infra/tenant-stack/docker-compose.yml:234-246`).

**Connection string per tenant:** Stored in `tenant_deployments` at provision time (`packages/db/src/schema.ts:175-212`, `provision-runtime.ts:793`). POS: `MONGODB_URI=mongodb://pos-mongo:27017/${POS_DB_NAME}?replicaSet=rs0` (`pos-tenant-stack/docker-compose.yml:21`). Finance: generated in `tenant-env.ts:87-91`.

---

## 2. Multi-Organization Handling

### 2.1 How multi-org works today

| Layer | Model | Key fields | Reference |
|-------|-------|------------|-----------|
| Control plane | `organizations` | `tenantId`, `slug`, `subdomain`, `isPrimary`, `financeOrganizationId`, `posOrganizationId` | `packages/db/src/schema.ts:107-128` |
| Control plane | `tenants` | License holder; `modules` JSON | `schema.ts:74-105` |
| Finance | `user_tenants` + `tenants` (MySQL) | Multi-org single login | `20260516000000_create_user_tenants_table.js:1-34`, `TenantModel.ts:6-21` |
| POS | Mongo `Organization` | `stockixTenantId`, optional `parentOrganization` | `organizationModel.js:11-133` |

**Orgs per account:** Limited by plan `maxOrganizations` (`schema.ts:360`, `plan-limits.ts:65-86`). Default plan seed sets `max_organizations: 1` (`ensure-default-plans.ts:28-37`).

**Org switcher UI:** ✅ Control-plane dashboard (`apps/dashboard/components/org-switcher.tsx:67-355`); ✅ Finance sidebar (`SidebarHead.tsx:45-101`).

**Subdomain per org:** ✅ `{slug}.{ROOT_DOMAIN}` on create (`apps/api/src/routes/tenants.ts:1882-1895`).

**Data isolation:** ✅ Control plane by `tenantId` + RBAC (`tenants.ts:1770-1785`); ✅ Finance by `organization-id` header + JWT (`TenancyGlobal.guard.ts:37-90`); ✅ POS by `orgScopePlugin` + JWT org claim (`orgScopePlugin.js:5-27`, `tenancyScope.js:8-29`).

**User in multiple orgs:** ✅ Finance via `user_tenants` (`TenancyGlobal.guard.ts:63-72`); ✅ Control plane via `owner_organization_access` for support agents (`schema.ts:130-151`).

**Active org resolution:**

| App | Mechanism | Reference |
|-----|-----------|-----------|
| Control plane | Session cookie `stockix-session` → owner only; **no active org in session** | `apps/api/src/middleware/auth.ts:100-157` |
| Finance | `organization-id` header + JWT `organizationId` must match | `TenancyGlobal.guard.ts:37-87` |
| Finance switch | `POST /auth/switch-tenant` | `SwitchTenant.service.ts:21-48` |
| POS | Subdomain slug → Mongo org; JWT `organizationId` | `extractSubdomainOrg.js:32-48`, `tokenVerification.js:23-67` |

### 2.2 Accounting org adding POS

**Flow exists:** Dashboard → `POST /tenants/:id/add-module` (`tenant-modules-panel.tsx:55-62`) → job `add_module` (`tenant-modules.ts:57-127`) → worker `executeAddModuleRuntime` (`provision-runtime.ts:2408-2533`).

When accounting already present and `pos` added:
1. Seeds Finance POS defaults (warehouses, walk-in customer, deposit accounts) — `provision-runtime.ts:2415-2420`
2. Provisions POS stack — `runPosProvisionStep` (`provision-runtime.ts:101-174`)
3. Wires BigCapital↔POS integration — `runWirePosIntegrationStep` (`provision-runtime.ts:2499-2533`)

**Subdomain strategy for add-POS:** POS gets **separate** subdomain `{slug}-pos.{domain}`, not same subdomain as accounting (`traefik-config.ts:100-106`, `module-stacks.ts:244`). Accounting stays at `{slug}.{domain}`.

**Non-primary sub-orgs:** Combined POS provisioned for child orgs (`org-provision-runtime.ts:405-433`); primary org skips combined POS (`:407-408`).

### 2.3 Org → module mapping

| Store | Field | Values |
|-------|-------|--------|
| `tenants.modules` | JSON text | `["accounting","pos",...]` | `schema.ts:91-92` |
| `licenses.modules` | JSON text | Same shape | `schema.ts:393-394` |
| JWT | `modules[]` | `StockixModule` union | `packages/auth/src/index.ts:3-7` |

**API enforcement:** ✅ `assertTenantModuleLicensed` (`tenant-module-access.ts:19-73`) on POS credentials, finance-users, integration-bridge, PMS proxy. ⚠️ Partial on POS proxy (see Critical #7).

**Frontend enforcement:** ⚠️ Component-level only in dashboard (e.g. `tenant-pos-credentials.tsx`); no route middleware (`apps/dashboard/app/(dashboard)/pos/layout.tsx:7-9`). Finance: auth + org readiness guards only (`PrivatePages.tsx:24-47`); **no module guard**.

**Manual navigation to unlicensed module URL:** POS returns 403 `module_not_licensed` if JWT lacks `pos` (`tokenVerification.js:27-32`). Control-plane POS proxy may still respond on unguarded routes. Finance module licensing not checked per-request on Nest guards — ❓ UNKNOWN enforcement beyond subscription sync at provision.

---

## 3. Combined Mode: Single Source of Truth

**Design intent (documented):** Finance is system of record when `bigcapitalIntegrationEnabled` (`apps/dashboard/lib/tenant-modules.ts:45-52`).

### 3.1 Receipts & Invoices

| Question | Answer | Reference |
|----------|--------|-----------|
| POS sale → Finance record? | ✅ Yes — **Sale Receipt** (cash/immediate) | `orderController.js:57-60`, `bigcapitalSyncProcessor.js:322-344` |
| Mechanism | Mongo outbox + BullMQ `bigcapital_sync` → HTTP `POST /api/internal/pos/receipts` | `accountingIntegrationOutbox.js:26-69`, `InternalPos.controller.ts:40-44` |
| Real-time vs batch | Async near-real-time (queue); not synchronous with payment response | `accountingIntegrationOutbox.js:63-69` |
| Receipt matches invoice? | N/A for receipts; on-account uses local POS invoice only | `accountingController.js:1153-1164` |
| Sync failure retry? | ✅ BullMQ 5 attempts, exponential backoff 10s | `accountingIntegrationOutbox.js:63-66` |
| Accountant sees POS receipts? | ✅ In Finance as closed sale receipts with `referenceNo = order._id` | `InternalPosReceipts.service.ts:120-150` |
| Void/refund sync? | ✅ DELETE by reference; PATCH partial refund | `bigcapitalSyncProcessor.js:417-521` |

**Status:** ⚠️ PARTIAL — cash receipts work; on-account invoices 🚨 CRITICAL MISSING; tax mapping 🚨 CRITICAL MISSING.

**Code path:** `orderController` paid → `enqueueBigcapitalSyncIfEnabled` → outbox → worker → `buildSaleReceiptPayload` → `POST .../receipts` → `InternalPosReceipts.createReceipt` → `SaleReceiptGLEntriesSubscriber`.

### 3.2 Inventory & Stock

| Question | Answer | Reference |
|----------|--------|-----------|
| Where managed? | **Both** — POS ingredients locally; Finance items on receipt close | `inventoryService.js:579`, `SaleReceiptWriteInventoryTransactions.ts:21-33` |
| POS sale reduces Finance stock? | Only for **mapped Finance items** on receipt; not ingredient-level | `integrationItemMappingModel.js:15-18` |
| Warehouse in Finance? | ✅ `warehouses` module | `ItemWarehouseQuantity.ts:6-44` |
| Warehouse in POS? | ✅ `location` with `locationType: warehouse` | `locationModel.js:19-24` |
| Same warehouses? | Manual `locationMapping[]` only | `integrationConfigModel.js:39-49`, `bigcapitalSyncProcessor.js:117-128` |
| Stock sync mechanism | GRN bill, stock-take variance, manual adjust → Finance journals | `bigcapitalInventorySync.js:148-288` |
| Real-time both systems? | ❌ No live qty sync | Sale deduction has no Finance enqueue in `inventoryService.js` |

**Status:** 🚨 CRITICAL — TWO SOURCES OF TRUTH for ingredient inventory.

### 3.3 Customers & Contacts

| Question | Answer | Reference |
|----------|--------|-----------|
| Shared records? | ❌ No | |
| POS customer → Finance? | ❌ All receipts use walk-in | `bigcapitalSyncProcessor.js:298` |
| Finance customer → POS? | ❌ No pull/sync | |
| Bidirectional sync? | ❌ MISSING | |
| Deduplication? | ❌ MISSING | |

**Status:** 🚨 CRITICAL MISSING

### 3.4 Suppliers

| Question | Answer | Reference |
|----------|--------|-----------|
| Shared records? | Manual ID map only | `integrationVendorMappingModel.js:10-17` |
| POS supplier → Finance? | ❌ No entity sync | |
| Used for GRN bills | ✅ `resolveVendorId()` with fallback `defaultVendorId` | `bigcapitalInventorySync.js:33-65` |
| Low stock → supplier contact? | ❌ MISSING | Searched POS alert services |
| Auto PO on low stock? | ⚠️ UI suggests PO from low stock (`purchase-orders/page.tsx:62,381`); no auto-email to supplier |

**Status:** ⚠️ PARTIAL mapping only; ❌ MISSING auto-contact

### 3.5 Profit & Margins

| Question | Answer | Reference |
|----------|--------|-----------|
| Profit calculated where? | Combined: **Finance** (native POS GL bypassed) | `accountingService.js:856-857`, `:938-939`, `isBigcapitalNativeGlBypass()` `:1378-1383` |
| COGS tracked? | ✅ Finance cost lots from recipe unit cost on sync | `InternalPosReceipts.service.ts:98-108`, `bigcapitalSyncProcessor.js:166-210` |
| Gross margin per item? | ⚠️ POS food-cost report locally; Finance item cost updated on sync | `reportRoute.js:47`, `InternalPosReceipts.service.ts:98-108` |
| P&L includes POS? | ✅ Via synced sale receipt GL entries | `SaleReceiptGLEntriesSubscriber.ts:19-30` |

**Status:** ⚠️ PARTIAL — depends on successful receipt sync + item mapping

### 3.6 Profit & Loss Report

| Question | Answer | Reference |
|----------|--------|-----------|
| Finance P&L reflects POS? | ✅ When receipts sync — income + COGS GL subscribers fire | `ProfitLossSheet.controller.ts:26-43`, `SaleReceiptCostGLEntriesSubscriber.ts:14-16` |
| POS sales as journal entries? | In combined mode: **Finance journals**, not POS `JournalEntry` | `accountingService.js:938-939` |
| POS refunds in P&L? | ✅ Partial refund → credit note path | `bigcapitalSyncProcessor.js:474-521` |
| POS native P&L when Finance on? | Empty/stale — native posting skipped | `accountingService.js:938-939` |

**Status:** ⚠️ PARTIAL — Finance P&L is source of truth only if sync succeeds and mappings complete

---

## 4. Multi-Currency

### 4.1 Currency source of truth

| System | Base currency | Reference |
|--------|---------------|-----------|
| Finance | `TenantMetadata.baseCurrency` | `TenantMetadataModel.ts:9,41` |
| POS | `AccountingConfig.companyCurrency` | `accountingConfigModel` via settings UI `settings/page.tsx:74,177` |
| Combined mode winner | **Intended: Finance** — but POS maintains separate config | ❓ No sync job found between POS `companyCurrency` and Finance `baseCurrency` |

### 4.2 Currency in POS

| Item | Status | Reference |
|------|--------|-----------|
| Multi-currency payments | ✅ `documentCurrency`, `fxRateToCompany` on order | `orderModel.js:173-175`, `orderController.js:1208-1225` |
| Exchange rate source | Stored on order at sale time | `orderModel.js:173-175` |
| Synced from Finance | ❌ Not found | |

### 4.3 Currency in Accounting

| Item | Status | Reference |
|------|--------|-----------|
| Multi-currency | ✅ BigCapital native | `SaleReceipt.dto.ts:43-51` |
| Rate provider | OpenExchangeRates | `ExchangeRates/lib/OpenExchangeRate.ts:9`, `ExchangeRates.service.ts:36` |
| Manual rates | ✅ Supported via ExchangeRates module | `ExchangeRate.ts:1-24` |

### 4.4 Combined mode currency flow

POS computes FX and attaches to JSON payload (`bigcapitalSyncProcessor.js:307-310`) → **dropped** at Finance DTO boundary → Finance uses walk-in customer currency + default rate 1 (`SaleReceiptDTOTransformer.service.ts:92-93`).

**FX gain/loss entries:** ❌ MISSING for POS-originated multi-currency sales.

**Status:** 🚨 CRITICAL MISSING effective FX handling

---

## 5. Multi-Location / Branches / Warehouses

### 5.1 Branches in POS

| Item | Status | Reference |
|------|--------|-----------|
| Multi-location | ✅ `Location` model | `locationModel.js:11-75` |
| Stock per branch | ✅ `StockBalance` per location | `inventoryAlertService.js:14-17` |
| Sales per branch | ✅ Reports with location scope | `reportRoute.js:28-42` |
| Branch selector UI | ✅ Location middleware on routes | `tenantRouteStacks` via `reportRoute.js:28` |
| Branch comparison report | ✅ | `reportRoute.js:20`, `branch-comparison/page.tsx` |

### 5.2 Branches in Accounting

| Item | Status | Reference |
|------|--------|-----------|
| Branch model | ✅ `Branch` | `modules/Branches/models/Branch.model.ts:10` |
| P&L per branch | ✅ Query DTO supports branch filters | Branch DTO transform on receipts `SaleReceiptDTOTransformer.service.ts:103` |
| Journal tagged by branch | ✅ `branchId` on synced receipts | `InternalPosReceipts.service.ts:85-86` |

### 5.3 Warehouses

| Item | POS | Finance | Combined |
|------|-----|---------|----------|
| Model | `locationType: warehouse` | `warehouses` table | Manual `locationMapping` |
| Shared | ❌ | ❌ | ⚠️ Mapping only (`integrationRoute.js:43-122`) |
| Inter-warehouse transfer | ❓ UNKNOWN POS→Finance journal | Finance native transfers | ❓ UNKNOWN |
| Transfer journal | ❌ Not found in bridge | Finance native | ❌ MISSING in bridge |

### 5.4 Stock visibility

| Item | Status | Reference |
|------|--------|-----------|
| Consolidated stock report | ⚠️ POS inventory report per org; Finance inventory valuation separate | `inventoryRoute.js:38-47`, Finance `InventoryValuationSheet` |
| BigCapital shows POS ingredient stock | ❌ No | |
| Real-time | ❌ End-of-event sync only (receipts, GRN, adjustments) | |

**Status:** ⚠️ PARTIAL — location mapping works for receipts; no unified cross-product stock view

---

## 6. Quality Control & Expiry

### 6.1 Expiry date tracking

| System | Status | Reference |
|--------|--------|-----------|
| POS ingredient lots | ✅ `expiryDate` on lots | `inventoryAlertService.js:40-67`, `stockLotService.js:13-31` |
| POS GRN capture | ✅ UI field | `goods-receipt-note-detail-client.tsx:108-493` |
| Finance items | ❓ UNKNOWN — no expiry field found in Finance item search |
| Expiry alerts | ✅ Webhook + in-app (not email) | `inventoryAlertService.js:131-148`, `:181-198` |
| Expired stock removed from available | ✅ Offline sell blocked | `offline-stock-mirror.ts:148` |

**Status:** ⚠️ PARTIAL — POS only; ❌ MISSING in Finance

### 6.2 Quality control

| Item | Status | Reference |
|------|--------|-----------|
| QC workflow | ⚠️ GRN line QC states | `goodsReceiptNoteController.js:108-172`, `goodsReceiptNoteRoute.js:35-40` |
| Receive → inspect → approve | ✅ GRN QC endpoint | `goodsReceiptNoteController.js:108-172` |
| Rejected goods in inventory | ✅ `qualityStatus` on movements | `inventoryController.js:206-264`, `stockMovementModel.js:41` |
| Dedicated QC module | ❌ MISSING as named module | |

### 6.3 Low stock alerts

| Item | Status | Reference |
|------|--------|-----------|
| Reorder threshold | ✅ `ingredient.reorderThreshold` | `ingredientModel.js:51-52` |
| Scheduled check | ✅ Every 4h | `inventoryAlertService.js:181-198` |
| On trigger | Webhook POST + backoffice notification + socket | `inventoryAlertService.js:131-148`, `socketEmit.js:10` |
| Email | ❌ MISSING | |
| Auto PO | ⚠️ Manual from UI | `purchase-orders/page.tsx:62,381` |

### 6.4 Supplier auto-contact

**Status:** ❌ MISSING — no code emails suppliers on low stock (searched `services/posnew` for supplier notify/auto-contact patterns).

---

## 7. Plans, Licenses & Billing

### 7.1 Plan definitions

**In database** (not hardcoded feature matrix). Default seeds:

| Plan | Slug | Default limits (seed) | Reference |
|------|------|----------------------|-----------|
| Starter | `starter` | max_orgs=1, max_activations=1 | `0012_phase3_licensing.sql:75-79`, `ensure-default-plans.ts:13` |
| Growth | `growth` | same | `:14` |
| Pro | `pro` | same | `:15` |
| Enterprise | `enterprise` | same | `:16-21` |

**Plan management UI:** ✅ `apps/dashboard/app/(dashboard)/plans/` via `plans-page-content.tsx`.

**Plans define:** limits (`maxOrganizations`, `maxActivations`, `maxUsers`) + display `features` JSON — **NOT modules** (`schema.ts:353-381`).

**No `free` or `trial` plan type in code** — ❌ MISSING trial plan (`grep apps/api`, `packages/db`).

### 7.2 License keys

| Item | Reference |
|------|-----------|
| Formats | Legacy `STKX-*` + location-scoped `STXI` | `license-utils.ts:286-321` |
| Generation | `POST /licenses/generate` | `licenses.ts:367-544` |
| Validation | Server-side activate + offline JWT | `license-utils.ts:338-403`, `licenses.ts:858+` |
| Revocation | `revokedAt`, `revokeReason` fields | `schema.ts:414-417` |
| Expiry + grace | Default 7 days | `license-constants.ts:3-4`, `plan-limits.ts:9-31` |
| Milestone emails | 90,60,30,15,7,3,2,1 days | `license-constants.ts:9-10` |

### 7.3 Plan → module mapping

**NOT derived from plan slug.** Modules chosen at tenant create / license generate / add-module (`tenants.ts:967-968`, `licenses.ts:367-389`, `tenant-modules.ts:57+`).

Provision profiles (product-level, not plan-level):

| Profile | Modules | Reference |
|---------|---------|-----------|
| POS only | `["pos"]` | `tenant-modules.ts:28-35` |
| Accounting only | `["accounting"]` | `:37-43` |
| Connected | `["accounting","pos"]` | `:45-53` |

**Multi-branch, multi-currency, expiry, supplier alerts:** ❌ NOT in plan schema — no enforcement hooks found.

### 7.4 Plan enforcement gaps

| Feature | Guarded? | Gap |
|---------|----------|-----|
| POS module | ⚠️ Partial | POS proxy routes unguarded |
| Accounting module | ⚠️ Partial | No per-request module guard in Finance |
| Multi-org | ✅ Plan limit | `plan-limits.ts:65-86` |
| Multi-branch | ❌ | No plan check on location create |
| Multi-currency | ❌ | No plan check |
| Combined integration | ✅ Requires both modules licensed | `integration-bridge.ts:30-33` |
| Expiry tracking | ❌ | Unguarded premium |
| POS reports / branches | ❌ | Unguarded |

### 7.5 Trial logic

**Status:** ❌ MISSING — no trial period, trial expiry email, or trial→paid conversion in codebase. Closest: time-limited licenses with milestone emails (`license-expiry-milestone.ts:46-75`).

Post-expiry: suspend tenant + sync Finance/POS license state (`license-expire-followup.ts:55-66`).

---

## 8. Email Audit Table

| Email | Trigger | Template | Branded | SMTP | Sends | Recipient | Module |
|-------|---------|----------|---------|------|-------|-----------|--------|
| Owner invite | Owner created/invited | `apps/api/src/mail/templates/owner-invite.ts` | ✅ layout.ts | ✅ Resend/SMTP | ✅ wired + tested | Owner | Platform |
| **Finance user invitation** | User invited in Finance | `static/mail/UserInvite.html` | ⚠️ tenant default | Per-tenant MAIL_* | ❌ **broken** (prompt2.md:183) | Staff | Accounting |
| Owner password reset | Reset requested | `templates/password-reset.ts` | ✅ | ✅ | ✅ reported working | Owner | Platform |
| Password changed | After reset | `templates/password-changed.ts` | ✅ | ✅ | ✅ wired | Owner | Platform |
| Tenant welcome | Provision complete | `templates/tenant-welcome.ts` | ✅ | ✅ | ✅ `internal.ts:902-909` | Owner | Platform |
| Finance welcome + OTP | Finance provision | `templates/finance-welcome.ts` | ✅ | ✅ | ✅ `internal.ts:891-900` | Admin | Accounting |
| POS staff credentials | POS provision | `templates/pos-welcome.ts` | ✅ | ✅ | ✅ exported worker | Staff | POS |
| License activated | License activate | `templates/license-activated.ts` | ✅ | ✅ | ✅ | Owner | Platform |
| License expiring | Milestone job | `templates/license-expiring.ts` | ✅ | ✅ | ✅ D-90…D-1 | Owner + tenant | Platform |
| License expired | Expiry follow-up | `templates/license-expired.ts` | ✅ | ✅ | ✅ | Owner | Platform |
| Provision complete | Job done | `templates/provision-complete-owner.ts` | ✅ | ✅ | ✅ | Owner | Platform |
| Email verification (Finance signup) | Signup | `SignupVerifyEmail.html` | ⚠️ default | Per-tenant | ⚠️ requires MAIL_* | User | Accounting |
| Trial expiry (D-7,D-3,D-0) | — | — | — | — | ❌ MISSING | — | — |
| Subscription/plan upgrade/downgrade | — | — | — | — | ❌ MISSING | — | Platform |
| Invoice to customer | Invoice sent | `email-components/SaleInvoiceEmail.tsx` | ⚠️ tenant | Per-tenant | ⚠️ if SMTP configured | Customer | Accounting |
| Payment receipt to customer | Receipt sent | `SendSaleReceiptMail.process.ts` | ⚠️ tenant | Per-tenant | ⚠️ if SMTP configured | Customer | Accounting |
| Overdue invoice reminder | Scheduled | `SendSaleInvoiceMailReminderJob.ts` | — | — | ❌ **commented out** | Customer | Accounting |
| Bill due reminder | — | — | — | — | ❓ UNKNOWN | — | Accounting |
| POS receipt to customer | — | — | — | — | ❌ MISSING (pos.md:231) | Customer | POS |
| End of day summary | Scheduled report | `reportScheduleService.js:47-71` | ⚠️ minimal HTML | Resend if configured | ⚠️ partial | Manager | POS |
| Low stock alert | Inventory job | — | — | — | ❌ webhook only | Manager | POS |
| Low stock to supplier | — | — | — | — | ❌ MISSING | Supplier | — |
| POS→Finance sync notification | Sale synced | — | — | — | ❌ MISSING | Admin | Combined |
| Sync failure alert | Sync fail | — | — | — | ❌ in-app only | Admin | Combined |
| Stock discrepancy alert | — | — | — | — | ❌ MISSING | Admin | Combined |
| POS org invitation | Platform invite | inline HTML | ❌ raw | Resend | ⚠️ wired | Staff | POS |

**Template branding:** Platform emails use `apps/api/src/mail/templates/layout.ts`. Finance uses static HTML + React email components under `services/stockix-finance/shared/email-components/`. Whitelabel per tenant via Finance metadata — ❓ UNKNOWN full whitelabel coverage on all Finance templates.

---

## 9. Reports & Comparisons

### 9.1 Accounting (BigCapital / Finance) reports

Available via `financialReports.tsx:133-497` hooks — includes P&L, Balance Sheet, Cash Flow, Trial Balance, AR/AP Aging, General Ledger, Journal, Inventory Valuation, Customer/Vendor balances, etc.

**Include POS data in combined mode?** Only if synced to Finance GL/inventory — no separate "POS" filter; data appears as normal sale receipts.

**Broken/empty:** ❓ UNKNOWN without runtime testing.

### 9.2 POS reports

**Ops reports** (`reportRoute.js:44-57`): sales, top-items, payment-methods, food-cost, staff, tables, discount-audit, pos-audit, vat, voids, sales-by-category, expenses, branch-comparison.

**GL reports** (`accountingRoute.js:40-53`): P&L, cash flow, balance sheet, consolidated trial balance/P&L/BS, budget vs actual, AR aging, statements, bank reconciliation.

**In combined mode:** Native POS GL reports are **empty/stale** (posting bypassed).

### 9.3 Combined mode reporting

| Item | Status |
|------|--------|
| Unified dashboard | ❌ MISSING — separate apps + integration status panel only (`tenant-integration-status.tsx:137-139`) |
| P&L from combined data | ⚠️ Finance P&L only |
| POS sales vs Finance revenue reconciliation | ❌ MISSING |
| Stock value reconciliation | ❌ MISSING |
| 3-way PO-Bill-GRN match | ✅ POS procurement only (`threeWayMatchRoute.js:17-55`) |

### 9.4 Financial comparisons

| Report | POS | Finance | Combined |
|--------|-----|---------|----------|
| Period-over-period | ⚠️ POS sales reports | ✅ Finance statements | ⚠️ Finance only |
| Branch comparison | ✅ `branch-comparison` | ✅ branch filters | ❌ not unified |
| Product performance + margin | ✅ food-cost, top-items | ✅ item reports | ⚠️ partial |

---

## 10. Full Status Matrix

| Feature | POS Standalone | Accounting Standalone | Combined | Notes |
|---------|----------------|----------------------|----------|-------|
| Provisioning | ✅ | ✅ | ⚠️ | Wire step exists; subdomain mismatch risk |
| Receipts | ✅ native GL | ✅ native | ⚠️ | Finance receipt sync; not POS receipt email |
| Invoices | ✅ local AR | ✅ native | 🚨 | On-account not synced to Finance |
| Inventory sync | ✅ local | ✅ native | 🚨 | Two sources of truth |
| Customer sync | ✅ local | ✅ native | 🚨 | Walk-in only to Finance |
| Supplier sync | ✅ local | ✅ native | ⚠️ | Vendor ID map for GRN only |
| Multi-currency | ⚠️ | ✅ | 🚨 | FX dropped at boundary |
| Multi-branch | ✅ | ✅ | ⚠️ | Manual location map |
| Warehouses | ✅ locations | ✅ | ⚠️ | Not auto-shared |
| Stock alerts | ⚠️ webhook | ❌ | ⚠️ | No email |
| Supplier alerts | ❌ | ❌ | ❌ | |
| Expiry dates | ✅ POS lots | ❓ | ⚠️ | Finance side unknown |
| P&L report | ✅ native | ✅ | ⚠️ | Combined uses Finance only |
| Email notifications | ⚠️ | ⚠️ | ⚠️ | Many gaps |
| Plan enforcement | ❌ | ❌ | ⚠️ | Limits only, not features |
| License validation | ✅ | ✅ sync | ✅ | POS org access state |

---

## 11. What Is Missing — Full Build List

| # | Feature | Module | Priority | Effort | Notes |
|---|---------|--------|----------|--------|-------|
| 1 | Fix POS subdomain resolution for `{slug}-pos.{ROOT_DOMAIN}` | POS | P0 | S | `extractSubdomainOrg.js:4-29` |
| 2 | Ingredient inventory sync or single-stock model | Combined | P0 | XL | Eliminate dual ledger |
| 3 | FX / multi-currency on internal receipt API | Combined | P0 | M | Extend DTO + mapper |
| 4 | Customer mapping POS↔Finance | Combined | P0 | L | New mapping model + sync |
| 5 | On-account sale invoice sync | Combined | P0 | L | New internal endpoint |
| 6 | Tax line mapping POS→Finance | Combined | P0 | M | |
| 7 | Fix Finance `organization-id` axios header | Accounting | P0 | XS | `axios.tsx:62-70` |
| 8 | Module guards on all POS proxy routes | Platform | P0 | S | `pos-proxy-http.ts` |
| 9 | Sync failure email/webhook to admin | Combined | P1 | S | Extend `onBigcapitalSyncFailed` |
| 10 | Unified stock reconciliation report | Combined | P1 | L | |
| 11 | POS sales vs Finance revenue reconcile | Combined | P1 | L | |
| 12 | Low stock email alerts | POS | P1 | S | Extend `inventoryAlertService.js` |
| 13 | Supplier auto-contact / auto PO email | POS | P2 | M | |
| 14 | POS customer receipt email | POS | P2 | M | Noted missing in pos.md |
| 15 | Finance overdue invoice reminder job | Accounting | P2 | S | Uncomment/implement reminder job |
| 16 | Trial plan + trial expiry flow | Platform | P2 | L | |
| 17 | Plan→feature matrix (multi-branch, FX) | Platform | P2 | M | Extend plans schema |
| 18 | Expiry tracking in Finance items | Accounting | P3 | M | |
| 19 | Combined unified dashboard | Platform | P3 | XL | |
| 20 | Currency config sync POS↔Finance | Combined | P2 | M | |

---

## 12. What Is Broken — Fix List

| # | Issue | Module | Severity | Effort | File:Line |
|---|-------|--------|----------|--------|-----------|
| 1 | POS subdomain host hardcoded `pos.zerowix.cloud` vs Traefik `{slug}-pos.{domain}` | POS/Infra | Critical | S | `extractSubdomainOrg.js:4-29`, `traefik-config.ts:100-106` |
| 2 | Finance axios reads `organization` not `organizationId` | Accounting | Critical | XS | `axios.tsx:62-70`, `authentication.reducer.tsx:13` |
| 3 | FX rate sent by POS ignored by Finance | Combined | Critical | M | `bigcapitalSyncProcessor.js:307-310`, `InternalPosReceipt.dto.ts:55-96` |
| 4 | Finance user invite email not reaching SMTP | Accounting | High | M | `SendInviteUserMail.processor.ts:25-36`, `mail.ts:5-13` |
| 5 | POS proxy routes skip module license check | Platform | High | S | `pos-proxy-http.ts:34-47` |
| 6 | Overdue invoice reminder job disabled | Accounting | Medium | S | `SendSaleInvoiceMailReminderJob.ts:1-30` |
| 7 | `withCurrentOrganization` uses wrong state key | Accounting | Medium | XS | `withCurrentOrganization.tsx:11` |

---

## 13. What Is Partial — Needs Completion

| # | Feature | What Works | What's Missing | Module |
|---|---------|------------|----------------|--------|
| 1 | Sale sync | Cash sale → Finance receipt + GL | On-account invoices, tax, customer | Combined |
| 2 | Inventory bridge | GRN, stock-take, manual adjust | Live ingredient sync on sale | Combined |
| 3 | Location/warehouse | Manual map; warehouse on receipt | Auto-sync warehouses; transfer journals | Combined |
| 4 | Supplier integration | Vendor ID map for GRN | Entity sync, auto-contact | Combined |
| 5 | Low stock alerts | Webhook + in-app + widget | Email, supplier notification | POS |
| 6 | Expiry | POS lots + alerts | Finance items; cross-product | POS |
| 7 | QC | GRN line QC | Named QC module; Finance side | POS |
| 8 | Plans/licenses | Keys, expiry, grace, org limits | Trial, feature matrix, module mapping | Platform |
| 9 | Email | Platform + provision emails | Finance invite, POS receipt, sync alerts | All |
| 10 | Reporting | Separate rich reports each product | Unified reconcile + combined dashboard | Combined |
| 11 | Multi-org | Finance + control plane multi-org | Active org in control-plane session | Platform |
| 12 | Module enforcement | POS JWT module check; some API guards | Dashboard route guards; Finance module guard | Platform |

---

## 14. Recommended Build Order

1. **P0 — Subdomain + axios header fixes** — Unblocks POS access and Finance API tenancy on Stockix domains.
2. **P0 — Internal receipt DTO: FX + tax + customer mapping** — Correct financial records before scale.
3. **P0 — Inventory strategy decision** — Either sync ingredient deductions to Finance variance or designate POS ingredients as operational-only with Finance items as SOT (document + enforce).
4. **P1 — On-account invoice sync path** — Required for restaurant/credit sales in combined mode.
5. **P1 — Sync failure alerting + reconciliation reports** — Operational visibility.
6. **P1 — POS proxy module guards + plan feature matrix** — Commercial enforcement.
7. **P2 — Email completion** (Finance invite SMTP provisioning, low stock email, POS receipt email).
8. **P2 — Trial + billing emails** — SaaS lifecycle.
9. **P3 — Unified dashboard + supplier automation** — Differentiation features.

---

## 15. Architecture Recommendations

1. **Single subdomain strategy** — Align POS hostname parsing with Traefik (`{slug}-pos.{ROOT_DOMAIN}`) or move to path-based routing on tenant subdomain; remove hardcoded `pos.zerowix.cloud`.

2. **Explicit combined-mode data contract** — Document and enforce: Finance owns GL, AR (except operational POS views), inventory **items**; POS owns recipes/ingredients unless/until synced via defined events.

3. **Extend internal POS API** — Add invoices, customers, tax lines, FX, and optional inventory delta endpoints rather than expanding receipt payload ad hoc.

4. **Central notification bus** — Platform-level alerts for sync failure, license expiry, and stock discrepancies instead of siloed webhooks per product.

5. **Plan schema evolution** — Add `features` or `modulesIncluded` to plans with server-side enforcement hooks in POS location create, Finance multi-currency, etc.

6. **Tenant SMTP provisioning** — Auto-provision Finance `MAIL_*` from platform Resend at tenant create so invite/invoice emails work out of box.

7. **Reconciliation as first-class** — Nightly job comparing POS paid orders (`referenceNo`) to Finance sale receipts + inventory valuation snapshot.

---

**Audit summary:** 10 critical issues, 7 broken, 20+ missing, 12 partial.

**Output path:** `docs/accpos.md`
