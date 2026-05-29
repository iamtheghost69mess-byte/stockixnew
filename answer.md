# Integration Audit Answers (Evidence-Based)

All answers below are based on repository evidence only. Unknown/undecided items are marked `TBD` or `unsure`. Where requested, missing artifacts are marked `NOT FOUND`.

## A) Provisioning & Tenant Model / POS ↔ BigCapital (25 core questions)

1. **Separate logins vs SSO across POS + BigCapital?**  
   **Answer:** Separate bootstrap credentials currently exist (not a single SSO session proven).  
   **Evidence:** `apps/api/src/routes/tenants.ts` returns both `oneTimeAdminPassword` and `posDefaultCredentials` in provision status complete payload; note also POS-specific login API note.

2. **BigCapital per-tenant or shared multi-tenant?**  
   **Answer:** Per-tenant finance stack is provisioned when accounting module is present.  
   **Evidence:** `infra/worker-service/src/module-stacks.ts` (`shouldProvisionFinanceStack` based on `accounting`), `packages/db/src/schema.ts` (`tenant_deployments.financeTenantId` per tenant).

3. **POS-only tenant: hidden BigCapital or no BigCapital?**  
   **Answer:** No finance stack when module gating is on and `accounting` module is absent.  
   **Evidence:** `infra/worker-service/src/module-stacks.ts` (`shouldProvisionFinanceStack` only if modules include `accounting`; `isPosOnlyModules`).

4. **Provisioning trigger and created resources by module mix?**  
   **Answer:** Trigger is API call `POST /tenants`; work is queued as async `tenant.provision` job.  
   **Evidence:** `apps/api/src/routes/tenants.ts` (`app.post("/tenants")`, `insertTenantJob({ type: "tenant.provision"... })`), `infra/worker-service/src/provision-runtime.ts` branches by modules (`pos`, `accounting`, `pms`, `chat`).

5. **Who owns Chart of Accounts?**  
   **Answer:** BigCapital/accounting side is source for accounting integration; POS maps items/accounts into BigCapital config.  
   **Evidence:** `services/posnew/.../models/integrationConfigModel.js` (BigCapital account IDs), `infra/worker-service/domain/provisioning/adapters/copy-coa-across-stacks.ts` (COA copy adapter exists). Final business ownership policy text is `unsure`.

6. **Exact accounting entries for finalized POS sale?**  
   **Answer:** `unsure` (no explicit fixed JE template in repo text). Implemented sync posts Finance receipt payload with deposit account, customer, receipt entries, optional exchange rate/warehouse/branch.  
   **Evidence:** `services/posnew/apps/pos-backend/services/bigcapitalSyncProcessor.js` (`buildSaleReceiptPayload`, `postToBigcapital` to `/api/internal/pos/receipts`).

7. **BigCapital endpoint for journal/invoice from external source tested?**  
   **Answer:** Yes for receipt/void/partial-refund internal endpoints; explicit journal/invoice endpoint for POS not found in scanned files.  
   **Evidence:** `bigcapitalSyncProcessor.js` uses `/api/internal/pos/receipts`, `/by-reference/:id` DELETE, `/partial-refund` PATCH.

8. **Void/refund reversal flow defined or manual?**  
   **Answer:** Defined async flow exists (void receipt + partial refund credit note).  
   **Evidence:** `bigcapitalSyncEnqueue.js` (`void_receipt`, `partial_refund`), `bigcapitalSyncProcessor.js` (`voidFinanceReceipt`, `processBigcapitalPartialRefundJob`).

9. **Tax calculation source/master?**  
   **Answer:** `unsure` as system-of-record policy; POS order payload includes tax and receipt composition includes POS values.  
   **Evidence:** POS receipt/order logic in `services/posnew/apps/pos-backend/services/orderPrinting.js`, `utils/orderTotals.js`, and sync payload builder in `bigcapitalSyncProcessor.js`.

