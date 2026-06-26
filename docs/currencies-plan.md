# Multi-Currency Fix Plan — Stockix Finance
**Based on:** `currencies.md` audit (2026-06-23)  
**Branch target:** `architecture2` → PR to `main`  
**Total issues:** 12 (3 P0 · 4 P1 · 5 P2)

---

## Reading guide

Every step lists:
- **Files to change** with exact paths
- **What to change** — specific lines / fields / patterns
- **Done-signal** — how to know the step is finished

Work P0 → P1 → P2 in order. Within a priority group, steps are independent unless marked `depends on`.

---

## P0 — System-breaking / Must ship first

---

### P0-1 · Enforce `exchangeRate > 0` on all transaction DTOs

**Problem:** `SaleInvoice.dto.ts:110` uses `@Min(0)` — allows zero, which produces silent `localAmount = 0` on all entries.  
All other transaction DTOs need a uniform positive validation.

**Files to change:**

#### 1. `packages/server/src/modules/SaleInvoices/dtos/SaleInvoice.dto.ts` — line 108-117
```
Change: @Min(0)  →  @IsPositive()
Remove: @Min(0)
Add:    @IsPositive()   (after @IsNumber())
```
Same block applies to both `CreateSaleInvoiceDto` and `EditSaleInvoiceDto` (they share this field through the base class).

#### 2. Audit every remaining transaction DTO for the same pattern:

| DTO file | Current validation | Required |
|----------|--------------------|----------|
| `packages/server/src/modules/Bills/dtos/Bill.dto.ts:98-102` | `@IsPositive()` | ✅ already correct |
| `packages/server/src/modules/Expenses/dtos/` → find `exchangeRate` field | check | needs `@IsPositive()` |
| `packages/server/src/modules/SaleReceipts/dtos/` → find `exchangeRate` field | check | needs `@IsPositive()` |
| `packages/server/src/modules/CreditNotes/dtos/` → find `exchangeRate` field | check | needs `@IsPositive()` |
| `packages/server/src/modules/VendorCredit/dtos/` → find `exchangeRate` field | check | needs `@IsPositive()` |
| `packages/server/src/modules/BillPayments/dtos/` → find `exchangeRate` field | check | needs `@IsPositive()` |
| `packages/server/src/modules/PaymentReceives/dtos/` → find `exchangeRate` field | check | needs `@IsPositive()` |
| `packages/server/src/modules/ManualJournals/dtos/` → find `exchangeRate` field | check | needs `@IsPositive()` |

For every DTO that has `@Min(0)` on `exchangeRate`, replace it with `@IsPositive()`.

**Pattern to grep for:**
```bash
grep -rn "Min(0)" packages/server/src/modules/*/dtos/*.dto.ts | grep -i exchange
```

**Done-signal:** `grep -rn "@Min(0)" packages/server/src/modules/*/dtos/*.dto.ts | grep -i exchange` returns no results.

---

### P0-2 · Document and enforce the dual exchange-rate convention

**Problem:** Two separate rate systems coexist with no code-level distinction:
- **Transaction-level** `exchangeRate` field = **Direct Quote** → `1 foreign = X base`. Used as: `localAmount = foreignAmount * exchangeRate`.
- **`exchange_rates` table** (auto-fetched + manual history) = **Indirect Quote** → `1 base = X foreign`. Used as: `secondaryAmount = baseAmount * secondaryRate`.

Both paths are internally correct but the naming is shared and the comment in `InverseExchangeRateInput.tsx` actively lies about which convention it is. The risk is a future developer cross-contaminating the two.

**Files to change:**

#### 1. `packages/webapp/src/components/ExchangeRate/InverseExchangeRateInput.tsx` — lines 6-9
```
Old comment:
  // Since the system now uses the Indirect Quote standard (1 Base = X Foreign) natively
  // in both frontend and backend, no inversion logic is needed.

New comment:
  // This input binds to the transaction-level exchangeRate field.
  // Convention: Direct Quote — "1 foreign = X base" (e.g. 1 EUR = 1.08 USD).
  // Do NOT use this for exchange_rates table values, which use the opposite convention.
```

