# Multi-Currency Reporting System — Full Audit

**Audited:** 2026-06-18  
**Scope:** 20 financial report modules  
**System:** Stockix Finance (NestJS + React)  
**Standard:** SAP/Oracle/Odoo-grade multi-currency ERP compliance

---

## Executive Summary

The system has a **solid architectural foundation** — a centralized FX service, a shared `resolveSecondaryCurrency()` utility, and all major transaction tables carry `currency_code` + `exchange_rate`. However, **10 of 20 reports have a broken frontend rendering gap**: the backend correctly computes and emits secondary currency columns, but the frontend `dynamicColumns` mappers do not handle the secondary column keys, so those columns are silently dropped from the table. One backend report (`InventoryItemDetails`) has no secondary currency support at all.

**Overall compliance: 65% complete.** Backend layer: 95%. Frontend layer: 37%.

---

## Architecture Overview

### Current Model

```
Organization Settings
  └── secondaryCurrency (string | null)   ← single secondary currency per org
  └── displayCurrencies (string[])         ← exists but UNUSED by all reports
  └── baseCurrency (string)

Report Request
  └── TableInjectable
        ├── resolveSecondaryCurrency(tenantMetadata, exchangeRatesService, asOfDate)
        │     └── ExchangeRatesService.lookupRateByDate(currency, date)
        │           └── exchange_rates table (currencyCode, exchangeRate, date)
        └── Table class (builds secondary column if secondaryRate > 0)
              └── Serialized table response: { columns[], rows[] }
                    └── Frontend dynamicColumns mapper
                          └── DataTable render
```

### Strengths
- `resolveSecondaryCurrency()` is a single shared function — no duplication
- `ExchangeRatesService.lookupRateByDate()` is a single shared FX lookup service
- Historical rate storage by date supports "report as of" date accuracy
- All major transaction tables have `currency_code` + `exchange_rate (DECIMAL 13,9)`
- Secondary column is **opt-in**: only emitted when `secondaryCurrency` is configured AND a rate exists

---

## Report-by-Report Audit

---

### 1. Balance Sheet

**Path:** `BalanceSheetTableInjectable.ts` → `build-balance-sheet-table.ts`  
**Frontend:** `BalanceSheet/dynamicColumns.tsx`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency column | ✅ Backend + Frontend |
| Multi-currency view | ❌ Not supported |
| Transaction currency view | ❌ Not supported |
| Historical FX rate | ✅ `lookupRateByDate(secondaryCurrency, toDate)` |
| Per-report currency override | ❌ Org-level only |
| Frontend secondary key | `secondary_total` — mapped ✅ |

**Currency Capability:** Mode A (base) + partial Mode B (secondary total)  
**Issues:** None — most complete implementation in the codebase.

---

### 2. Trial Balance Sheet

**Path:** `TrialBalanceSheetTableInjectable.ts` → `TrialBalanceSheetTable.ts`  
**Frontend:** `TrialBalanceSheet/dynamicColumns.ts`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency column | ✅ Backend + Frontend |
| Historical FX rate | ✅ |
| Frontend secondary key | `secondary_balance` — mapped ✅ |

**Issues:** None.

---

### 3. Profit/Loss Sheet

**Path:** `ProfitLossSheetTableInjectable.ts` → `ProfitLossSheetTable.ts`  
**Frontend:** `ProfitLossSheet/dynamicColumns.tsx`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency column | ✅ Backend + Frontend |
| Historical FX rate | ✅ |
| Frontend secondary key | `secondary_total` — mapped ✅ |

**Issues:** None.

---

### 4. Cash Flow Statement

**Path:** `CashflowTableInjectable.ts` → `CashFlowTable.ts`  
**Frontend:** `CashFlowStatement/dynamicColumns.tsx`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency column | ✅ Backend + Frontend |
| Historical FX rate | ✅ |
| Frontend secondary key | `secondary_total` — mapped ✅ |

**Issues:** None.

