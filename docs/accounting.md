# Stockix — Accounting capability audit

**Audit date:** 2026-05-10  
**Method:** Code inspection only (no assumptions). Primary codebase reviewed: `services/stockix-finance` (Express API + React webapp). Cross-check: `apps/api`, `apps/dashboard` (default `pnpm dev` targets).

**Scope note:** The root monorepo `dev` script runs `dashboard` + `api` only (`package.json`). Full double-entry sales/purchases/GL flows were **not** found under `apps/`; they live in `services/stockix-finance`. Treat “Stockix accounting” as that service unless product wiring embeds it elsewhere.

---

## 1. System status summary

| Category | Assessment |
|----------|------------|
| **Fully implemented (in `stockix-finance`)** | Core GL pipeline via `JournalPoster` + `accounts_transactions`; sale invoices, estimates, receipts, credit notes, vendor credits, bills, payment receive/made; cashflow accounts & manual cashflow transactions + cash flow **report**; multi-currency fields on journal interface; exchange rate DTO/service surface; branches & warehouses behind feature flags; inventory valuation report route; AR/AP aging, customer/vendor balance summaries, balance sheet, P&L, trial balance, general ledger, journal sheet; PDF generation (Puppeteer); user invites + mail stack; RBAC via CASL (`AbilitySchema` / permissions in webapp). |
| **Partially implemented** | “Banking”: cash/bank movement exists as **cashflow transactions** and reporting, not observed Plaid/OFX import or rule engine. **Tax**: invoice GL posts A/R vs income lines without separate tax lines or GST/VAT engine in reviewed code. **Export**: invoice actions bar shows Export/Import UI without handlers wired in the snippet reviewed. **Fixed assets**: chart account types and seed accounts (e.g. accumulated depreciation) exist; no dedicated asset register/depreciation run found. **Projects / time**: projects API and times endpoints exist; financial tie-in includes project on invoice lines and profitability report. |
| **Missing or not evidenced** | Recurring invoices; recurring expenses; purchase order workflow; payroll; OCR/receipt scan; bank feed sync (Plaid, etc.); bank rules / auto-categorization; full bank reconciliation (statement vs ledger); period close / transaction lock; dedicated tax numbers on org/customers (contacts migration has no tax id columns in base file); tax filing / VAT returns; payment gateway (Stripe/PayPal — PayPal tab **disabled** in subscriptions UI); custom drag-and-drop report builder; inter-company consolidation; CRM/customer portal; cost centers; budgeting product (only `BudgetEntriesSet` collection helper, no migrations/controllers found). |

---

## 2. Feature-by-feature audit table

Legend: **✔** implemented (code present) · **⚠** partial / unclear UX wiring · **❌** not found