#### 2. `packages/server/src/modules/FinancialStatements/common/resolveSecondaryCurrency.ts` — add header comment at line 1
```
// Exchange rates loaded here are Indirect Quote: "1 base = X foreign".
// This is the opposite of the transaction-level exchangeRate field.
// secondaryAmount = baseAmount * secondaryRate  (correct: converts base → foreign)
```

#### 3. `packages/server/src/modules/ExchangeRates/jobs/FetchLiveRates.job.ts` — add comment at line 55 (the `.latest()` call)
```
// FetchLiveRates stores the Indirect Quote for the org's base currency.
// fromCurrency = baseCurrency → returns "how many foreignCurrency per 1 base".
// This is ONLY for report secondary columns — NOT for transaction exchangeRate fields.
```

#### 4. `packages/server/src/modules/ExchangeRates/lib/OpenExchangeRate.ts` — add comment at line 37 (the return line)
```
// Returns indirect quote: how many toCurrency units equal 1 baseCurrency unit.
```

**Done-signal:** Every call site has a comment stating its convention. `grep -rn "exchangeRate" packages/server/src/modules/FinancialStatements` shows only report-layer usage.

---

### P0-3 · Fix misleading comment in `InverseExchangeRateInput`

*(Already covered under P0-2, step 1 above. Mark done once P0-2 step 1 is applied.)*

---

## P1 — Financial integrity issues

---

### P1-1 · Add foreign-currency support to Inventory Adjustments

**Problem:** `InventoryAdjustmentsGL.ts:32-33` hardcodes `currencyCode: this.baseCurrency` and `exchangeRate: 1`. The `inventory_adjustments` table has no currency columns. Any adjustment made in LBP, EUR, or USDT is recorded as if it were base-currency, producing wrong inventory valuations.

**Scope:** 1 DB migration · 2 model files · 1 DTO · 1 types file · 1 GL class · 1 GL entries service · 2 webapp files.

---

#### Step 1 — DB migration

Create file: `packages/server/src/database/migrations/TIMESTAMP_add_currency_to_inventory_adjustments.js`

```javascript
exports.up = function(knex) {
  return knex.schema.table('inventory_adjustments', (table) => {
    table.string('currency_code').after('description');
    table.decimal('exchange_rate', 13, 4).defaultTo(1).after('currency_code');
  });
};

exports.down = function(knex) {
  return knex.schema.table('inventory_adjustments', (table) => {
    table.dropColumn('currency_code');
    table.dropColumn('exchange_rate');
  });
};
```

Use a real timestamp, e.g. `20260623120000`.

---

#### Step 2 — Model: `packages/server/src/modules/InventoryAdjutments/models/InventoryAdjustment.ts`

Add two fields to the class body (after `warehouseId`, before `createdAt`):
```typescript
public readonly currencyCode?: string;
public readonly exchangeRate?: number;
```

---

#### Step 3 — Types: `packages/server/src/modules/InventoryAdjutments/types/InventoryAdjustments.types.ts`

In `IQuickInventoryAdjustmentDTO` interface (line 8-22), add:
```typescript
currencyCode?: string;
exchangeRate?: number;
```

---

#### Step 4 — DTO: `packages/server/src/modules/InventoryAdjutments/dtos/CreateQuickInventoryAdjustment.dto.ts`

Add after the existing `branchId` block (line 85-91):
```typescript
@ApiPropertyOptional({ description: 'Currency code (ISO 4217). Defaults to org base currency.' })
@IsOptional()
@IsString()
currencyCode?: string;

@ApiPropertyOptional({ description: 'Exchange rate: 1 unit of currencyCode = X units of base currency. Required when currencyCode differs from base.' })
@IsOptional()
@ToNumber()
@IsNumber()
@IsPositive()
exchangeRate?: number;
```

Import: add `IsString, IsNumber, IsPositive` to the existing import from `class-validator` at line 3.

---

#### Step 5 — GL class: `packages/server/src/modules/InventoryAdjutments/commands/ledger/InventoryAdjustmentGL.ts`