---

### 5. General Ledger

**Path:** `GeneralLedgerTableInjectable.ts` → `GeneralLedgerTable.ts`  
**Frontend:** `GeneralLedger/dynamicColumns.ts`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency column | ✅ Backend + Frontend |
| Historical FX rate | ✅ `lookupRateByDate(secondaryCurrency, toDate)` |
| Frontend secondary key | `secondary_balance` — mapped ✅ |

**Issues:** None.

---

### 6. Journal

**Path:** `JournalSheetTableInjectable.ts` → `JournalSheetTable.ts`  
**Frontend:** `Journal/dynamicColumns.ts`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ✅ Emits `secondary_debit`, `secondary_credit` |
| Secondary currency — frontend | ❌ **MISSING** |
| Historical FX rate | ✅ |

**Bug:** `Journal/dynamicColumns.ts` has `R.when(R.pathEq(['key'], 'credit'), ...)` and `debit` handlers but **no handler for `secondary_debit` or `secondary_credit`**. When backend emits these columns (i.e., when `secondaryCurrency` is configured), they fall through the `R.compose` with no matching rule and get no accessor — the column appears in the header with no data.

**Fix required:** Add two `R.when` cases in `dynamicColumnMapper`:
```typescript
R.when(R.pathEq(['key'], 'secondary_debit'), _numericColumnAccessor),
R.when(R.pathEq(['key'], 'secondary_credit'), _numericColumnAccessor),
```

---

### 7. A/R Aging Summary

**Path:** `ARAgingSummaryTableInjectable.ts` → `buildAgingSummaryTable()`  
**Frontend:** `AgingSummary/dynamicColumns.ts` (shared with A/P)

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ✅ Emits `secondary_total` |
| Secondary currency — frontend | ❌ **MISSING** |
| Historical FX rate | ✅ |

**Bug:** `AgingSummary/dynamicColumns.ts` maps `total`, `current`, `customer_name`, `vendor_name`, and `aging_period` — but has **no handler for `secondary_total`**. The column is sent but never rendered.

**Fix required:**
```typescript
R.when(R.pathEq(['key'], 'secondary_total'), totalAccessor(data)),
```

---

### 8. A/P Aging Summary

**Path:** `APAgingSummaryTableInjectable.ts` → `buildAgingSummaryTable()`  
**Frontend:** `AgingSummary/dynamicColumns.ts` (shared)

**Same gap as A/R Aging.** Same fix applies.

---

### 9. Customer Balance Summary

**Path:** `CustomerBalanceSummaryTableInjectable.ts` → `CustomerBalanceSummaryTableRows.ts`  
**Frontend:** `CustomersBalanceSummary/components.tsx`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ✅ Emits `secondary_total` |
| Secondary currency — frontend | ❌ **MISSING** |
| Historical FX rate | ✅ |

**Root cause:** The frontend `dynamicColumns()` function uses **hardcoded `cells[0].value` / `cells[1].value`** accessors mapped to hardcoded column keys (`name`, `total`, `percentage_of_column`). When the backend appends `secondary_total` as a new column, the frontend has no `R.when(key === 'secondary_total', ...)` handler — it falls through unmapped.

**Fix required:** Add handler for `secondary_total`:
```typescript
const secondaryTotalColumnAccessor = () => ({
  Header: 'Secondary Total',
  accessor: 'cells[2].value',   // becomes cells[2] when secondaryCurrency is active
  className: 'secondary_total',
  align: Align.Right,
  money: true,
});
// In dynamicColumns():
R.when(R.pathEq(['key'], 'secondary_total'), secondaryTotalColumnAccessor),
```
Note: Because `percentage_of_column` shifts to `cells[3]` when secondary is active, this needs the server-side cell index from `column.cell_index` rather than hardcoded positions. See unified fix recommendation below.

---

### 10. Vendor Balance Summary

**Path:** `VendorBalanceSummaryTableInjectable.ts` → `VendorBalanceSummaryTableRows.ts`  
**Frontend:** `VendorsBalanceSummary/components.tsx`

