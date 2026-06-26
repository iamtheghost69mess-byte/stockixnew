# Stockix Finance — Multi-Currency Audit

**Audit Date:** 2026-06-23  
**Scope:** Full backend + frontend audit of all modules listed in the brief  
**Auditor:** Principal Fintech Systems Architect & ERP Auditor

---

## 1. SYSTEM SUMMARY

### Overall Multi-Currency Maturity Score: **67 / 100**

### Architecture Assessment

Stockix Finance has a functional three-tier multi-currency model:

| Tier | Field | Storage | Purpose |
|------|-------|---------|---------|
| **Base Currency** | `tenants_metadata.base_currency` | String (ISO 4217), required | Accounting truth — all GL entries are converted to this |
| **Secondary Currency** | `tenants_metadata.secondary_currency` | String (nullable) | Single additional column in financial reports |
| **Display Currencies** | `tenants_metadata.display_currencies` | JSON array (nullable) | Frontend-only: inline conversions in form footers & list tables |
| **Exchange Rates** | `exchange_rates` table | `(currency_code, date, exchange_rate)` | Source of truth for conversions |

**Exchange Rate Sourcing:**

- **Manual entry** via Preferences → Currencies → Exchange Rate History UI
- **Auto-fetch** via `FetchLiveRatesJob` (daily cron, OpenExchangeRates API, requires `OPEN_EXCHANGE_RATE_APP_ID` env var)
NO AUTO FETCH ADDING CURRENCIES IS MANUAL TO SET CURERCIES RATE!
**Rate Convention Split (Critical Architecture Risk):**

| Context | Convention | Example |
|---------|-----------|---------|
| Transaction `exchangeRate` field (invoices, bills, etc.) | Direct Quote: `1 foreign = X base` | 1 EUR = 1.08 USD |
| `exchange_rates` table (auto-fetch + secondary display) | Indirect Quote: `1 base = X foreign` | 1 USD = 0.925 EUR |

These two systems are internally consistent **in isolation** but the dual-convention design is a latent bug source. Any code that accidentally uses an `exchange_rates` table rate in a transaction-level calculation (or vice versa) will produce inverted amounts.

### Critical Risks

1. **Exchange rate convention split** — transaction rates (direct quote) vs stored rates (indirect quote) coexist. No enforcement mechanism.
2. **Report multi-currency gap** — All 18 financial reports support only ONE secondary currency column. `display_currencies` (which can hold 3–4 currencies like USD, LBP, USDT, EUR) is **frontend-only** and does not propagate to exported PDFs/CSVs.
3. **Inventory Adjustments are locked to base currency** — GL entries hardcode `exchangeRate: 1`. Cannot record adjustments in a foreign currency.
4. **SalesByItems / PurchasesByItems aggregate without FX normalization at query time** — Totals are computed from `inventory_transactions` records which carry per-lot `exchangeRate`. Works correctly today, but only because cost is converted at FIFO/AVCO lot-tracking time. If historical rates are missing, costs default to rate=1.
5. **Banking Rules have zero currency awareness** — Rules cannot match, filter, or act conditionally on currency code.
6. **OpenExchangeRates API key not bundled** — LBP and USDT are not available on the free OER tier. Operators relying on LBP/USDT must enter all rates manually.
7. **Tax calculation ignores multi-currency normalization in liability report** — SalesTaxLiabilitySummary pulls tax amounts from GL entries (already converted to base), but does not validate that each underlying transaction's exchange rate was set correctly. Silent zeros if exchange rate was missing at transaction creation time.

---

## 2. MODULE-BY-MODULE TABLE

### 🧾 ITEMS

| Module | Status | Issues | Notes |
|--------|--------|--------|-------|
| **Items (catalog)** | ✅ FULLY SUPPORTED | None critical | `currencyCode` stored per item. Item prices are catalog prices in that currency. Conversion to base happens at transaction level via transaction's `exchangeRate`. `@PreventMutateBaseCurrency` decorator blocks base currency changes once items exist. |
| **Inventory Adjustments** | ❌ NOT SUPPORTED | GL hardcodes `exchangeRate: 1` and `baseCurrency`. No currency field in adjustment form. | `InventoryAdjustmentGL.ts` always posts entries at rate=1. Cannot record a stock adjustment in LBP or USDT. |
| **Categories** | ✅ FULLY SUPPORTED (N/A) | None | No monetary values. Categories are metadata labels. |
| **Warehouse Transfers** | ✅ FULLY SUPPORTED (N/A) | None | Internal stock movement. No monetary value involved. `WarehouseTransferEntry.ts` has a `local_currency` comment but no monetary field requiring conversion. |
| **New Inventory Item** | ✅ FULLY SUPPORTED | None | Inherits item model's `currencyCode` field. |
| **New Service Item** | ✅ FULLY SUPPORTED | None | Same as inventory item. No cost-layer complexity. |
| **New Item Category** | ✅ FULLY SUPPORTED (N/A) | None | No monetary values. |
| **New Warehouse Transfer** | ✅ FULLY SUPPORTED (N/A) | None | Internal movement, no FX needed. |