| Module | Feature | Status | Evidence (file / symbol) |
|--------|---------|--------|---------------------------|
| **Sales** | Sale invoices | ✔ | `SalesInvoices.ts` (`createSaleInvoice`), `SalesInvoices.ts` controller, migration `create_sale_invoices_table.js` |
| | Estimates / quotes | ✔ | `SalesEstimates` controller route `sales/estimates`, model `SaleEstimate.ts` |
| | Receipts | ✔ | Model `SaleReceipt.ts`, controller `SalesReceipts.ts`, PDF `SaleReceiptsPdfService.ts` |
| | Credit notes | ✔ | Credit note services/subscribers, reconcile dialogs in webapp |
| | Payment tracking (received) | ✔ | `PaymentReceive` model stack, GL subscribers pattern (same as bills) |
| | Recurring invoices | ❌ | No `recurring` matches under `services/stockix-finance` |
| | Discounts on transactions | ✔ | `ItemEntry.calcAmount` (`discount` %) |
| | PDF templates | ✔ | `PdfService` + `SaleInvoicePdf`, `SaleEstimatesPdf`, etc. (Mustache/Puppeteer) |
| | Email sending for invoices | ⚠ | SMS: `SaleInvoiceNotifyBySms.ts`; dedicated invoice **email** notify service not found in `services/Sales` grep |
| | Export CSV / XLSX | ⚠ | `InvoicesActionsBar.tsx` shows Export/Import buttons; **no** `xlsx` usage in server `.ts` grep; handlers not verified |
| **Purchases** | Bills | ✔ | `Bills.ts`, `BillWriteJournalEntriesSubscriber.ts` |
| | Vendor credits | ✔ | Vendor credit modules + reconcile vendor credit UI |
| | Payment tracking (made) | ✔ | Bill payment stack |
| **Banking** | Bank sync (Plaid / etc.) | ❌ | No Plaid/OFX references in server `.ts` grep |
| | Transaction import | ❌ | Not evidenced (manual `Cashflow` services only) |
| | Bank rules (auto-categorization) | ❌ | No `bank rule` / categorization matches |
| | Reconciliation (match + cleared) | ⚠ | Credit note / vendor credit **reconcile** to invoices/bills; not full bank statement reconciliation |
| | Multi-currency + FX | ✔ | `IJournalEntry` currency fields; `IExchangeRate*` interfaces + services; `CreateManualJournal` uses `exchangeRate` |
| **Core GL** | Double-entry | ✔ | `JournalPoster`, `LedgerStorageService.commit`, `SaleInvoiceGLEntries`, bill subscribers |
| | Chart of accounts (depth) | ✔ | Account types, dependency graph in `JournalPoster`, balance sheet schema |
| | Manual journals | ✔ | `CreateManualJournalService`, validators |
| | Debit = credit enforcement | ✔ | `CommandManualJournalValidators.valdiateCreditDebitTotalEquals` in `CreateManualJournal.authorize` |
| | Period freeze / lock | ❌ | No lock/freeze matches in `database/migrations` grep |
| | Tax (GST/VAT) system | ❌ | No GST/VAT/tax_rate in server `services` grep; invoice GL uses `localAmount` + line credits only (`InvoiceGLEntries.ts`) |
| | Tax numbers (org + customers) | ❌ | `create_contacts_table.js` has no tax id columns |
| **Inventory** | Tracking / items | ✔ | `Item`, `ItemEntry`, inventory transactions |
| | Warehouses | ✔ | `Warehouse.ts`, `FeatureActivationGuard(Features.WAREHOUSES)` |
| | Valuation reports | ✔ | `FinancialStatements.ts` → `/inventory-valuation` |
| **Organization** | Multi-branch | ✔ | `Features.BRANCHES`, branch subscribers |
| | Cost centers | ❌ | No code matches |
| | Budgeting | ❌ | Only `collection/BudgetEntriesSet.ts`; no budget migrations/API found |
| | Projects | ✔ | `api/index.ts` `/projects`, `ProjectProfitabilityController`, `entry.projectId` on invoice GL |
| **Reporting** | Balance Sheet | ✔ | `BalanceSheet` controller |
| | P&L | ✔ | `ProfitLossSheet` |
| | Cash Flow Statement | ✔ | `CashFlowStatementController`, `CashFlow.ts` |
| | General Ledger | ✔ | `GeneralLedger.ts` service + webapp |
| | Trial Balance | ✔ | `TrialBalanceSheet` |
| | Journal report | ✔ | `JournalSheetController` |
| | AR / AP aging | ✔ | `ARAgingSummary`, `APAgingSummary` |
| | Customer / vendor balances | ✔ | `CustomerBalanceSummary`, `VendorBalanceSummary` |
| | Inventory summary | ✔ | Inventory valuation + item details routes |
| **Users / access** | Multi-user | ✔ | Tenant users, auth stack |
| | Invitations | ✔ | `InviteUsers`, `SendInviteUsersMailMessage`, agenda job `user-invite-mail` |
| | RBAC | ✔ | `@casl/ability`, `AbilitySchema.ts`, webapp `permissionsSchema.tsx` |
| | Custom roles | ✔ | `ViewRole`, role permissions models |
| **Critical gap checklist** | Fixed assets + depreciation | ⚠ | Account types + seed “Accumulated Depreciation”; no depreciation engine found |
| | Payroll | ❌ | Not found |
| | Purchase orders | ❌ | Landed cost on bills only; no PO workflow |
| | OCR | ❌ | Not found |
| | Full bank reconciliation | ❌ | Not found |
| | Recurring expenses | ❌ | `Expense` model; no `recur` in model/migrations |
| | Stripe / PayPal | ❌ | `SubscriptionTabs.tsx` PayPal `disabled={true}`; no Stripe in grep |
| | Custom report builder | ❌ | Fixed statement controllers only |
| | Inter-company | ❌ | Not found |
| | CRM / customer portal | ❌ | Not in finance webapp scope |
| | Tax filing / VAT returns | ❌ | Not found |
| | Time / job costing | ⚠ | Tasks/times under projects; invoice lines support `projectId` |

---

## 3. Architecture map