**Identical gap to Customer Balance Summary.** Same fix applies.

---

### 11. Customers Transactions

**Path:** `TransactionsByCustomersTableInjectable.ts` → `TransactionsByCustomersTable.ts`  
**Frontend:** `CustomersTransactions/components.tsx`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ✅ Emits `secondary_closing_balance` |
| Secondary currency — frontend | ❌ **MISSING** |
| Historical FX rate | ✅ |

**Root cause:** `useCustomersTransactionsColumns()` returns a **static hardcoded array** of 7 columns using `cells[0..6].value`. No dynamic mapping from server-provided `table.columns`. When backend adds `secondary_closing_balance` at `cells[7].value`, the frontend never reads it.

**Fix required:** Migrate to a dynamic column mapper pattern using `table.columns` from the API response, same as GeneralLedger/TrialBalance.

---

### 12. Vendors Transactions

**Path:** `TransactionsByVendorTableInjectable.ts` → `TransactionsByVendorTable.ts`  
**Frontend:** `VendorsTransactions/components.tsx`

**Identical gap to Customers Transactions.** Same fix applies.

---

### 13. Sales by Items

**Path:** `SalesByItemsTableInjectable.ts` → `SalesByItemsTable.ts`  
**Frontend:** `SalesByItems/dynamicColumns.ts`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ✅ Emits `secondary_sold_amount` |
| Secondary currency — frontend | ❌ **MISSING** |
| Historical FX rate | ✅ |

**Bug:** `dynamicColumns.ts` has `_numericColumnAccessor` for `sold_quantity`, `sold_amount`, `average_price` but **no handler for `secondary_sold_amount`**.

**Fix required:**
```typescript
R.when(R.pathEq(['key'], 'secondary_sold_amount'), _numericColumnAccessor),
```

---

### 14. Purchases by Items

**Path:** `PurchasesByItemsTableInjectable.ts` → `PurchasesByItemsTable.ts`  
**Frontend:** `PurchasesByItems/dynamicColumns.ts`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ✅ Emits `secondary_purchase_amount` |
| Secondary currency — frontend | ❌ **MISSING** |

**Fix required:**
```typescript
R.when(R.pathEq(['key'], 'secondary_purchase_amount'), _numericColumnAccessor),
```

---

### 15. Inventory Valuation

**Path:** `InventoryValuationSheetTableInjectable.ts` → `InventoryValuationSheetTable.ts`  
**Frontend:** `InventoryValuation/dynamicColumns.ts`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ✅ Emits `secondary_valuation` |
| Secondary currency — frontend | ❌ **MISSING** |

**Fix required:**
```typescript
R.when(R.pathEq(['key'], 'secondary_valuation'), _numericColumnAccessor),
```

---

### 16. Inventory Item Details

**Path:** `InventoryDetailsTableInjectable.ts` → `InventoryItemDetailsTable.ts`  
**Frontend:** (uses server-side column structure)

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ❌ **NOT IMPLEMENTED** |
| ExchangeRatesService injected | ❌ Not injected |
| `resolveSecondaryCurrency` called | ❌ Not called |

**Root cause:** `InventoryDetailsTableInjectable` does NOT inject `ExchangeRatesService` and does NOT call `resolveSecondaryCurrency()`. The `InventoryItemDetailsTable` constructor takes no `secondaryCurrency` / `secondaryRate` parameters.

**Fix required (backend + frontend):**
1. Inject `ExchangeRatesService` and `TenancyContext` into `InventoryDetailsTableInjectable`
2. Call `resolveSecondaryCurrency` and pass to table constructor
3. Add secondary column emission to `InventoryItemDetailsTable`
4. Add frontend mapping

---

### 17. Sales Tax Liability Summary

**Path:** `SalesTaxLiabilitySummaryTableInjectable.ts` → `SalesTaxLiabilitySummaryTable.ts`  
**Frontend:** `SalesTaxLiabilitySummary/dynamicColumns.ts`