10. **Warehouse/stock location master lives where?**  
    **Answer:** POS has native location/stock models; BigCapital warehouse mapping exists for sync.  
    **Evidence:** `services/posnew/apps/pos-backend/models/locationModel.js`, `services/.../services/stockBalanceService.js`, `integrationConfigModel.js` (`locationMapping`, `defaultWarehouseId`).

11. **Who decrements stock on POS sale?**  
    **Answer:** POS decrements during order/payment lifecycle; BigCapital receives accounting/inventory sync events separately.  
    **Evidence:** `controllers/orderController.js` uses `inventoryService` (`processStockAfterPayment` etc.); BigCapital sync via queue in `bigcapitalSyncEnqueue.js`.

12. **Multi-branch warehouse mapping ownership?**  
    **Answer:** Branch/location mapping is configurable in POS integration config (`posLocationId -> bigcapitalBranchId/warehouseId`).  
    **Evidence:** `integrationConfigModel.js`, `routes/integrationRoute.js` (`/config/location-mapping` CRUD).

13. **PO/receiving flow and first write location?**  
    **Answer:** POS backend has purchase/GRN flow and then emits Finance AP bill sync event.  
    **Evidence:** `controllers/purchaseOrderController.js`, `controllers/goodsReceiptNoteController.js`, `services/bigcapitalSyncEnqueue.js` (`grn_bill`), `services/bigcapitalInventorySync.js`.

14. **Base currency per tenant configured where?**  
    **Answer:** `unsure` (no single provisioning-level definitive owner found).  
    **Evidence:** POS payload can include `exchangeRate` from order fields (`bigcapitalSyncProcessor.js`).

15. **Foreign currency sale: who stores exchange rate?**  
    **Answer:** POS order carries FX value used in sync payload (`fxRateToCompany` -> `exchangeRate`).  
    **Evidence:** `bigcapitalSyncProcessor.js` lines building payload (`order.fxRateToCompany`, `order.documentCurrency`).

16. **Exchange rate live API vs manual and lock point?**  
    **Answer:** `unsure`. No clear rate-provider integration found in scanned files.

17. **Journal carries foreign+base or one amount?**  
    **Answer:** Sync payload carries `exchangeRate`; whether both representations persist in finance ledger is `unsure` from scanned code alone.

18. **POS→BigCapital sync cadence real-time/queue/batch?**  
    **Answer:** Queue/outbox-driven near-real-time async.  
    **Evidence:** `orderController.js` enqueue on paid; `accountingIntegrationOutbox.js`; `workers/bigcapitalSyncWorker.js`.

19. **Message queue present or direct HTTP only?**  
    **Answer:** Queue present (BullMQ + Redis) plus outbox fallback and worker processor.  
    **Evidence:** `services/jobQueue.js`, `services/accountingIntegrationOutbox.js`, `workers/bigcapitalSyncWorker.js`.

20. **If BigCapital down at bill print/sale time, what happens?**  
    **Answer:** Sale flow does not hard-block; sync is queued/retried and/or retained in outbox for drain/retry.  
    **Evidence:** async fire-and-forget enqueue in `orderController.js`; retry/backoff in `accountingIntegrationOutbox.js`; pending/failed drain in worker.

21. **Single shared catalog or separate catalogs?**  
    **Answer:** Separate catalogs with explicit mapping tables.  
    **Evidence:** `models/integrationItemMappingModel.js`, `integrationRoute.js` item/ingredient/vendor mapping endpoints.

22. **UOM master owner?**  
    **Answer:** POS defines ingredient/item units and maps to BigCapital items; cross-system ownership policy is `unsure`.  
    **Evidence:** ingredient/menu models and integration mapping in POS backend.

23. **BigCapital inventory configured or financial-only?**  
    **Answer:** Inventory-linked integration exists (warehouse IDs, inventory adjustment/stock take/grn events).  
    **Evidence:** `integrationConfigModel.js` inventory fields; events in `accountingIntegrationEvents.js`; handlers in `bigcapitalInventorySync.js`.

