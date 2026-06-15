# Inventory / stock — master backlog (“do it once, run forever”)

**Document type:** Single source of truth for **remaining work**, **acceptance criteria**, and **operational rules** until the inventory module is considered **professionally complete** for your org.  
**Audience:** Engineering, product, finance/ops, support.  
**Codebases:** `apps/pos-backend`, `apps/pos-frontend2`, `apps/saas-dash` (platform).

**North star:** One coherent model (org → locations → balances/lots → movements → accounting/audit), **no silent drift**, **predictable failures**, **testable contracts**, **observable** behavior in production.

---

## 0. Principles (non-negotiable for “done”)

1. **Single source of truth for on-hand quantity** per tenant: `StockBalance` rows (including `bin` where used); `Ingredient.currentStock` is a **derived/cache** synced from balances, not an alternate ledger for org tenants.
2. **Every mutation that changes quantity or valuation** is either inside a **MongoDB transaction** or explicitly documented as intentionally best-effort with compensating logic.
3. **No silent fallbacks** that change meaning: if org + inventory is in use, **location resolution** must succeed or the API returns a **clear 4xx** with an actionable message.
4. **RBAC** is enforced on every inventory route; cost/valuation endpoints require explicit cost permission.
5. **Idempotency** where duplicates are likely (offline replay, double-submit, webhook retries).
6. **Traceability:** `StockMovement` for operational truth; `InventoryAuditEvent` (or successor) for **who / what / when** at policy granularity you adopt.
7. **Documentation:** movement-reason → GL behavior matrix; operator runbooks; API changelog for breaking changes.

---

## 1. Current gaps (carry-over checklist)

These are the **known partials / missing pieces** to close. Details in sections 2–11.

| ID | Area | Status today | Target “done” |
|----|------|----------------|-----------------|
| G1 | Serial UX vs stock take | Post blocked; adjust works | Guided UI + stable API error contract + runbook |
| G2 | Expiry operator UX | Strict logic + alerts; weak day-to-day view | Expiring/expired dashboard + GRN emphasis |
| G3 | Stock take `cycle` vs `spot` | Same seeding | Product-defined different behavior **or** collapse to one mode |
| G4 | GL vs every movement | Stock take net journal only | Agreed matrix + optional journals per reason + config UI |
| G5 | Offline inventory adjust | Queue flush, no merge | Idempotency keys + version/conflict policy + POS UX |
| G6 | Reservations vs no location | Skip + warn | Tenant health + optional user-visible warning or strict policy (product pick) |
| G7 | Platform inventory | Stub page | Read-only aggregates **or** documented out-of-scope |
| G8 | Responsive inventory UI | Not fully QA’d | Breakpoint QA + table patterns + optional E2E viewport |
| G9 | Audit MVP | Not all paths; no export | Emitters complete for agreed list + read API + export optional |
| G10 | High concurrency | Txn-based RMW | Metrics + optional `$inc` hot path where safe |
| G11 | Org-less legacy path | `currentStock` deduct path | Migration + deprecation flag + removal timeline |

---

## 2. Data model & migrations (foundation)

### 2.1 Organization + location invariants

- [ ] **Invariant:** Every production tenant that uses inventory has **≥1** `Location` scoped to `organization`.
- [ ] **Bootstrap:** One-click or scripted “create default branch + migrate legacy totals” using existing `bootstrapBalances` / org onboarding; **idempotent**.
- [ ] **Guard:** Admin dashboard **banner** when `reserveStockOnPending === true` and location count is 0.
- [ ] **DB:** Document compound indexes on `StockBalance` (`organization`, `location`, `ingredient`, `bin`); run `syncIndexes` in deploy runbook after schema changes.

### 2.2 Deprecate org-less deduction path (G11)

- [ ] **Phase A:** Structured **warn** log when `inventorySettingsOrgId` is null on order deduct (include `orderId` if safe).
- [ ] **Phase B:** Feature flag `INVENTORY_REQUIRE_ORG=1` in staging: reject or redirect legacy path.
- [ ] **Phase C:** Remove legacy branch after all tenants migrated; **integration tests** cover org-only path only.