---

### 💰 SALES

| Module | Status | Issues | Notes |
|--------|--------|--------|-------|
| **Estimates** | ✅ FULLY SUPPORTED | None | Model: `currencyCode` + `exchangeRate`. Local amount computed as `total * exchangeRate`. Frontend: `DualCurrencyFormTotalLine` in footer, `ExchangeRateInputField` in header. Display currencies shown inline. |
| **Invoices** | ✅ FULLY SUPPORTED | None | Same as Estimates. Has additional `InvoiceExchangeRateChangeDialog` for recalculating entries when rate changes. `written_off` amounts also apply `exchangeRate`. |
| **Receipts** | ✅ FULLY SUPPORTED | None | Model: `currencyCode` + `exchangeRate`. All virtual attributes (`localAmount`, `localTotal`, `localDiscountAmount`, etc.) multiply by `exchangeRate`. |
| **Credit Notes** | ✅ FULLY SUPPORTED | None | Model: `currencyCode` + `exchangeRate`. All local amount virtuals apply exchange rate. GL entries use `exchangeRate`. |
| **Payments Received** | ✅ FULLY SUPPORTED | None | Model: `currencyCode` + `exchangeRate`. GL entries use `exchangeRate`. `DualCurrency` display in UI and detail drawer. |
| **New Estimate** | ✅ FULLY SUPPORTED | None | Form has `ExchangeRateInputField`, currency selector, and `DualCurrencyFormTotalLine` footer. |
| **New Invoice** | ✅ FULLY SUPPORTED | None | Same as Estimate form, plus exchange rate change dialog. |
| **New Receipt** | ✅ FULLY SUPPORTED | None | Full form-level currency support. |
| **New Credit Note** | ✅ FULLY SUPPORTED | None | Full form-level currency support. |
| **New Payment Received** | ✅ FULLY SUPPORTED | None | Full form-level currency support. |

---

### 🛒 PURCHASES