24. **Current state of POS↔BigCapital connection?**  
    **Answer:** Partially/actively wired implementation exists (not greenfield): provisioning wire APIs, health checks, queue workers, outbox, replay/status endpoints.  
    **Evidence:** `infra/worker-service/.../wire-pos-bigcapital-integration.ts`, `platformIntegrationController.js`, `integrationRoute.js`.

25. **Existing contracts/schemas/webhooks for POS↔BigCapital?**  
    **Answer:** Yes, several internal contracts/routes exist; full external formal schema package is `unsure`.  
    **Evidence:** `integrationRoute.js` endpoints, `accountingIntegrationEvents.js` event catalog, `openapi/*.yaml` in POS backend, internal API paths in `bigcapitalSyncProcessor.js`.

---

## B) Connectivity & Notifications (Diagnostic Round 2)

1. **Network topology POS↔BigCapital (private/internal vs public)?**  
   **Answer:** Internal URL pattern is explicitly built for POS-to-finance bridge; exact deployment topology (VPS/private DNS/public LB) is `unsure`.  
   **Evidence:** `wire-pos-bigcapital-integration.ts` uses `buildFinanceInternalUrlForPos(...)`.

2. **API gateway/reverse proxy in front of BigCapital?**  
   **Answer:** `unsure`. Code references direct `internalBaseUrl`; no definitive single gateway declaration in scanned integration files.

3. **Service auth credential used POS→BigCapital?**  
   **Answer:** Shared internal secret header (`x-internal-secret`) for POS→BigCapital receipt APIs; platform API key (`X-Api-Key`) for worker→POS wiring calls.  
   **Evidence:** `bigcapitalSyncProcessor.js`, `wire-pos-bigcapital-integration.ts`.

4. **Retry/circuit breaker?**  
   **Answer:** Retries/backoff exist at queue/outbox level; explicit circuit-breaker pattern not found.  
   **Evidence:** `accountingIntegrationOutbox.js` attempts/backoff and retry scheduling; `jobQueue.js` queue defaults.

5. **BigCapital outbound webhooks to POS?**  
   **Answer:** `NOT FOUND` in scanned POS/worker integration paths. Direction appears primarily POS→BigCapital for sync.

6. **Expected peak call volume?**  
   **Answer:** `TBD` (no capacity numbers found in code).

### Notifications

7. **Notify on successful sync?**  
   **Answer:** Mostly silent; completion logged/metrics, no user-facing success notification flow found by default.  
   **Evidence:** `bigcapitalSyncWorker.js` logs completed jobs; backoffice notification events mostly failure/warning oriented.

8. **Notify on sync failure and channel/speed?**  
   **Answer:** Failure state is written to integration status/outbox and some notifications exist (e.g., unmapped items). Channel appears in-app backoffice notification system; email/SMS for sync failure not clearly implemented.  
   **Evidence:** `backofficeNotificationEvents.js` (`integration.sync_unmapped_items`), `platformNotificationsController.js`, `integrationRoute.js` outbox/status endpoints.

9. **Notification center/activity log exists?**  
   **Answer:** Yes, in-app platform/backoffice notification model and controller exist.  
   **Evidence:** `controllers/platformNotificationsController.js`, `models/platformNotificationModel.js`.

10. **Per-branch sync status vs global for multi-branch?**  
    **Answer:** `unsure` for explicit branch-level sync status UI; mapping supports per-location branch/warehouse, but sync status appears org/global-oriented.

---

## C) Chatwoot + Pesan PMS + RentTools.io Integration Scan

### Section 1 — Repo Structure & Unification