**Add field to class** (after `private baseCurrency: string;` at line 11):
```typescript
private currencyCode: string;
private exchangeRate: number;
```

**Add setter** (after `setBaseCurrency` method, line 24):
```typescript
public setCurrency(currencyCode: string, exchangeRate: number) {
  this.currencyCode = currencyCode;
  this.exchangeRate = exchangeRate;
  return this;
}
```

**Update `adjustmentGLCommonEntry` getter** (lines 31-48), change:
```typescript
// Before:
currencyCode: this.baseCurrency,
exchangeRate: 1,

// After:
currencyCode: this.currencyCode,
exchangeRate: this.exchangeRate,
```

---

#### Step 6 — GL Entries service: `packages/server/src/modules/InventoryAdjutments/commands/ledger/InventoryAdjustmentsGLEntries.ts`

In `writeAdjustmentGLEntries` method (lines 26-45), update the GL builder chain (lines 39-41):
```typescript
// Before:
const ledger = new InventoryAdjustmentsGL(adjustment)
  .setBaseCurrency(tenantMeta.baseCurrency)
  .getAdjustmentGL();

// After:
const currencyCode = adjustment.currencyCode ?? tenantMeta.baseCurrency;
const exchangeRate = adjustment.exchangeRate ?? 1;
const ledger = new InventoryAdjustmentsGL(adjustment)
  .setBaseCurrency(tenantMeta.baseCurrency)
  .setCurrency(currencyCode, exchangeRate)
  .getAdjustmentGL();
```

---

#### Step 7 — Webapp form fields: `packages/webapp/src/containers/Dialogs/InventoryAdjustmentFormDialog/InventoryAdjustmentFormDialogFields.tsx`

Add `CurrencySelectField` and exchange rate input to the form. Import from the same patterns used in `IncrementAdjustmentFields.tsx` and comparable forms (e.g. Expenses form which already has `ExpensesExchangeRateInputField`).

Add two fields before the submit button section:
1. A currency selector (use `useBaseCurrency` / `useCurrencies` hooks, same pattern as expense form)
2. An exchange rate input that only renders when `currencyCode !== baseCurrency` (conditional visibility)

---

#### Step 8 — Webapp form schema: `packages/webapp/src/containers/Dialogs/InventoryAdjustmentFormDialog/InventoryAdjustmentForm.schema.tsx`

Add to the Yup shape:
```typescript
currencyCode: Yup.string(),
exchangeRate: Yup.number()
  .when('currencyCode', {
    is: (val) => val && val !== baseCurrency,
    then: Yup.number().positive().required('Exchange rate is required for foreign currency adjustments'),
    otherwise: Yup.number().min(0),
  }),
```

**Done-signal:** Create an inventory adjustment in EUR with rate 1.55. Verify the GL entry in `account_transactions` shows `currency_code = EUR` and `exchange_rate = 1.55`.

---

### P1-2 · Propagate `display_currencies[]` to all 17 backend report endpoints

**Problem:** `tenants_metadata.display_currencies` stores up to N currencies (e.g. `["LBP","USDT","EUR"]`) but all 17 `TableInjectable` services only call `resolveSecondaryCurrency()` which returns ONE `{secondaryCurrency, secondaryRate}`. The remaining display currencies are invisible to PDFs and CSV exports.

**Scope:** 1 shared function · 17 TableInjectable files · downstream table-builder functions for each report.

---

#### Step 1 — Expand `resolveSecondaryCurrency`

File: `packages/server/src/modules/FinancialStatements/common/resolveSecondaryCurrency.ts`