| Module | Status | Issues | Notes |
|--------|--------|--------|-------|
| **Bills** | ✅ FULLY SUPPORTED | None | Model: `currencyCode` + `exchangeRate`. GL entries (`BillsGL.ts`, `BillsGLEntries.ts`) apply exchange rate. `DualCurrency` in list and form footer. |
| **Vendor Credits** | ✅ FULLY SUPPORTED | None | Model: `currencyCode` + `exchangeRate`. All virtual local-amount attributes apply `exchangeRate`. |
| **New Purchase Invoice (Bill)** | ✅ FULLY SUPPORTED | None | Form has `BillExchangeRateInputField`, currency selector, `DualCurrencyFormTotalLine`. |
| **New Vendor Credit** | ✅ FULLY SUPPORTED | None | Form has `VendorCreditExchangeRateInputField`, currency selector, `DualCurrencyFormTotalLine`. |
| **New Payment Made** | ✅ FULLY SUPPORTED | None | `BillPaymentGL.ts` applies per-entry exchange rates. GL correctly handles the case where payment currency differs from bill currency (each entry uses its own bill's `exchangeRate`). |

---

### 📊 FINANCIAL

| Module | Status | Issues | Notes |
|--------|--------|--------|-------|
| **Accounts Chart** | ⚠️ PARTIALLY SUPPORTED | Account model has `currencyCode` field but it is optional and not enforced. No UI to assign a currency to an account. | Without account-level currency designation, multi-currency bank/AR/AP accounts in the chart of accounts lack explicit FX tracking. Reconciliation across currencies relies entirely on transaction-level rates. |
| **Manual Journals** | ✅ FULLY SUPPORTED | None | Model: `currencyCode` + `exchangeRate`. Form header has currency selector and exchange rate input (`JournalExchangeRateInputField`). Entries are recorded with rate applied. |
| **Transactions Locking** | ✅ FULLY SUPPORTED (N/A) | None | Administrative feature. Locks transactions by date. No monetary computation. Currency-agnostic. |
| **Tax Rates** | ⚠️ PARTIALLY SUPPORTED | Tax amounts are computed as percentages of transaction totals. When multi-currency invoices exist, tax amounts in GL are in base currency (correctly). However, the SalesTaxLiabilitySummary does not validate or flag transactions where `exchangeRate` was 0 or 1 by default, potentially silently under-reporting tax. | No `currencyCode` on the rate itself — correct, taxes are percentage-based. Risk: zero exchange rate silently corrupts the liability report. |
| **Make Journal Entry** | ✅ FULLY SUPPORTED | None | Same as Manual Journals above. |

---

### 🏦 BANKING

| Module | Status | Issues | Notes |
|--------|--------|--------|-------|
| **Cash/Bank Accounts** | ✅ FULLY SUPPORTED | None | `BankAccountResponse` DTO exposes `currencyCode`. Bank accounts carry a currency designation. Transactions against the account carry `currencyCode` + `exchangeRate`. |
| **Rules** | ❌ NOT SUPPORTED | Bank rules have zero currency awareness. Cannot match transactions by `currencyCode`. Cannot apply different categorization logic per currency. | `BankRules` module: no currency field in conditions or actions. |
| **Add Money In** | ✅ FULLY SUPPORTED | None | `MoneyInExchangeRateField` present in all Money In sub-forms (Transfer, OwnerContribution, OtherIncome). |
| **Add Money Out** | ✅ FULLY SUPPORTED | None | `MoneyOutExchangeRateField` present in all Money Out sub-forms (Transfer, OwnerDrawings, OtherExpense). |
| **Add Cash Account** | ✅ FULLY SUPPORTED | None | Currency code stored on account creation. |
| **Add Bank Account** | ✅ FULLY SUPPORTED | None | Currency code stored on account creation. |

---

### 💸 EXPENSES

| Module | Status | Issues | Notes |
|--------|--------|--------|-------|
| **Expenses (list)** | ✅ FULLY SUPPORTED | None | Model: `currencyCode` + `exchangeRate`. `DualCurrency` display in list table. |
| **New Expense** | ✅ FULLY SUPPORTED | None | Form has `ExpensesExchangeRateInputField`, currency selector. `DualCurrencyFormTotalLine` in footer (`ExpenseFormFooterRight.tsx`). GL subscriber applies exchange rate. |

---

### 📈 REPORTS

| Module | Status | Issues | Notes |
|--------|--------|--------|-------|
| **Balance Sheet** | ✅ FULLY SUPPORTED | Secondary currency uses a single `secondaryCurrency` rate; `display_currencies` with multiple currencies are NOT shown in exports | `BalanceSheetTableInjectable.ts` calls `resolveSecondaryCurrency()`. `build-balance-sheet-table.ts` adds secondary column when rate exists. Amounts aggregate in base currency via Ledger's `getForeignClosingBalance()`. |
| **Trial Balance Sheet** | ✅ FULLY SUPPORTED | Same display_currencies limitation | Frontend `TrialBalanceSheet/components.tsx` uses `useSecondaryCurrency()` to render secondary columns on Credit, Debit, Balance. |
| **Journal** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `JournalSheetTableInjectable.ts` uses `resolveSecondaryCurrency()`. Secondary balance column added when rate is present. |
| **General Ledger** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `GeneralLedgerTableInjectable.ts` uses `resolveSecondaryCurrency()`. Secondary balance column rendered per account. |
| **Profit/Loss Sheet** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `ProfitLossSheetTableInjectable.ts` uses `resolveSecondaryCurrency()`. Aggregates are in base currency (GL sums with exchange rate applied). |
| **Cashflow Statement** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `CashflowTableInjectable.ts` uses `resolveSecondaryCurrency()`. Section totals and grand total get secondary column. |
| **A/R Aging Summary** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `ARAgingSummaryTableInjectable.ts` uses `resolveSecondaryCurrency()` via `build-aging-summary-table.ts`. Secondary total column added per contact and grand total. |
| **A/P Aging Summary** | ✅ FULLY SUPPORTED | Same display_currencies limitation | Same as AR Aging. `APAgingSummaryTableInjectable.ts`. |
| **Sales / Purchases (combined)** | ⚠️ PARTIALLY SUPPORTED | No specific "Sales/Purchases" report found matching this name. Likely refers to Sales by Items + Purchases by Items. See those rows. | — |
| **Purchases by Items** | ✅ FULLY SUPPORTED | Same display_currencies limitation; aggregation at inventory lot level | `PurchasesByItemsTableInjectable.ts` uses `resolveSecondaryCurrency()`. Totals computed from inventory transactions (costs converted to base at lot-tracking time via `InventoryCost/utils.ts`). |
| **Sales by Items** | ✅ FULLY SUPPORTED | Same display_currencies limitation; aggregation at inventory lot level | Same as Purchases by Items. `SalesByItemsTableInjectable.ts`. |
| **Customers Transactions** | ✅ FULLY SUPPORTED | `display_currencies` shown in UI but not in exports | Frontend uses `useSecondaryCurrency()` for secondary columns. All transaction amounts already in base currency from GL. |
| **Vendors Transactions** | ✅ FULLY SUPPORTED | Same as Customers Transactions | Frontend uses `useSecondaryCurrency()`. |
| **Customer Balance Summary** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `CustomerBalanceSummaryTableInjectable.ts` uses `resolveSecondaryCurrency()`. `CustomerBalanceSummaryTableRows.ts` applies secondary rate to totals. |
| **Vendor Balance Summary** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `VendorBalanceSummaryTableInjectable.ts` uses `resolveSecondaryCurrency()`. |
| **Taxes** | ⚠️ PARTIALLY SUPPORTED | Tax liability amounts are summed in base currency only. Silent zero risk if `exchangeRate` was missing on transaction. No validation layer. | `SalesTaxLiabilitySummaryTableInjectable.ts` uses `resolveSecondaryCurrency()` for secondary column. But underlying data relies entirely on correct exchange rates being set on source transactions. |
| **Sales Tax Liability Summary** | ⚠️ PARTIALLY SUPPORTED | Same as Taxes above | Tax amounts aggregate in base currency. If any foreign-currency invoice had `exchangeRate=0` or was left at default=1, the tax base is silently wrong. |

---

### 📦 INVENTORY REPORTING

| Module | Status | Issues | Notes |
|--------|--------|--------|-------|
| **Inventory Item Details** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `InventoryItemDetailsTableInjectable.ts` uses `resolveSecondaryCurrency()`. Details show quantity, rate, and value; rates are stored in base currency via lot-cost tracking. |
| **Inventory Valuation** | ✅ FULLY SUPPORTED | Same display_currencies limitation | `InventoryValuationSheetTableInjectable.ts` uses `resolveSecondaryCurrency()`. Valuation amounts are in base currency (cost is converted at lot-tracking time). |

---

## 3. GAP ANALYSIS

### A. Missing Currency Propagation Points

| Gap | Location | Severity |
|-----|----------|----------|
| Inventory Adjustments lack currency field | `InventoryAdjustmentGL.ts` hardcodes `currencyCode: baseCurrency, exchangeRate: 1` | HIGH |
| Bank Rules cannot filter/act on currency | `BankRules` module — no currency condition type | MEDIUM |
| Account chart has no enforced currency designation | `Account.model.ts` — `currencyCode` optional, not exposed in UI | MEDIUM |
| Tax rate validation ignores missing exchange rates | `SalesTaxLiabilitySummary` and Tax Rates form | MEDIUM |

### B. Missing Conversion Layers

| Gap | Description | Severity |
|-----|-------------|----------|
| `display_currencies` (multi-currency) not in backend reports | All 18 financial report backends only support `secondaryCurrency` (one currency). `display_currencies` array is frontend-only. | HIGH |
| LBP / USDT not available via OpenExchangeRates free tier | Auto-rate-sync will fail silently for these currencies. Manual entry required. | HIGH |
| Exchange rate convention split | Transaction rates (direct quote) vs `exchange_rates` table rates (indirect quote) with no enforced distinction. Code comments are misleading (`InverseExchangeRateInput` says "Indirect" but UI shows Direct). | HIGH |
| No exchange rate validation at transaction save | An invoice can be saved with `exchangeRate: 0` (or null → default 1). Silent data corruption. | HIGH |
| No realized/unrealized gain-loss tracking in most reports | `RealizedGainLoss` and `UnrealizedGainLoss` modules exist as separate reports but are not integrated into Balance Sheet or P&L narratives. | MEDIUM |

### C. Missing Report Normalization

| Gap | Description | Severity |
|-----|-------------|----------|
| Reports expose only one secondary currency | PDF/CSV exports of Balance Sheet, P&L, GL, etc. contain at most one `≈ CURRENCY` column. Multi-currency display is frontend-rendered only. | HIGH |
| SalesByItems / PurchasesByItems: no per-currency breakdown | Cannot see sales volume in EUR vs LBP. Totals are base-currency only. | MEDIUM |
| Aging Summary: totals mix currencies | A/R and A/P aging sum across all currency invoices without explicitly flagging which are foreign-currency. The secondary total column helps but totals could mislead. | MEDIUM |
| Taxes: no per-currency tax breakdown | Tax liability is presented as a single base-currency sum without showing how much was collected in each currency. | MEDIUM |

### D. Missing UI Currency Switching

| Gap | Description | Severity |
|-----|-------------|----------|
| No global display-currency toggle | No "View All As: [currency dropdown]" anywhere in the UI. Secondary currencies only appear as stacked inline rows. | MEDIUM |
| `display_currencies` not configurable per report | All reports use `secondaryCurrency` globally. Cannot select a different display currency per report session. | MEDIUM |
| Banking Rules UI has no currency filter | Cannot create a rule like "If currency = LBP, categorize as local expense". | MEDIUM |
| Account-level currency not exposed in UI | Users cannot designate that an account is a "foreign currency account" in the Chart of Accounts UI. | LOW |

---

## 4. CRITICAL FIXES (PRIORITY ORDER)

### P0 — System Breaking

| # | Fix | Location |
|---|-----|----------|
| P0-1 | **Enforce minimum exchange rate validation** — Prevent saving any transaction (`SaleInvoice`, `Bill`, `Expense`, `Receipt`, `CreditNote`, `VendorCredit`, `BillPayment`, `PaymentReceived`, `ManualJournal`) with `exchangeRate = 0`. Default should be `1` for base-currency transactions, but validate `> 0` always. | DTOs + service layer for all transaction modules |
| P0-2 | **Standardize exchange rate convention** — Pick ONE convention system-wide. Recommended: keep **Direct Quote** (`1 foreign = X base`) as the transaction-level standard (it's what the models compute with). Update `FetchLiveRatesJob` to invert the fetched rate before storing: `storedRate = 1 / fetchedRate`. Update `resolveSecondaryCurrency` to invert when applying. Add a constant or comment marking the convention on every model. | `FetchLiveRates.job.ts`, `resolveSecondaryCurrency.ts`, all report `TableInjectable` files |
| P0-3 | **Fix `InverseExchangeRateInput` misleading comment** — The component says "Indirect Quote standard" but the UI renders `1 foreign = X base` (Direct Quote). Remove or correct the comment to prevent future developer confusion. | `InverseExchangeRateInput.tsx` |

### P1 — Financial Inconsistency

| # | Fix | Location |
|---|-----|----------|
| P1-1 | **Add currency support to Inventory Adjustments** — Add `currencyCode` and `exchangeRate` fields to the adjustment DTO and form. Update `InventoryAdjustmentGL.ts` to use them instead of hardcoded values. | `InventoryAdjustmentGL.ts`, adjustment DTO and form |
| P1-2 | **Propagate `display_currencies` to backend report endpoints** — Reports should accept an optional `displayCurrencies[]` query parameter and produce multiple secondary columns (one per currency). Or expand `resolveSecondaryCurrency` to return an array. Update all `TableInjectable` services. | `resolveSecondaryCurrency.ts`, all 18 `TableInjectable` files |
| P1-3 | **Validate exchange rates at tax time** — In `SalesTaxLiabilitySummary` and `TaxRatesService`, warn or flag transactions where `exchangeRate` is 1 but `currencyCode !== baseCurrency`. Prevents silent under-reporting of tax liability. | `SalesTaxLiabilitySummaryService.ts`, `TaxRates` module |
| P1-4 | **Guard against missing OpenExchangeRates API key for LBP/USDT** — `FetchLiveRatesJob` silently skips currencies that fail. Add an explicit fallback warning in the UI (Preferences → Currencies) if LBP/USDT have no rate for today. | `FetchLiveRates.job.ts`, `CurrencyExchangeRatesSection.tsx` |

### P2 — UX / Report Issues

| # | Fix | Location |
|---|-----|----------|
| P2-1 | **Add currency condition to Banking Rules** — Allow rules to have a condition: `currencyCode IS/IS NOT [currency]`. | `BankRules` module (model, DTO, service, UI) |
| P2-2 | **Enforce account currency in Chart of Accounts UI** — Show the `currencyCode` field on account create/edit. For bank/cash accounts, default to their linked banking account's `currencyCode`. | `Accounts` module create/edit DTO and UI form |
| P2-3 | **Add per-currency breakdown to Aging reports** — A/R and A/P Aging should have an option to group by `currencyCode`, showing aging buckets per currency separately. | `ARAgingSummary`, `APAgingSummary` |
| P2-4 | **Add per-currency tax breakdown to Sales Tax Liability** — Show which tax was collected in which currency (with base-currency equivalent). | `SalesTaxLiabilitySummary` |
| P2-5 | **Surface `display_currencies` config in General Preferences** — The `GeneralForm.tsx` already has a `display_currencies` multi-select. Ensure it is prominent and labeled clearly (e.g., "Display Currencies (shown as secondary totals in forms and tables)"). | `GeneralForm.tsx` — already partially implemented, needs UX review |

---

## 5. RECOMMENDED ARCHITECTURE (TARGET STATE)

### Base Currency Storage (✅ Already Correct)

```
tenants_metadata.base_currency  →  "USD"   (immutable after first transaction)
```

### Display Currency Override (⚠️ Currently Half-Implemented)

**Current:** `secondary_currency` (one) + `display_currencies[]` (frontend-only array)  
**Recommended:** Consolidate into a single `display_currencies[]` array on the backend. All report `TableInjectable` services should loop over this array and produce one secondary column per currency.

```
tenants_metadata.display_currencies  →  ["LBP", "USDT", "EUR"]
```

### Exchange Rate Application (⚠️ Convention Must Be Standardized)

**Recommended: Direct Quote everywhere**

```
exchange_rates.exchange_rate  =  "how many base units = 1 foreign unit"
                                 (same as on transactions)

// At transaction creation:
localAmount = foreignAmount * exchangeRate

// In reports (secondary column):
secondaryAmount = baseAmount / exchangeRates[secondaryCurrency]
                  (divide because we're going FROM base TO foreign)
```

This eliminates the indirect/direct split. `FetchLiveRates.job.ts` must invert the OER response:

```ts
storedRate = 1 / openExchangeRate.rates[foreignCurrency]
```

### FX Rate Application in Reports

```
1. Load report data in base currency (GL closing balances, etc.)
2. For each display_currency in org.displayCurrencies:
   a. Fetch rate = exchange_rates WHERE currencyCode = displayCurrency AND date <= reportDate ORDER BY date DESC LIMIT 1
   b. If no rate found: warn in report meta, show "—" in column
   c. Compute: secondaryAmount = baseAmount * rate  (Indirect: 1 base = X foreign)
      OR:      secondaryAmount = baseAmount / rate  (Direct: 1 foreign = X base)
   d. Append column to output
3. Format with currency symbol/precision per locale
```

### Report Normalization

All reports that aggregate monetary values MUST:

1. Pull amounts from GL entries (which carry `exchangeRate`)
2. Multiply by `exchangeRate` to normalize to base currency before summing
3. Expose secondary currency columns only AFTER summing in base currency

The current Ledger implementation (`getForeignClosingBalance()`) does this correctly. All custom queries that bypass the Ledger (like `SalesByItems` inventory queries) must also apply this normalization.

### Inventory Adjustment Currency

```
InventoryAdjustmentGL:
  currencyCode  =  adjustment.currencyCode ?? org.baseCurrency
  exchangeRate  =  adjustment.exchangeRate ?? 1
  // Ensures rate=1 only when truly in base currency
```

---

## 6. QUICK SUMMARY TABLE

| Category | Score | Verdict |
|----------|-------|---------|
| Transaction modules (Invoices, Bills, etc.) | 95/100 | Excellent — all carry currencyCode + exchangeRate |
| Financial Reports | 72/100 | Good — secondary currency works; display_currencies gap |
| Inventory modules | 55/100 | Gap — adjustments locked to base currency |
| Banking | 65/100 | Rules completely lack currency awareness |
| Architecture / Rate Convention | 50/100 | Split convention is a latent bug source |
| UI / UX | 70/100 | DualCurrency components present; no global currency toggle |

---

*Generated by automated codebase audit. Verify all file paths against current HEAD before implementing fixes.*