1. **Pesan PMS and RentTools present?**  
   - **Pesan PMS:** `FOUND` as `services/pms` (plus `services/pms/frontend`).  
   - **RentTools.io:** `NOT FOUND` by name in scanned codebase (but PMS code references “RentTools patterns” comments).  
   **Evidence:** root workspace packages and `services/pms/src/lib/platforms.ts` comment: “RentTools RT-17.1 pattern”.

2. **Monorepo config unifying apps?**  
   **FOUND**: `pnpm-workspace.yaml`, `turbo.json`, root `package.json` scripts.  
   Workspaces include `apps/*`, `packages/*`, `services/pms`, `services/posnew` paths.

3. **Shared module/library both apps can import from?**  
   **FOUND**: `packages/*` workspace shared libs (`@repo/db`, `@repo/config`, `@repo/auth`, `@repo/shared`, etc.).  
   **Evidence:** `services/pms/package.json` depends on `@repo/db`, `@repo/config`, `@repo/auth`.

4. **Single env loader/shared convention?**  
   **Partial FOUND**: Monorepo shared config package exists, but services also keep their own env files/examples.  
   **Evidence:** `@repo/config` usage across services, plus service-local `.env.example` files (e.g., `services/chatlive/.env.example`).

### Section 2 — Chatwoot Integration

1. **Chatwoot API client/service in codebase?**  
   **FOUND** in worker provisioning flow.  
   **Evidence:** `infra/worker-service/src/chatwoot-provision.ts` (`provisionChatwootAccount`).

2. **Chatwoot provisioning called on tenant creation?**  
   **FOUND** and wired in provision runtime when `chat` module licensed.  
   **Evidence:** `infra/worker-service/src/provision-runtime.ts` calls `provisionChatwootAccount(...)` under `licensedModules.includes("chat")`.

3. **Chatwoot base URL/token in env vars?**  
   **FOUND**: `CHATWOOT_BASE_URL`, `CHATWOOT_API_ACCESS_TOKEN`.  
   **Evidence:** `provision-runtime.ts`, `chatwoot-provision.ts`.

4. **Chatwoot self-hosted or cloud?**  
   **Self-hosted present** (repo includes Chatwoot service and compose).  
   **Evidence:** `services/chatlive/docker-compose.yaml`, `services/chatlive/.env.example` self-host docs, `infra/prod/docker-compose.yml` has `chatwoot` service.

5. **Inbox creation per tenant/property/branch on provisioning?**  
   **NOT FOUND** in scanned worker provisioning flow (account creation/link exists, inbox provisioning function not located).

### Section 3 — Airbnb & Booking.com Connectivity

1. **Airbnb API client/webhook handler?**  
   **Partial FOUND** for Airbnb platform/iCal handling (not official API client/webhook).  
   **Evidence hits:**  
   - `services/pms/src/routes/channels.ts` (`platform` enum includes `airbnb`, iCal import/sync routes)  
   - `services/pms/src/lib/platforms.ts` (`airbnb` preset)  
   - tests under `services/pms/tests/*` referencing Airbnb iCal.

2. **Booking.com API client/connectivity layer?**  
   **Partial FOUND** for Booking platform/iCal handling (not official Booking API client).  
   **Evidence:** `services/pms/src/routes/channels.ts` (`booking`), `services/pms/src/lib/platforms.ts` (`Booking.com` preset), PMS frontend/platform tests.

3. **Channel manager/middleware adapter already wired (Hospitable/Hostaway/Lodgify/custom)?**  
   **Partial FOUND** as platform preset registry + iCal channel routes (custom iCal channel flow), not direct vendor API integrations found.  
   **Evidence:** `services/pms/src/lib/platforms.ts`, `services/pms/src/routes/channels.ts`.

4. **Guest message bridge Airbnb/Booking → Chatwoot conversation?**  
   **NOT FOUND** in scanned code.

### Section 4 — Tenant Provisioning

1. **Tenant provisioning flow exists?**  
   **FOUND**.  
   **Evidence:** `apps/api/src/routes/tenants.ts` (`POST /tenants` -> queue `tenant.provision`), `infra/worker-service/src/provision-runtime.ts`.