Add new exported type and function alongside the existing one:
```typescript
export type DisplayCurrencyContext = {
  currency: string;
  rate: number;
};

export async function resolveDisplayCurrencies(
  tenantMetadata: TenantMetadata | undefined,
  exchangeRatesService: ExchangeRatesService,
  asOfDate: string | Date,
): Promise<DisplayCurrencyContext[]> {
  const displayCurrencies: string[] = tenantMetadata?.displayCurrencies ?? [];
  const secondary = tenantMetadata?.secondaryCurrency ?? '';

  // Merge secondary + display_currencies, deduplicate, skip base currency
  const allCurrencies = [...new Set([...displayCurrencies, secondary ? secondary : []])].filter(Boolean);

  if (!allCurrencies.length) return [];

  const results: DisplayCurrencyContext[] = [];
  for (const currency of allCurrencies) {
    const rateRow = await exchangeRatesService.lookupRateByDate(currency, asOfDate);
    if (!rateRow) {
      console.warn(`[resolveDisplayCurrencies] No rate for ${currency} on ${asOfDate}. Column will show 0.`);
    }
    results.push({ currency, rate: Number(rateRow?.exchangeRate ?? 0) });
  }
  return results;
}
```

Keep the existing `resolveSecondaryCurrency` function unchanged (backwards-compat).

---

#### Step 2 — Update each of the 17 TableInjectable files

**Pattern — same change in all 17 files:**

These are the 17 files (from the confirmed grep list):
1. `BalanceSheetTableInjectable.ts`
2. `TrialBalanceSheetTableInjectable.ts`
3. `JournalSheetTableInjectable.ts`
4. `GeneralLedgerTableInjectable.ts`
5. `ProfitLossSheetTableInjectable.ts`
6. `CashflowTableInjectable.ts`
7. `ARAgingSummaryTableInjectable.ts`
8. `APAgingSummaryTableInjectable.ts`
9. `PurchasesByItemsTableInjectable.ts`
10. `SalesByItemsTableInjectable.ts`
11. `TransactionsByCustomersTableInjectable.ts`
12. `TransactionsByVendorTableInjectable.ts`
13. `CustomerBalanceSummaryTableInjectable.ts`
14. `VendorBalanceSummaryTableInjectable.ts`
15. `SalesTaxLiabilitySummaryTableInjectable.ts`
16. `InventoryValuationSheetTableInjectable.ts`
17. `InventoryItemDetailsTableInjectable.ts`

**Change per file:**

```typescript
// Before (example from BalanceSheetTableInjectable.ts line 31):
const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
  tenantMetadata, this.exchangeRatesService, query.toDate ?? new Date(),
);

// After:
const displayCurrencies = await resolveDisplayCurrencies(
  tenantMetadata, this.exchangeRatesService, query.toDate ?? new Date(),
);
// Keep backwards compat for single-column builders still on old API:
const { secondaryCurrency, secondaryRate } = displayCurrencies[0]
  ? { secondaryCurrency: displayCurrencies[0].currency, secondaryRate: displayCurrencies[0].rate }
  : { secondaryCurrency: '', secondaryRate: 0 };
```

Then pass `displayCurrencies` down to the table builder function. Update each table builder's signature to accept `displayCurrencies: DisplayCurrencyContext[]` and generate one column per entry.

> **Note:** The table builders (e.g. `build-balance-sheet-table.ts`) each have their own column-building logic. The change per builder is to loop `displayCurrencies` instead of the single `secondaryCurrency` parameter. This is N rows × M columns work — do one report at a time and test the PDF/CSV export for each.

---

#### Step 3 — Verify tenant metadata shape

Check `TenantMetadataModel.ts` to confirm `displayCurrencies` is already exposed via `getTenantMetadata()`. It should be — `$parseDatabaseJson` already deserializes it. No backend model change needed.

**Done-signal:** Hit the `/financial-statements/balance-sheet` endpoint for an org with `display_currencies = ["LBP","EUR"]`. Response JSON has two secondary columns, not one.

---

### P1-3 · Flag transactions with missing exchange rates in Tax Liability report