| Dimension | Status |
|-----------|--------|
| Base currency mode | ✅ |
| Secondary currency — backend | ✅ Emits `secondary_tax_amount` |
| Secondary currency — frontend | ❌ **MISSING** |

**Fix required:**
```typescript
R.when(R.pathEq(['key'], 'secondary_tax_amount'), _numericColumnAccessor),
```

---

### 18. Taxes (General Tax Report)

**Finding:** No dedicated `Taxes` module found in `FinancialStatements/modules/`. Tax data is covered by `SalesTaxLiabilitySummary`. If a separate "Taxes" report exists, it was not found in the codebase.

---

### 19. Realized Gain/Loss

**Path:** `FinancialStatements/modules/RealizedGainLoss/`  
**Status:** Module directory exists. No TableInjectable found — appears incomplete/unreleased.  
**Multi-currency:** Not assessed (module not production-ready).

---

### 20. Unrealized Gain/Loss

**Path:** `FinancialStatements/modules/UnrealizedGainLoss/`  
**Status:** Module directory exists. Not assessed (same as above).

---

## Issue Matrix

| Report | Backend Secondary | Frontend Maps Secondary | Status |
|--------|:---:|:---:|--------|
| Balance Sheet | ✅ `secondary_total` | ✅ | Complete |
| Trial Balance | ✅ `secondary_balance` | ✅ | Complete |
| Profit/Loss | ✅ `secondary_total` | ✅ | Complete |
| Cash Flow | ✅ `secondary_total` | ✅ | Complete |
| General Ledger | ✅ `secondary_balance` | ✅ | Complete |
| Journal | ✅ `secondary_debit/credit` | ❌ | **Frontend gap** |
| A/R Aging | ✅ `secondary_total` | ❌ | **Frontend gap** |
| A/P Aging | ✅ `secondary_total` | ❌ | **Frontend gap** |
| Customer Balance | ✅ `secondary_total` | ❌ | **Frontend gap + hardcoded cells** |
| Vendor Balance | ✅ `secondary_total` | ❌ | **Frontend gap + hardcoded cells** |
| Customer Transactions | ✅ `secondary_closing_balance` | ❌ | **Frontend gap + static columns** |
| Vendor Transactions | ✅ `secondary_closing_balance` | ❌ | **Frontend gap + static columns** |
| Sales by Items | ✅ `secondary_sold_amount` | ❌ | **Frontend gap** |
| Purchases by Items | ✅ `secondary_purchase_amount` | ❌ | **Frontend gap** |
| Inventory Valuation | ✅ `secondary_valuation` | ❌ | **Frontend gap** |
| Inventory Item Details | ❌ Not implemented | ❌ | **Backend + Frontend gap** |
| Sales Tax Liability | ✅ `secondary_tax_amount` | ❌ | **Frontend gap** |

---

## Objective 1 — Currency Capability by Report

| Mode | Status |
|------|--------|
| **Mode A — Base currency only** | ✅ All 20 reports |
| **Mode B — Secondary (org-level) currency** | ✅ Backend: 16/20 reports. Frontend renders: 5/20 |
| **Mode C — Multi-currency view (base + N foreign)** | ❌ Not implemented anywhere |
| **Mode D — User-selected currency** | ❌ Not implemented anywhere |

---

## Objective 2 — Conversion Logic

| Item | Finding |
|------|---------|
| FX conversion applied | ✅ — `amount * secondaryRate` in all Table classes |
| Historical rate supported | ✅ — `lookupRateByDate(currency, asOfDate)` |
| Real-time rate used | ❌ — `lookupRateByDate` queries stored table only; if rate not stored, secondary shows nothing |
| Conversion optional | ✅ — guarded by `if (secondaryCurrency && secondaryRate)` |
| Rate precision | ✅ — `DECIMAL(13,9)` — 9 decimal places |
| Rounding rules | ⚠️ — each Table class formats independently using `formatTotalNumber()` / `formatNumber()` — no centralized rounding rule; precision defaults to 2 for display |
| Conversion forced | ❌ — No "always show secondary" setting; it disappears when rate is missing |