**Acceptance:** No code path in production mutates `ingredient.currentStock` without updating corresponding `StockBalance` where org + location exist.

---

## 3. Stock take (professional completion)

### 3.1 Cycle vs spot (G3)

**Decide (product):**

- **Option A — Differentiate:**  
  - `cycle`: deterministic subset (e.g. by category rotation, “A/B/C” class, or `lastCountedAt`).  
  - `spot`: user-chosen or random-capped subset (`maxLines`, seed from scan session).  
  - Persist rule version on `StockTakeSession` for audit (“seeded with rule v2”).
- **Option B — Collapse:** Single mode in API + UI; remove unused enum value; update [`pos-stock-take-api.ts`](apps/pos-frontend2/src/lib/pos-stock-take-api.ts) and Zod schemas.

**Acceptance:** API docs + UI labels match behavior; two sessions with same inputs produce explainable line sets.

### 3.2 Serial-tracked ingredients (G1)

- [ ] **UI:** Stock-take detail: detect `isSerialTracked` on any line → **blocking banner** + link to Adjust with serials; disable “post” CTA with tooltip if any serial line has variance.
- [ ] **API:** Stable machine-readable `code` (e.g. `STOCK_TAKE_SERIAL_VARIANCE`) on 400 response for localization.
- [ ] **Docs:** “How to count serial items” one-pager.

**Acceptance:** No user hits opaque 400; support can diagnose from response body alone.

### 3.3 GL for stock take (already partial — harden)

- [ ] Confirm `postStockTakeJournalEntry` **skips** cleanly when net variance ~0 or accounts missing; **no duplicate** journals on retry (idempotency key already — verify in tests).
- [ ] **UI:** Surface “posted to GL” / “skipped: missing accounts” on session detail when `journalEntry` link exists or skip reason returned (non-breaking API extension).

---

## 4. Lots, expiry, FEFO (G2)

### 4.1 Operator surfaces

- [ ] **GET** endpoint: lots expiring in N days + already expired on-hand (by location), permission-gated `backoffice.inventory.read`.
- [ ] **Dashboard:** “Expiry” widget or page: columns ingredient, location, lot, qty, expiry, days-to-expiry, link to movement.
- [ ] **GRN UI:** Require or strongly prompt expiry when `Ingredient`/policy marks lot as expiring-tracked (product rule).

### 4.2 Rules engine (if needed)

- [ ] Config: “block sale X days before expiry” vs “warn only” per org or per category (if product requires beyond today’s strict lot check).

**Acceptance:** Ops can answer “what expires this week at branch B?” without raw DB.

---

## 5. Sales, reservations, POS (G5, G6)

### 5.1 Reservations alignment

- [ ] **Product pick:** When `reserveStockOnPending` and location missing: (a) warn-only, (b) order-level warning field, (c) block order — implement **one** consistently across POS + API docs.
- [ ] **Telemetry:** Count `reservation_skipped_no_location` per org for support dashboards.

### 5.2 Offline adjust (G5)

- [ ] **Client:** Generate `clientMutationId` (UUID) per queued adjust; persist with queue row.
- [ ] **Server:** Unique index or idempotency collection on `(organization, clientMutationId)`; second submit returns same success payload.
- [ ] **Conflict:** Optional `expectedStockVersion` on `StockBalance` or ingredient; mismatch → **409** + `{ serverVersion, suggestion }` for POS merge UI.
- [ ] **UX:** Show “pending sync” / “failed: conflict” on inventory screens for queued adjusts.

**Acceptance:** Duplicate flush does not double-move stock; user can recover without DB surgery.

---

## 6. Purchasing, GRN, returns (end-to-end)

- [ ] **Vendor return:** Wrap multi-line `postReturn` in **one transaction** (today may be multi-step per line — verify and fix if gaps).
- [ ] **GRN:** Already transactional — add **contract tests** for PO line `quantityReceived`, incoming qty, balance, lot creation.
- [ ] **Customer return:** Already location-required — E2E test from API + UI.

