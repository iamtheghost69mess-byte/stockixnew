# Integration Repair Report

Date: 2026-05-23 (updated after gap closure pass)

Full verification of POS + Bigcapital (Stockix Finance) integration. References: `docs/POS_FULL_AUDIT.md`, `docs/missingfor.md`, `docs/INTEGRATION.md`.

---

## What Was Built — Verified

| Component | Status | Notes |
|-----------|--------|-------|
| Platform wire API | ✅ | `PUT /api/platform/v1/organizations/:id/integration/bigcapital` |
| Worker wire step | ✅ | `tenant.wire_pos_integration` after POS when accounting+pos |
| Preflight checks | ✅ | `POS_PLATFORM_API_KEY`, `INTERNAL_API_SECRET` |
| POS compose worker + networking | ✅ | `pos-bigcapital-worker`, `extra_hosts`, `FINANCE_INTERNAL_BASE_URL` |
| persistFinanceDeploymentIds | ✅ | Finance IDs on `tenant_deployments` |
| Dashboard integration status | ✅ | Partial banner, finance tenant ID, POS URL |
| Finance void sync (C2) | ✅ | `void_receipt` jobs on reverse-order + full refund |
| Native GL bypass on void (H8) | ✅ | Reverse/refund skip native journals when Finance enabled |
| Unmapped-item alerts (H5) | ✅ | Backoffice notification + order `accountingSaleStatus: failed` |
| Line discounts in receipt (H6) | ✅ | `discount` per mapped line; service/manual in `statement` |
| Offline pay queue (H7) | ✅ | `pay_order` mutation + flush via `pos-check-sync` |
| Finance sync UX (M2) | ✅ | Post-payment toasts via `describeFinanceSyncStatus` |
| Control plane `tsc` | ✅ | Fixed duplicate `desc` import in `apps/api` |

---

## 16 Gaps — Current Status

| Gap | Severity | Status | Notes |
|-----|----------|--------|-------|
| C1 IntegrationConfig auto-wire | Critical | **FIXED** | Worker wire step + platform PUT |
| C2 Finance void on POS void | Critical | **FIXED** | `enqueueBigcapitalVoidIfEnabled` |
| C3 Worker in compose | Critical | **FIXED** | `pos-bigcapital-worker` |
| C4 POS_PLATFORM_API_KEY empty | Critical | **FIXED** | Preflight + `.env` value |
| H1 Native GL auto-disabled | High | **FIXED** | Wire + `bigcapitalIntegrationEnabled` |
| H2 Finance IDs to POS config | High | **FIXED** | Wire payload |
| H3 Auto internalBaseUrl | High | **FIXED** | `buildFinanceInternalUrlForPos` |
| H4 Partial status in dashboard | High | **FIXED** | Partial banner |
| H5 Unmapped items silent | High | **FIXED** | Notification `integration.sync_unmapped_items` |
| H6 Service charge / discounts | High | **PARTIAL** | Line discounts synced; service/manual in receipt `statement` only (Finance has no receipt-level charge fields) |
| H7 Offline pay frontend | High | **FIXED** | `pay_order` offline queue (requires existing `orderId`; split-bill needs online) |
| H8 Auto GL reversal on void | High | **FIXED** | `reverseOrderSaleLedger` / `postOrderRefund` return null when Finance on |
| M1 Multi-payment → single deposit | Medium | **OPEN** | Largest split → deposit account |
| M2 Per-order sync status UI | Medium | **FIXED** | Payment success toasts |
| M3 KDS frontend | Medium | **OPEN** | Separate product scope |
| M4 Location mapping auto-seed | Medium | **FIXED** | Main → warehouse on wire |
| M5 finance_tenant_id persist | Medium | **FIXED** | `persistFinanceDeploymentIds` |

---

## Void Sync

**Status: BUILT**

| Piece | Location |
|-------|----------|
| Enqueue | `bigcapitalSyncEnqueue.js` |
| Processor | `bigcapitalSyncProcessor.js` — `voidFinanceReceipt` |
| Worker | `bigcapitalSyncWorker.js` — `void_receipt` |
| Triggers | `reverse-order`; full refund (amount ≥ order total) |
| Tests | `bigcapital-void-sync.test.js` (3) |

---

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| POS backend | 102 (99 pass, 3 skip) | **PASS** |
| Finance server | 21 | **PASS** |
| Control plane (`apps/api`) | 141 | **PASS** |
| Worker URL builder | 2 | **PASS** |

New POS tests: `accounting-bigcapital-bypass.test.js`, line-discount in `bigcapital-sync-processor.test.js`.

---

## TypeScript

| Package | Result |
|---------|--------|
| packages/auth | **PASS** |
| apps/api | **PASS** |
| infra/worker-service | **PASS** |
| finance server | **PASS** |

---

## Burger Scenario

| Step | Status |
|------|--------|
| Live provision (accounting+pos) | **NOT RUN** | Run on target host |
| IntegrationConfig in Mongo | **NOT RUN** | After provision |
| Pay → Finance receipt | **NOT RUN** | Manual smoke |
| Worker container | **NOT RUN** | `docker ps \| grep bigcapital-worker` |

---

## Still Outstanding (Next Phase)

1. **M1** — Multi-tender deposit split in Finance receipt (single `depositAccountId` today).
2. **M3** — KDS / kitchen display UI.
3. **H6 (full)** — Book service charge as Finance line (needs mapped service item or API extension).
4. **Partial refund** — Adjust Finance receipt without full void (no internal API yet).
5. **Live E2E** — Re-provision `accounting+pos` tenant and run burger scenario on Docker.

---

## Production Ready

| Bundle | Ready | Rationale |
|--------|-------|-----------|
| Accounting only | **YES** | |
| POS only | **YES** | |
| Accounting + POS | **YES*** | Auto-wire, worker, void sync, unmapped alerts, offline pay queue; *smoke test on host still required |

**Pre-deploy checklist**

- `POS_PLATFORM_API_KEY` (≥10 chars) and `INTERNAL_API_SECRET` set
- `pos-bigcapital-worker` healthy in tenant compose
- Menu items mapped for SKUs sold to Finance
- One paid-order + reverse smoke on staging

---

## Files Changed (Gap Closure Pass)

**Backend**

- `services/posnew/apps/pos-backend/services/accountingService.js` — `isBigcapitalNativeGlBypass`, reverse/refund bypass
- `services/posnew/apps/pos-backend/controllers/accountingController.js` — reverse/refund responses with `nativeGlSkipped`
- `services/posnew/apps/pos-backend/services/bigcapitalSyncProcessor.js` — discounts, unmapped notify, failed status
- `services/posnew/apps/pos-backend/services/backofficeNotificationEvents.js` — `INTEGRATION_SYNC_UNMAPPED`
- `services/posnew/apps/pos-backend/tests/unit/accounting-bigcapital-bypass.test.js`
- `services/posnew/apps/pos-backend/tests/unit/bigcapital-sync-processor.test.js`

**Frontend**

- `services/posnew/apps/pos-frontend2/src/lib/offline-queue.ts` — `pay_order`
- `services/posnew/apps/pos-frontend2/src/lib/pos-check-sync.ts` — flush `pay_order`
- `services/posnew/apps/pos-frontend2/src/lib/pos-order-api.ts` — `describeFinanceSyncStatus`
- `services/posnew/apps/pos-frontend2/src/app/(main)/pos/_hooks/use-pos-session.ts` — offline pay + finance toasts

**Control plane**

- `apps/api/src/index.ts` — duplicate `desc` import removed