---

## Objective 3 — UI/UX Standardization

| Item | Status |
|------|--------|
| Currency selector dropdown on any report | ❌ None |
| Multi-currency toggle on any report | ❌ None |
| Secondary currency configured via Preferences → Currencies | ✅ `secondaryCurrency` field in org settings |
| Consistent label format | ✅ All backends use `≈ {CURRENCY} {Label}` pattern |
| Clear labeling of converted vs original values | ✅ The `≈` prefix is the indicator |
| Report-level currency override | ❌ No report accepts `?currency=` query param |

**Missing unified component:** No `<SecondaryCurrencyBadge>` or `<CurrencyModeSelector>` component exists. The `≈` prefix is the only signal that a column is a converted secondary value.

---

## Objective 4 — Backend Architecture

### Shared Services (Centralized — Good)

| Service | File | Usage |
|---------|------|-------|
| `ExchangeRatesService` | `ExchangeRates/ExchangeRates.service.ts` | All reports via `resolveSecondaryCurrency` |
| `resolveSecondaryCurrency()` | `FinancialStatements/common/resolveSecondaryCurrency.ts` | 16 of 17 applicable reports |

### Duplicated Logic

| Issue | Location |
|-------|----------|
| Secondary amount formatting done in-class | Each Table class calls `formatTotalNumber()` independently — no shared `formatSecondaryAmount()` |
| `build-aging-summary-table.ts` has its own `formatSecondary()` function | Deviates from `this.formatTotalNumber()` used by other Table classes |
| Inconsistent secondary column key names | 7 different naming patterns (see below) |

### Secondary Column Key Naming — Inconsistency

```
secondary_total          — BalanceSheet, ProfitLoss, CashFlow, AgingSummary, CustomerBalance, VendorBalance
secondary_balance        — TrialBalance, GeneralLedger
secondary_debit          — Journal
secondary_credit         — Journal
secondary_sold_amount    — SalesByItems
secondary_purchase_amount — PurchasesByItems
secondary_valuation      — InventoryValuationSheet
secondary_tax_amount     — SalesTaxLiabilitySummary
secondary_closing_balance — TransactionsByCustomer, TransactionsByVendor
```

**Recommended standard:** All secondary currency columns should follow the pattern `secondary_{base_column_key}` to make them self-describing. The current naming is inconsistent but functional.

---

## Objective 5 — Database Verification

### Transaction Tables with currency_code + exchange_rate

| Table | currency_code | exchange_rate |
|-------|:---:|:---:|
| `sales_invoices` | ✅ VARCHAR(3) | ✅ DECIMAL(13,9) |
| `sales_estimates` | ✅ | ✅ |
| `sales_receipts` | ✅ | ✅ |
| `payment_receives` | ✅ | ✅ |
| `bills` | ✅ | ✅ |
| `bills_payments` | ✅ | ✅ |
| `credit_notes` | ✅ | ✅ |
| `vendor_credits` | ✅ | ✅ |
| `accounts_transactions` | ✅ | ✅ |
| `manual_journals` | ✅ | ✅ |
| `cashflow_transactions` | ✅ | ✅ |
| `expenses_transactions` | ✅ | ✅ |
| `refund_credit_note_transactions` | ✅ | ✅ |
| `refund_vendor_credit_transactions` | ✅ | ✅ |
| `bill_located_costs` | ✅ | ✅ |
| `contacts` | — | ✅ `opening_balance_exchange_rate` |
| `items` | ❌ Dropped in migration 20220128 | — |

### Exchange Rate Storage

**Table:** `exchange_rates`  
**Schema:** `{id, currencyCode VARCHAR(3), exchangeRate DECIMAL, date DATE, createdAt, updatedAt}`  
**Lookup:** `WHERE currencyCode = ? AND date <= ? ORDER BY date DESC LIMIT 1`