**Acceptance:** Partial failure never leaves PO + stock + movement inconsistent.

---

## 7. Accounting & reporting (G4)

### 7.1 Movement → GL matrix (document first)

| StockMovement.reason (examples) | Posts GL? | Account source | Notes |
|----------------------------------|------------|------------------|--------|
| `order_deduction` | Via existing COGS flow | … | Link to order posting doc |
| `receive` (GRN) | Accrual / inventory | … | Already partial via GRNI |
| `correction` (stock take) | Net stock take journal | `defaultInventoryAssetAccount` / `defaultStockTakeVarianceAccount` | Done |
| `waste`, `manual_adjust`, `vendor_return`, … | **TBD** | Per `AccountingConfig` | Implement only after finance sign-off |

- [ ] Finance sign-off on matrix.
- [ ] Implement **idempotent** journal creation per reason (pattern from `postStockTakeJournalEntry`).
- [ ] **Admin UI** to map accounts per org; validate before enabling posting.

---

## 8. Audit & compliance (G9)

### 8.1 Coverage

- [ ] Grep all writers of `StockMovement` / balance mutations; attach `recordInventoryAudit` (or reject scope) for: restore, void-related stock paths, any adjust sub-reasons not yet covered.
- [ ] Define **minimum** list of actions for SOC2-style narrative (even if not certifying).

### 8.2 Read path

- [ ] `GET /api/inventory/audit-events?from=&to=&action=` paginated, RBAC.
- [ ] Optional CSV export (async job if large).

### 8.3 Retention (product)

- [ ] TTL index or archival job for `InventoryAuditEvent` after N days **or** “keep forever” with storage alert.

---

## 9. Performance & concurrency (G10)

- [ ] **Metrics:** Transaction retry count / `WriteConflict` for inventory routes.
- [ ] **Design:** Where safe, replace read-modify-write with `findOneAndUpdate` `$inc` on `StockBalance.quantity` inside same txn as movement insert (respect lot/costing ordering).
- [ ] **Load test:** Scripted concurrent adjusts on **same** `(location, ingredient)` — assert no negative qty, no lost updates.

---

## 10. Platform & multi-tenant (G7)

- [ ] **Decision:** Platform needs read-only cross-tenant KPIs or not.
- [ ] If yes: **aggregated** APIs only (no raw stock listing by default), rate-limited, platform RBAC, no PII in aggregates.
- [ ] Update [`saas-dash` inventory page](apps/saas-dash/src/app/(platform)/inventory/page.tsx) to consume API or explicitly “intentionally stub” with link to docs.

---

## 11. Frontend quality (G8)

- [ ] Inventory hub, stock-take list/detail, analytics, returns, warehouse: **mobile** breakpoints (375 / 768 / 1024), `overflow-x-auto`, sticky column headers where useful.
- [ ] Keyboard focus order and ARIA on dense tables (Radix/shadcn patterns).
- [ ] Optional: Playwright smoke for “open hub → adjust → see movement”.

---

## 12. Security & RBAC

- [ ] Matrix test: roles **without** `backoffice.inventory.write` cannot adjust/transfer/post stock take; **without** `backoffice.inventory.cost.read` cannot hit valuation/analytics cost tabs.
- [ ] POS catalog read vs inventory write separation verified on shared routes.
- [ ] **Pen-test checklist:** IDOR on `stock-take` session id across orgs (must 404).

---

## 13. Testing pyramid (definition of “done”)

### 13.1 Automated (required)

- [ ] `apps/pos-backend` `npm test` in CI on every PR touching inventory.
- [ ] Mongo-backed tests for: org with **zero** locations → adjust/returns/deduct behavior; location resolution errors; GRN idempotency if applicable.
- [ ] Contract tests for critical JSON shapes returned to `pos-frontend2` inventory clients.

### 13.2 Staging UAT (required before “production ready”)

Minimum scenarios (manual or scripted):