| Concern | Location | Notes |
|---------|----------|--------|
| **Accounting engine** | `services/stockix-finance/packages/server/src/services/Accounting/` | `JournalPoster.ts` builds entries; `LedgerStorageService` persists to `AccountTransaction` / balance tables. |
| **Invoices (sales)** | `services/.../services/Sales/SalesInvoices.ts`, `.../Sales/Invoices/InvoiceGLEntries.ts`, `api/controllers/Sales/SalesInvoices.ts` | Creates invoice graph; GL via `SaleInvoiceGLEntries`. |
| **Bills (purchases)** | `services/.../services/Purchases/Bills.ts`, `subscribers/Bills/WriteJournalEntries.ts` | Same event-driven GL pattern. |
| **Posted transactions (GL lines)** | `LedgerEntriesStorage.ts` → `AccountTransaction` model / `accounts_transactions` | `transformLedgerEntryToTransaction` inserts rows. |
| **Double-entry enforcement** | **Manual journals:** explicit debit=credit validation in `CreateManualJournalService.authorize` → `CommandManualJournalValidators`. **Automated docs:** balancing is implicit in each document’s GL builder (e.g. one A/R debit vs sum of income credits on invoices); **no DB-level constraint** verified that forces Σdebit=Σcredit globally per document. |
| **Financial reports** | `api/controllers/FinancialStatements.ts` mounts all statement routes; services under `services/FinancialStatements/` | |
| **Frontend** | `services/stockix-finance/packages/webapp/` | CRA app; not `apps/dashboard`. |
| **Platform shell (licenses, etc.)** | `apps/dashboard`, `apps/api` | No accounting domain found in quick `apps/dashboard` grep for invoice/ledger/journal. |

---

## 4. Critical gaps (high priority)

1. **Tax engine & compliance metadata** — Invoice GL does not model tax liability/remittance lines; no GST/VAT identifiers on contacts in base schema; unsuitable for strict VAT/GST reporting without extension.
2. **Period locking** — No evidenced freeze; risk of retroactive edits breaking closed periods.
3. **Bank feeds & reconciliation** — Manual cashflow only; no statement matching, rules, or provider sync → operational gap for production “banking module” expectations.
4. **Recurring billing / expenses** — Common SaaS expectations; not present in codebase search.
5. **Product split** — Full accounting is isolated in `services/stockix-finance`; default monorepo dev does not include it → deployment/integration must be explicit or users get dashboard without GL.
6. **Payment gateways** — No evidenced Stripe/PayPal integration for invoice pay links; subscription UI shows disabled PayPal.

---

## 5. Implementation roadmap (no rewrite)

Order targets **financial correctness and regulatory gaps** first, then **automation**, then **nice-to-have**.

| Phase | Item | Rationale |
|-------|------|-----------|
| 1 | **Period lock + audit trail** | Low surface area; reduces production data integrity risk. |
| 2 | **Tax model** (rates, inclusive/exclusive, tax lines on invoices/bills, GL split to liability accounts) | Unblocks real GST/VAT; extend `InvoiceGLEntries` pattern. |
| 3 | **Contact/org tax IDs** | Migration + API + UI; required for B2B invoicing. |
| 4 | **Bank import MVP** (CSV/OFX) + **clearing** status | Delivers reconciliation stepping stone without Plaid. |
| 5 | **Bank rules** (simple pattern match → account) | After import exists. |
| 6 | **Recurring invoices + recurring expenses** (Agenda jobs already in stack) | Reuse `agenda` dependency already in `package.json`. |
| 7 | **Invoice email** (parallel to SMS) | Completes sales comms. |
| 8 | **Fixed asset register + depreciation schedule** | Builds on existing account types. |
| 9 | **Export XLSX** (or document CSV-only) | Align UI buttons with backends. |

**High-risk areas:** tax calculation edge cases; FX on partial payments; any change to `JournalPoster` / balance aggregation (regression risk for all documents).

---

## 6. Classification

**Verdict: ⚠ Partial accounting system (strong core GL + reporting in `stockix-finance`, not a complete production-grade “full stack” accounting SaaS checklist).**

**Why not ❌ prototype:** There is a substantial, multi-module implementation: tenants, documents, event-driven GL posting, broad financial statements, inventory, projects, RBAC, PDFs, and manual journals with explicit balancing.

**Why not ✅ production-grade full accounting SaaS:** Material gaps vs the checklist: no evidenced tax engine, tax IDs, period lock, bank feeds/rules, full reconciliation, recurring AR/AP automation, payment capture, or integrated accounting in the default `apps/` product path. Fixed assets and payroll are not productized. Export/email flows are incomplete or unverified.

---

## 7. Evidence index (quick reference)

- GL posting: `services/stockix-finance/packages/server/src/services/Accounting/JournalPoster.ts`, `LedgerStorageService.ts`, `SaleInvoiceGLEntries.ts`
- Manual journal balance check: `services/stockix-finance/packages/server/src/services/ManualJournals/CreateManualJournal.ts` (`authorize` → `valdiateCreditDebitTotalEquals`)
- Financial routes: `services/stockix-finance/packages/server/src/api/controllers/FinancialStatements.ts`
- Feature flags: `services/stockix-finance/packages/server/src/interfaces/Features.ts` (`WAREHOUSES`, `BRANCHES`), `FeatureActivationGuard.ts`
- Monorepo dev scope: root `package.json` scripts (`dev`: `dashboard`, `api` only)