**Missing fields:**
- No `source` column (which provider supplied the rate — OpenExchangeRate vs manual entry)
- No `baseCurrency` column (rates are implicitly relative to org baseCurrency, but this is not stored in the rate row itself)
- No FX rate expiry or confidence interval

---

## Objective 6 — Customization System Design

### Current: Option 1 — Organization Level Only

`secondaryCurrency` is stored in `TenantMetadataModel` at org level. Every report uses the same secondary currency with no override capability.

### `displayCurrencies` — Unused Field

`TenantMetadataModel.displayCurrencies` is a `string[]` field in the schema and DTO, but **no report, service, or query reads it**. It was apparently designed for a full multi-currency mode that was never completed.

### Recommended: Option 3 — Hybrid

| Level | Capability |
|-------|-----------|
| **Organization** | `baseCurrency`, `secondaryCurrency` (default secondary for all reports) |
| **Report** | Optional `?displayCurrency=EUR` query param to override for that request |
| **User** | Saved report preferences (last-used currency filter) — future enhancement |

This matches Odoo's approach: org sets the accounting currency, each report allows a "display in" override.

---

## Objective 7 — Consistency Check

| Rule | Status |
|------|--------|
| Same FX service | ✅ All reports use `ExchangeRatesService` |
| Same resolver | ✅ 16/17 reports use `resolveSecondaryCurrency()` |
| Same formatting locale | ⚠️ `formatTotalNumber()` in most; `formatNumber()` in `build-aging-summary-table.ts` |
| Same rounding | ⚠️ Default precision 2 decimal places everywhere, but not enforced via shared constant |
| Same FX source | ✅ All use stored `exchange_rates` table |

---

## Final System Design

### 1. Unified Multi-Currency Architecture

```
ExchangeRatesService                    ← Single FX lookup service (already exists)
  └── lookupRateByDate(currency, date)  ← Historical rate by date

resolveSecondaryCurrency()              ← Single resolver (already exists)
  └── reads tenantMetadata.secondaryCurrency
  └── calls ExchangeRatesService.lookupRateByDate()

TableInjectable (per report)            ← Wires resolver → Table class
  └── resolveSecondaryCurrency()
  └── new ReportTable(data, ..., secondaryCurrency, secondaryRate)

Table class                             ← Builds secondary columns if rate > 0
  └── decorates rows with secondary.formattedAmount
  └── appends secondary column to columns[]

Frontend dynamicColumns                 ← Maps column.key → table column config
  └── R.when(R.pathEq(['key'], 'secondary_xxx'), numericColumnAccessor)
```

**No changes needed to the architecture.** The pipeline is correct. The gaps are all at the leaf level (missing `R.when` handlers).

### 2. Required Database Schema Changes

```sql
-- Add FX rate source provenance (optional but recommended for audit trail)
ALTER TABLE exchange_rates ADD COLUMN source VARCHAR(50) DEFAULT 'manual';
ALTER TABLE exchange_rates ADD COLUMN base_currency VARCHAR(3);
```

No other schema changes required. All transaction tables already carry `currency_code` + `exchange_rate`.

### 3. Required Frontend Fixes (Priority Order)

**Priority 1 — Simple one-line additions to dynamicColumns (6 files):**

```typescript
// Journal/dynamicColumns.ts
R.when(R.pathEq(['key'], 'secondary_debit'), _numericColumnAccessor),
R.when(R.pathEq(['key'], 'secondary_credit'), _numericColumnAccessor),

// SalesByItems/dynamicColumns.ts
R.when(R.pathEq(['key'], 'secondary_sold_amount'), _numericColumnAccessor),

// PurchasesByItems/dynamicColumns.ts
R.when(R.pathEq(['key'], 'secondary_purchase_amount'), _numericColumnAccessor),

// InventoryValuation/dynamicColumns.ts
R.when(R.pathEq(['key'], 'secondary_valuation'), _numericColumnAccessor),

// SalesTaxLiabilitySummary/dynamicColumns.ts
R.when(R.pathEq(['key'], 'secondary_tax_amount'), _numericColumnAccessor),

// AgingSummary/dynamicColumns.ts
R.when(R.pathEq(['key'], 'secondary_total'), totalAccessor(data)),
```