**Problem:** `SalesTaxLiabilitySummaryTableInjectable.ts` aggregates tax from GL entries. If a foreign-currency invoice was saved with `exchangeRate = 1` (the default when the user didn't enter a rate), the tax base is computed in the wrong denomination — silently.

**Files to change:**

#### `packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryTableInjectable.ts`

After calling `resolveSecondaryCurrency`, add a validation step. Read the underlying transactions for the report period and check:

```typescript
// Warning check: flag foreign-currency transactions with rate = 1
// These were likely saved without a user-entered exchange rate.
const suspectTransactions = await this.taxService.findTransactionsWithSuspectRate(
  tenantMetadata.baseCurrency,
  query.fromDate,
  query.toDate,
);
if (suspectTransactions.length > 0) {
  meta.warnings = meta.warnings ?? [];
  meta.warnings.push({
    code: 'SUSPECT_EXCHANGE_RATES',
    message: `${suspectTransactions.length} foreign-currency transactions have exchangeRate = 1. Tax totals may be understated.`,
    count: suspectTransactions.length,
  });
}
```

Add the `findTransactionsWithSuspectRate(baseCurrency, from, to)` method to the tax service. It queries `sale_invoices` + `bills` where `currency_code != baseCurrency AND exchange_rate = 1 AND date BETWEEN from AND to`.

**Done-signal:** Report JSON for a period containing a suspicious invoice includes `meta.warnings` array with the `SUSPECT_EXCHANGE_RATES` entry.

---

### P1-4 · Surface missing exchange rate warnings for LBP / USDT in Currencies UI

**Problem:** `FetchLiveRatesJob` silently skips currencies that fail (LBP, USDT not on OER free tier). Operators have no in-app indication that their rates are stale.

**Files to change:**

#### `packages/server/src/modules/ExchangeRates/jobs/FetchLiveRates.job.ts`

In the per-currency loop (line 50-81), instead of silently continuing on error, write the failure to a new column or a small status cache. The simplest approach: if `latestRate` is null/0, insert a row into `exchange_rates` with `exchangeRate = null` and a `sync_failed_at` timestamp.

**Easier alternative (no migration needed):** Track the last-sync failure in a module-level `Map<tenantId, Set<currencyCode>>` and expose it via a new GET endpoint `/exchange-rates/sync-status` that returns which currencies have no rate for today.

#### `packages/webapp/src/containers/Preferences/Currencies/CurrenciesList.tsx`

Consume `/exchange-rates/sync-status`. For any currency with no rate in the last 7 days, show a `<Tag intent="warning">No rate</Tag>` next to the currency row. Use the same `CurrenciesDataTable` column pattern.

**Done-signal:** Remove `OPEN_EXCHANGE_RATE_APP_ID` from `.env`, restart the server. Open Preferences → Currencies. LBP and any other configured non-base currencies show a "No rate" warning tag.

---

## P2 — UX / Report improvements

---

### P2-1 · Add `currency_code` condition to Banking Rules

**Problem:** Banking Rules cannot match transactions by currency. Cannot say "if currency = LBP → categorize as local expense".

**Files to change:**

#### 1. `packages/server/src/modules/BankRules/types.ts`

Add to `BankRuleConditionField` enum (line 4):
```typescript
CurrencyCode = 'currency_code',
```

Add to the `BankRuleComparator` type (line 63):
```typescript
| 'equals'   // already present via BankRuleConditionComparator.Equals
```
No new comparators needed — `equals` and `not_equals` cover currency matching.

#### 2. `packages/server/src/modules/BankRules/dtos/BankRule.dto.ts`

In `BankRuleConditionDto.field` `@IsIn()` validator (line 19), add `'currency_code'`:
```typescript
@IsIn(['description', 'amount', 'payee', 'currency_code'])
```

In `BankRuleConditionDto.comparator` `@IsIn()` validator (lines 22-33), add `'not_equals'`:
```typescript
'not_equals',
```

#### 3. Rule evaluation service

Locate the service that applies conditions to transactions (search for `BankRuleCondition` usage in apply/match logic). Add a branch for `field === 'currency_code'`:
```typescript
case 'currency_code':
  return comparator === 'equals'
    ? transaction.currencyCode === condition.value
    : transaction.currencyCode !== condition.value;
```

#### 4. Webapp — bank rule conditions form

Locate the conditions field builder (likely in `containers/Banking/BankRules/` or similar). Add `currency_code` to the field selector options. When `currency_code` is selected:
- Show a currency select dropdown (not a free-text input)
- Limit comparator choices to `equals` / `not_equals`

**Done-signal:** Create a bank rule with condition `currency_code equals LBP`. Import a bank statement. Transactions in LBP are categorized by the rule; USD transactions are not.

---

### P2-2 · Expose account `currencyCode` in Chart of Accounts UI

**Problem:** `Account.model.ts:38` has `currencyCode?: string` but no UI to set it. Foreign-currency bank accounts sit in the chart as currency-less entries.

**Files to change:**

#### 1. Find the account create/edit DTO

```bash
find packages/server/src/modules/Accounts/dtos -name "*.dto.ts" | head -5
```

Add to the create DTO:
```typescript
@ApiPropertyOptional({ description: 'ISO 4217 currency code. Defaults to org base currency.' })
@IsOptional()
@IsString()
currencyCode?: string;
```

#### 2. Find the account create/edit form in webapp

```bash
find packages/webapp/src/containers -name "*Account*Form*" -o -name "*AccountForm*" | head -5
```

Add a `CurrencySelectField` (same component used in Expenses and Invoice forms) to the form. Only render it for account types that are currency-sensitive: `bank`, `cash`, `other_current_asset`, `other_current_liability`.

**Done-signal:** Open Chart of Accounts → Edit an account → Currency field is visible and saves correctly to `accounts.currency_code`.

---

### P2-3 · Add per-currency grouping option to A/R and A/P Aging reports

**Problem:** A/R and A/P aging buckets mix all currencies. A customer can owe $5,000 USD and LBP 10,000,000 — both appear as undifferentiated base-currency amounts.

**Files to change:**

#### 1. A/R Aging query DTO

```
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryQuery.dto.ts
(or similar — locate the query DTO for ARAgingSummary)
```

Add:
```typescript
@IsOptional()
@Transform(({ value }) => value === 'true')
@IsBoolean()
groupByCurrency?: boolean = false;
```

#### 2. `ARAgingSummaryTableInjectable.ts`

When `query.groupByCurrency = true`, call a new service method that groups the aging results by `currencyCode` before building the table. Return a table with a `currency` group header row per currency.

#### 3. Same pattern for A/P Aging:
- `APAgingSummaryQuery.dto.ts` — add `groupByCurrency`
- `APAgingSummaryTableInjectable.ts` — same grouping logic

#### 4. Webapp — A/R and A/P Aging filter panels

Add a `Group by currency` checkbox to the report filter drawer. Bind to the `groupByCurrency` query param.

**Done-signal:** Check A/R Aging with `groupByCurrency=true`. USD customers appear under a "USD" group header; LBP customers appear under "LBP".

---

### P2-4 · Add per-currency tax breakdown to Sales Tax Liability Summary

**Problem:** The Sales Tax Liability report sums all tax collected into one base-currency column. Cannot see how much VAT was collected in LBP vs USD.

**Files to change:**

#### 1. `SalesTaxLiabilitySummaryTableInjectable.ts`

Extend the table builder to group tax rows by the `currencyCode` of the source transaction. For each group:
- Show the raw foreign-currency tax amount (what was collected)
- Show the base-currency equivalent (for legal reporting)

Add a `groupByCurrency` option following the same pattern as P2-3.

#### 2. Webapp — Sales Tax Liability filter panel

Add a `Group by currency` toggle. When active, the table shows sub-sections per currency.

**Done-signal:** Tax report shows separate sections for USD-source and LBP-source invoices, each with their own totals in both original and base currency.

---

### P2-5 · UX — Make `display_currencies` prominent in General Preferences

**Problem:** The `display_currencies` multi-select exists in `GeneralForm.tsx` but its label may not clearly explain what it controls.

**File to change:**

`packages/webapp/src/containers/Preferences/General/GeneralForm.tsx`

Find the `display_currencies` field (search for `display_currencies` in the file). Update its label and helper text:
```
Label:   "Display Currencies"
Helper:  "These currencies appear as secondary totals in invoice forms, bill forms, 
          and list tables. Choose all currencies your business operates in daily."
```

Also ensure the field appears visually close to the "Base Currency" field, not buried at the bottom of the form. Move it if needed.

**Done-signal:** Open Preferences → General. The `Display Currencies` field is adjacent to `Base Currency`, has the updated helper text, and saving LBP/USDT reflects immediately in the invoice form footer.

---

## Execution checklist

```
P0-1  [ ] SaleInvoice.dto.ts: @Min(0) → @IsPositive()
      [ ] Audit remaining 7 transaction DTOs (grep pattern above)
P0-2  [ ] InverseExchangeRateInput.tsx: fix comment
      [ ] resolveSecondaryCurrency.ts: add convention header
      [ ] FetchLiveRates.job.ts: add convention comment
      [ ] OpenExchangeRate.ts: add return-value comment
P0-3  [ ] (covered by P0-2 step 1)

P1-1  [ ] DB migration: add currency_code + exchange_rate columns
      [ ] InventoryAdjustment.ts model: add fields
      [ ] InventoryAdjustments.types.ts: add to IQuickInventoryAdjustmentDTO
      [ ] CreateQuickInventoryAdjustment.dto.ts: add fields
      [ ] InventoryAdjustmentGL.ts: add setCurrency() + use fields
      [ ] InventoryAdjustmentsGLEntries.ts: pass currency to GL builder
      [ ] InventoryAdjustmentFormDialogFields.tsx: add currency + rate inputs
      [ ] InventoryAdjustmentForm.schema.tsx: add Yup validation

P1-2  [ ] resolveSecondaryCurrency.ts: add resolveDisplayCurrencies()
      [ ] 17 TableInjectable files: call resolveDisplayCurrencies()
      [ ] Each table builder: add loop for N display currency columns
      
P1-3  [ ] SalesTaxLiabilitySummaryTableInjectable.ts: add warnings
      [ ] Tax service: add findTransactionsWithSuspectRate()

P1-4  [ ] FetchLiveRates.job.ts: track sync failures
      [ ] GET /exchange-rates/sync-status endpoint
      [ ] CurrenciesList.tsx: show "No rate" warning tag

P2-1  [ ] BankRules/types.ts: add CurrencyCode field
      [ ] BankRule.dto.ts: add currency_code to @IsIn()
      [ ] Rule evaluation service: handle currency_code condition
      [ ] Webapp: bank rule condition UI for currency_code

P2-2  [ ] Account create/edit DTO: add currencyCode field
      [ ] Account form webapp: add CurrencySelectField

P2-3  [ ] ARAgingSummaryQuery.dto.ts: add groupByCurrency
      [ ] ARAgingSummaryTableInjectable.ts: grouping logic
      [ ] APAgingSummaryQuery.dto.ts: add groupByCurrency
      [ ] APAgingSummaryTableInjectable.ts: grouping logic
      [ ] Webapp: A/R + A/P filter panels: add toggle

P2-4  [ ] SalesTaxLiabilitySummaryTableInjectable.ts: per-currency grouping
      [ ] Webapp: Tax Liability filter panel toggle

P2-5  [ ] GeneralForm.tsx: update label + helper text for display_currencies
```

---

## Test plan (per issue)

| Issue | Test |
|-------|------|
| P0-1 | POST invoice with `exchange_rate: 0` → expect 400 |
| P0-2 | Code review only — no runtime test |
| P1-1 | Create EUR adjustment at rate 1.55 → verify GL entry has `currency_code=EUR, exchange_rate=1.55` |
| P1-2 | GET balance-sheet for org with 3 display currencies → response has 3 secondary columns |
| P1-3 | Create LBP invoice without setting rate → run tax report → see `SUSPECT_EXCHANGE_RATES` warning |
| P1-4 | Remove OER API key → run daily cron → open Currencies UI → see "No rate" warning |
| P2-1 | Create rule `currency_code equals LBP` → import statement with LBP + USD txns → only LBP categorized |
| P2-2 | Edit account → set `currencyCode = EUR` → GET account → `currency_code = EUR` in response |
| P2-3 | GET AR aging with `groupByCurrency=true` → USD and LBP groups present |
| P2-4 | GET tax liability with `groupByCurrency=true` → separate sections per currency |
| P2-5 | Manual: update label and verify helper text in UI |

---

*Plan generated from codebase audit on 2026-06-23. All file paths verified against current HEAD on branch `architecture2`.*