2. **Is Chatwoot called in provisioning flow?**  
   **FOUND** as conditional step when `chat` module exists.  
   **Evidence:** `provision-runtime.ts` + `chatwoot-provision.ts`.

3. **Tenant schema fields for chatwootAccountId/chatwootInboxId/airbnbToken/bookingApiKey?**  
   - `chatwootAccountId`: **FOUND**  
   - `chatwootInboxId`: **NOT FOUND**  
   - `airbnbToken`: **NOT FOUND**  
   - `bookingApiKey`: **NOT FOUND**  
   **Evidence:** `packages/db/src/schema.ts` (`tenants.chatwootAccountId`).

4. **Email identity linked at provisioning?**  
   **FOUND** (`adminEmail`, plus first/last names) on tenant schema + provisioning payload.  
   **Evidence:** `packages/db/src/schema.ts` (`tenants.adminEmail`), `apps/api/src/routes/tenants.ts` provision body.

---

## D) Gap Table

| # | Feature                                      | Status | File / Notes |
|---|----------------------------------------------|--------|--------------|
| 1 | Pesan PMS present in repo                    | FOUND | `services/pms`, `services/pms/frontend` |
| 2 | RentTools present in repo                    | MISSING | `NOT FOUND` by product/folder name; only comment reference in `services/pms/src/lib/platforms.ts` |
| 3 | Monorepo unification config                  | FOUND | `pnpm-workspace.yaml`, `turbo.json`, root `package.json` |
| 4 | Chatwoot API client                          | FOUND | `infra/worker-service/src/chatwoot-provision.ts` |
| 5 | Chatwoot tenant provisioning                 | FOUND | `infra/worker-service/src/provision-runtime.ts` -> `provisionChatwootAccount()` |
| 6 | Chatwoot inbox creation per tenant           | MISSING | `NOT FOUND`; needs new implementation or existing Chatwoot API extension |
| 7 | Airbnb webhook handler                       | MISSING | `NOT FOUND`; current PMS uses iCal channel sync routes |
| 8 | Booking.com API client                       | MISSING | `NOT FOUND`; current PMS has booking platform preset/iCal model only |
| 9 | Guest message → Chatwoot bridge              | MISSING | `NOT FOUND`; build from scratch |
|10 | Tenant provisioning flow                     | FOUND | `apps/api/src/routes/tenants.ts`, `infra/worker-service/src/provision-runtime.ts` |
|11 | Chatwoot called on provisioning              | FOUND | Wired when module `chat` present |
|12 | Tenant schema has Chatwoot fields            | FOUND | `packages/db/src/schema.ts` -> `chatwootAccountId` |
|13 | Tenant schema has Airbnb/Booking fields      | MISSING | `NOT FOUND` (`airbnbToken`, `bookingApiKey` absent) |
|14 | Shared env loader across both apps           | FOUND (partial) | Shared `@repo/config`; service-specific env files still exist |
|15 | Single shared lib/package between both apps  | FOUND | shared workspace packages (`packages/*`, e.g. `@repo/db`, `@repo/config`) |

---

## E) Top 5 Recommended Next Build Steps (Priority)

1. **Design tenant messaging model + schema migration** for `chatwootInboxId`(s), OTA credentials/tokens, and per-property/branch mapping (avoid storing secrets unencrypted).  
2. **Implement Chatwoot inbox provisioning step** in worker flow (after account creation), then persist inbox IDs in tenant/property tables.  
3. **Add OTA adapter layer** (Airbnb/Booking providers or channel-manager abstraction) with explicit webhook endpoints and signature validation.  
4. **Build guest-message bridge service** (incoming OTA event -> tenant/property resolution -> Chatwoot contact/conversation/message creation).  
5. **Add observability + notification contracts for integration sync** (success/fail/retry events, per-branch status view, alert routing to owner dashboard).