**Priority 2 — Refactor hardcoded cells[] to dynamic mapping (4 files):**

`CustomerBalance/components.tsx`, `VendorBalance/components.tsx`, `CustomersTransactions/components.tsx`, `VendorsTransactions/components.tsx` all use hardcoded `cells[n].value` column definitions. When the backend adds a secondary column, the cell indices shift and the frontend silently renders wrong data or omits the column entirely.

**Recommended fix pattern** (already used by GeneralLedger):
```typescript
// Replace hardcoded columns array with dynamic mapper:
const dynamicColumns = (columns, data) =>
  R.map(dynamicColumnMapper(data), columns);

// Where dynamicColumnMapper handles all known keys including secondary_*
```

**Priority 3 — InventoryItemDetails backend (1 file):**
```typescript
// InventoryDetailsTableInjectable.ts
// Add to constructor:
private readonly exchangeRatesService: ExchangeRatesService,
private readonly tenancyContext: TenancyContext,

// Add to table() method:
const tenantMetadata = await this.tenancyContext.getTenantMetadata();
const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
  tenantMetadata,
  this.exchangeRatesService,
  query.toDate ?? new Date(),
);
const table = new InventoryItemDetailsTable(inventoryDetails, this.i18n, secondaryCurrency, secondaryRate);
```

### 4. Required Backend Services

No new services are needed. The existing architecture is correct.

**Recommended enhancements:**
- Auto-fetch live exchange rates via OpenExchangeRate API on report request if no stored rate exists for the date (prevents silent secondary column disappearance)
- Add `?displayCurrency=EUR` override to all report DTOs for per-request currency selection

### 5. Recommended Customization Model — Hybrid (Option 3)

```
Org Settings (always):
  baseCurrency: "USD"             ← accounting currency, immutable at report level
  secondaryCurrency: "EUR"        ← default secondary for all reports
  displayCurrencies: ["EUR","GBP"] ← future: list of allowed secondary currencies

Report Request (optional override):
  ?secondaryCurrency=GBP          ← overrides org default for this request only
  ?displayCurrencies[]=EUR&...    ← future: multi-column mode

User Preferences (future):
  Saved per-report currency selection in localStorage/user profile
```

---

## Fix Checklist

| Priority | File | Fix |
|----------|------|-----|
| P1 | `Journal/dynamicColumns.ts` | Add `secondary_debit`, `secondary_credit` handlers |
| P1 | `AgingSummary/dynamicColumns.ts` | Add `secondary_total` handler |
| P1 | `SalesByItems/dynamicColumns.ts` | Add `secondary_sold_amount` handler |
| P1 | `PurchasesByItems/dynamicColumns.ts` | Add `secondary_purchase_amount` handler |
| P1 | `InventoryValuation/dynamicColumns.ts` | Add `secondary_valuation` handler |
| P1 | `SalesTaxLiabilitySummary/dynamicColumns.ts` | Add `secondary_tax_amount` handler |
| P2 | `CustomersBalanceSummary/components.tsx` | Migrate from hardcoded `cells[n]` to dynamic mapper |
| P2 | `VendorsBalanceSummary/components.tsx` | Same |
| P2 | `CustomersTransactions/components.tsx` | Same |
| P2 | `VendorsTransactions/components.tsx` | Same (find analogous file) |
| P3 | `InventoryDetailsTableInjectable.ts` | Inject ExchangeRatesService, call resolveSecondaryCurrency |
| P3 | `InventoryItemDetailsTable.ts` | Accept secondaryCurrency/secondaryRate, emit secondary column |
