# Zerowix QA checklist — full index

Verdict key: ✅ DONE · ⚠️ PARTIAL · ❌ NOT DONE (code audit, not re-run here).

| # | Verdict |
|---|--------|
| [1] | ✅ |
| [2] | ✅ |
| [3] | ✅ |
| [4] | ✅ |
| [5] | ✅ |
| [6] | ✅ |
| [7] | ✅ |
| [8] | ✅ |
| [9] | ✅ |
| [10] | ✅ |
| [11] | ✅ |
| [12] | ✅ |
| [13] | ✅ |
| [14] | ✅ |
| [15] | ✅ |
| [16] | ✅ |
| [17] | ✅ |
| [18] | ✅ |
| [19] | ✅ |
| [20] | ✅ |
| [21] | ✅ |
| [22] | ✅ |
| [23] | ✅ |
| [24] | ✅ |
| [25] | ✅ |
| [26] | ✅ |
| [27] | ✅ |
| [28] | ✅ |
| [29] | ✅ |
| [30] | ✅ |
| [31] | ✅ |
| [32] | ✅ |
| [33] | ✅ |
| [34] | ✅ |
| [35] | ✅ |
| [36] | ✅ |
| [37] | ✅ |
| [38] | ✅ |
| [39] | ✅ |
| [40] | ✅ |
| [41] | ✅ |
| [42] | ✅ |
| [43] | ✅ |
| [V1] | ✅ |
| [V2] | ✅ |
| [V3] | ✅ |
| [V4] | ✅ |
| [V5] | ✅ |
| [V6] | ✅ |
| [V7] | ✅ |
| [V8] | ✅ |

**Summary:** ✅ DONE: **51** · ⚠️ PARTIAL: **0** · ❌ NOT DONE: **0** (total **51** lines: [1]–[43] + [V1]–[V8])

---

## ❌ NOT DONE (0)

None at this audit revision.

---

## ⚠️ PARTIAL (0)

None. Residual product scope (e.g. future dedicated E2E runner in CI) is tracked outside this checklist.

---

## ✅ DONE (51) — highlights

**[5]** Stock deduct at payment only: `inventorySettingsService.js` always exposes `payment`; PATCH/setup/platform paths normalize to `payment`; migration `2026-04-28-006-stock-deduct-payment-only.js` backfills legacy values.

**[31] / [32] / [V8]** Shared `export-pdf.ts` / `export-excel.ts` wired across major reports and inventory admin, wastage (by reason + entries), and menu availability.

**[33]** `ReportCompareControls` + compare tables on headline revenue reports, P&amp;L, and discount audit summary.

**[41]** Register sessions page includes an on-screen **cash close checklist** before the sessions table; close flow still uses `cashReconciliationLog` + session summary.

**[V1]** `order-lifecycle-selftest.js` validates module load; with `MONGODB_URI` / `MONGO_URL`, runs optional MongoDB connectivity smoke against the `orders` collection.

**Features [1]–[43]:** includes [2] table `closed`→`available` sequencing in `orderController.js`, floor badge tones, [6] `categoryRoute.js` + `authedTenantLocation`, [9] receipt line totals + modifier display in `orderPrinting.js` + `modifierAdjustmentForLine` export, [12] `isBranchKitchenWorkflowEnabled` in `orderController.js`, [13] branch VAT + workflow + discount reason on `locations/page.tsx`, [14] `2026-04-27-004-user-locationIds-backfill.js`, [15] recent orders deep link, [19] `menuItemModel` `isActive` virtual, [21] `discountCatalogModel.js`, [22] line `discount.scope`, [23] branch `discountReasonRequired`, [35] `node-cron` in `reportScheduleService.js`, [38] `sales-by-waiter` report page, [39] discount audit date range + revenue % summary + columns + exports, [40] AP list/detail aliases on `accountingRoute.js`, [43] `auditLogModel.js` alias + cross-links POS vs GL audit pages.

**Integration [V1]–[V8]:** as above; [V2]–[V7] unchanged from prior audit.

---

## Reference (primary files touched by audit)

- Order lifecycle: `orderModel.js`, `orderController.js`
- Table / floor: `tableModel.js`, `orderController.js` (`releaseTableByOrderId`), `floor-tables-columns.tsx`, `table-modal.tsx`, `floor-table-types.ts`
- Branch / location: `locationModel.js`, `locationController.js`, `categoryRoute.js`, `dashboardRoute.js`, `reportRoute.js`, `tenantRouteStacks`, `pos-api-fetch.ts`, `use-dashboard-location-scope.ts`, `dashboard-location-header.tsx`
- Journal / P&amp;L: `accountingService.js`, `paymentController.js` (JSDoc: sale journals from `orderController` / `onOrderBecamePaid`)
- Stock: `inventoryService.js`, `accountingConfigModel.js`, `inventorySettingsService.js`
- Modifiers / printing: `orderPrinting.js`, `orderTotals.js` (`modifierAdjustmentForLine`)
- Staff: `userModel.js`, `staffController.js`, `migrations/registry.js`
- Dashboard: `dashboardService.js`, `recent-orders-widget.tsx`
- Reports / exports: `reportController.js`, `reportRoute.js`, `export-pdf.ts`, `export-excel.ts`, `dashboard/reports/*`, `inventory/wastage/page.tsx`, `inventory/menu-availability/page.tsx`
- Schedules: `reportScheduleService.js` (`node-cron`)
- Audit: `posAuditLogModel.js`, `auditLogModel.js`, `discountAuditModel.js`, `discountCatalogModel.js`
- QA scripts: `scripts/zerowix-qa-checklist-selftest.js` (static re-check + `tsc` + order lifecycle), `apps/pos-backend/scripts/order-lifecycle-selftest.js`