- [ ] A. Ingredient + balance creation (bootstrap)
- [ ] B. Stock increase (adjust receive, GRN)
- [ ] C. Stock decrease (order deduct, adjust waste)
- [ ] D. Transfer between two locations
- [ ] E. Adjustment (positive/negative, damaged `qualityStatus`)
- [ ] F. Customer return + vendor return posting
- [ ] G. Low stock alert path (API + webhook/socket if enabled)
- [ ] H. Valuation / report numbers tie to movements within tolerance
- [ ] I. History / movements list matches DB
- [ ] J. RBAC denial paths return 403
- [ ] K. Stock take full cycle including optional approval + GL line when variance non-zero
- [ ] L. Mobile layout sanity on inventory pages
- [ ] M. Offline adjust (if enabled): duplicate replay + conflict path

### 13.3 Sign-off log

Update the table when UAT completes:

| Scenario | Date | Tester | Pass/Fail | Notes |
|----------|------|--------|-------------|-------|
| A–M | | | | |

---

## 14. Observability & support

- [ ] Structured logs for: inventory adjust (org, ingredient, delta, reason, location), GRN confirm, stock take post, deduct failures, reservation skip.
- [ ] **Dashboards:** error rate on `/api/inventory/*`, p95 latency, txn retry rate.
- [ ] Runbook: “tenant says stock wrong” — steps: check last movements → check balance rows → check lot FEFO → check org location count.

---

## 15. Release & rollback

- [ ] Feature flags for: new GL reasons, offline conflict engine, `$inc` balance path, org-less removal.
- [ ] DB migrations backward-compatible (additive first).
- [ ] Rollback plan: disable flag, revert deploy; **no** destructive migration without backup.

---

## 16. Commands reference (validation & seeds)

```bash
# Unit / contract tests (no Mongo required for most)
cd apps/pos-backend && npm test

# Mongo-dependent inventory location tests
set MONGODB_URI=mongodb://127.0.0.1:27017/your-test-db
cd apps/pos-backend && npm test

# Rich isolated demo data (refuses prod unless ALLOW_DEV_SEED=1)
cd apps/pos-backend
npm run seed:inventory-ui
npm run seed:inventory-ui -- --force   # reset demo artifacts for that org
```

---

## 17. Final readiness gate (edit when true)

**Current statement:** Inventory module **still requires work** until sections **2–15** are executed per your product decisions and the UAT table in **§13.2** is filled with **Pass**.

**When complete, replace with:**  
`Inventory module is production ready — signed off <role> <date> — release <version>.`

---

## Appendix A — Key file index (starting points)

| Concern | Backend | Frontend |
|---------|---------|----------|
| Adjust / returns / report | [`inventoryController.js`](apps/pos-backend/controllers/inventoryController.js), [`inventoryRoute.js`](apps/pos-backend/routes/inventoryRoute.js) | `apps/pos-frontend2/.../dashboard/inventory/` |
| Balances / transfer | [`stockBalanceService.js`](apps/pos-backend/services/stockBalanceService.js), [`stockBalanceController.js`](apps/pos-backend/controllers/stockBalanceController.js) | Same hub |
| Deduct / strict / restore | [`inventoryService.js`](apps/pos-backend/services/inventoryService.js) | POS order flows |
| Reservations | [`orderReservationService.js`](apps/pos-backend/services/orderReservationService.js) | POS order create |
| Stock take | [`stockTakeController.js`](apps/pos-backend/controllers/stockTakeController.js), [`stockTakeRoute.js`](apps/pos-backend/routes/stockTakeRoute.js) | `stock-take/` pages |
| GRN | [`grnService.js`](apps/pos-backend/services/grnService.js) | GRN UI |
| GL stock take | [`accountingService.js`](apps/pos-backend/services/accountingService.js) | Accounting settings |
| Audit | [`inventoryAuditService.js`](apps/pos-backend/services/inventoryAuditService.js) | (future list/export UI) |
| Offline | [`offline-queue.ts`](apps/pos-frontend2/src/lib/offline-queue.ts), [`pos-check-sync.ts`](apps/pos-frontend2/src/lib/pos-check-sync.ts) | POS |

---

*This file replaces the former `stock.md` gap audit: same intent, expanded into a durable engineering and UAT contract.*
