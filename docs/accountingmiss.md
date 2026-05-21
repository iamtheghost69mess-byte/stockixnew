# Stockix Finance — Bigcapital Feature Audit & Development Roadmap

**Purpose:** Comprehensive audit of our forked Bigcapital instance (`services/stockix-finance/`). Documents what exists, what is missing, and what is partially implemented to guide development toward a white-label, multi-tenant, on-premise-capable accounting platform.

**Target product:** Self-hosted accounting with full inventory, **manual-only** multi-currency, multi-tenant provisioning with sub-tenant inheritance, full import/export, and multi-currency reports including trial balance.

**Related audit:** Tenant/org/licensing control plane gaps are detailed in `accountmissing2.md`.

**Last reviewed:** May 19, 2026
---

## 1. WHAT BIGCAPITAL ALREADY HAS (CONFIRMED FROM CHANGELOG + CODEBASE)

Features below are present in the upstream Bigcapital fork unless marked **(Stockix)**.

### Core Accounting
- [x] Double-entry accounting (GL, journal entries, chart of accounts)
- [x] Manual journals
- [x] Trial balance report (`packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/`)
- [x] Balance sheet (prior-period and prior-year comparisons, percentage analysis)
- [x] Profit & loss (prior-period and prior-year comparisons, percentage analysis)
- [x] Cash flow statement
- [x] General ledger
- [x] AR aging summary
- [x] AP aging summary
- [x] Sales tax liability summary
- [x] Customer / vendor balance summary
- [x] Transactions by customer / vendor reports

### Sales
- [x] Sale invoices (PDF templates, branding, email, print)
- [x] Sale estimates (convert to invoice)
- [x] Sale receipts
- [x] Credit notes
- [x] Payment received
- [x] Recurring invoices
- [x] Discount on transactions

### Purchasing
- [x] Purchase bills
- [x] Vendor credits
- [x] Payment made
- [x] Landed costs on purchase invoices (`BillLandedCosts` module)

### Inventory
- [x] Items (inventory, non-inventory, service)
- [x] Stock auto-increment on purchase, auto-decrement on sale
- [x] Inventory adjustments
- [x] Inventory valuation report
- [x] Inventory summary sheet
- [x] Multiple warehouses (activate / deactivate)
- [x] Warehouse transfers (transfer orders)
- [x] Multiple branches (transactions per branch)
- [x] Financial reports integrated with branches
- [x] Inventory reports integrated with warehouses
- [x] Inventory cost lot tracker schema (`inventory_cost_lot_tracker`) — used for costing pipeline
- [x] Item category `cost_method` field supports `FIFO` | `LIFO` | `AVG` in schema — **runtime compute uses average cost only** (see §3)

### Banking
- [x] Bank accounts
- [x] Bank transactions (money in / out)
- [x] Bank reconciliation
- [x] Bank rules (automated categorization)
- [x] Categorize & match bank transactions
- [x] Plaid integration (bank sync)
- [x] Pending bank transactions
- [x] Un-categorize transactions

### Multi-currency
- [x] Foreign currency on invoices, bills, journals, payments
- [x] Per-transaction exchange rate; item rates recalculate when invoice rate changes (CHANGELOG)
- [x] Manual exchange rate table (`exchange_rates`) with CRUD in UI
- [x] Third-party exchange rate fetch via **Open Exchange Rates** (`packages/server/src/modules/ExchangeRates/lib/OpenExchangeRate.ts`, `ExchangeRates.service.ts` L36) — **must be disabled for our product**
- [x] Multi-currency accounts (FCY ledger accounts)
- [x] Dual-currency display on several transaction UIs (`DualCurrencyAmountCell`, `DualCurrencyTotalLines`) — **reports not fully multi-currency**

### Import / Export
- [x] **Import (CSV/XLSX):** accounts, items, item categories, customers, vendors, sale invoices, sale estimates, bills, bill payments, vendor credits, credit notes, payments received, expenses, manual journals, tax rates, uncategorized bank transactions
- [x] **Export:** resource tables (CSV, XLSX, PDF via resource exporters)
- [x] **Export:** general ledger, journal sheet, inventory valuation, sales by items, purchases by items (CSV/XLSX)
- [x] **Financial reports:** CSV, XLSX, and PDF download hooks for most major reports (e.g. trial balance, balance sheet, P&L, cash flow, AR/AP aging — see `packages/webapp/src/hooks/query/FinancialReports/`)
- [x] Financial reports print (browser print)
- [x] Import sample download per resource (`ImportSample` / `GET import/:resource/sample`)

### Auth & Organization
- [x] Sign-up with email verification
- [x] Sign-up restrictions (`SIGNUP_DISABLED`, allowed domains/emails)
- [x] Password reset
- [x] Role-based permissions (RBAC)
- [x] Multi-tenant architecture (isolated tenant DB per organization via Knex migrations)
- [x] Organization setup wizard (subscription + organization + init + congrats — `packages/webapp/src/containers/Setup/`)
- [x] **(Stockix)** Multi-organization on one finance stack (`user_tenants`, `POST /auth/switch-tenant`)
- [x] **(Stockix)** Organization switcher in sidebar (`useStockixOrgs` + `useSwitchTenant` — lists orgs from Stockix API, not `organization/all`)

### Other
- [x] Tax rates (inclusive/exclusive, import/export)
- [x] Expense tracking
- [x] Attachments / document uploads (S3-compatible)
- [x] PDF invoice templates (branding, logo, colors, addresses)
- [x] Invoice payment link (Stripe)
- [x] Contacts (customers, vendors)
- [x] User management with invitations
- [x] Date format settings
- [x] Auto-increment numbering for transactions
- [x] **(Stockix)** Control-plane tenant provisioning worker builds org via API (`infra/worker-service/`)
- [x] **(Stockix)** White-label branding per customer tenant (`tenant_config` in Stockix Postgres — not inside Bigcapital UI)

### UI shells without full backend (important)
- [ ] Realized gain/loss report routes exist in webapp (`/financial-reports/realized-gain-loss`) — **no matching server report module found**
- [ ] Unrealized gain/loss report routes exist in webapp — **no matching server report module found**

---

## 2. WHAT IS MISSING (MUST BUILD)

### Tenant Provisioning Flow
**STATUS: MISSING (in-product); PARTIAL (Stockix worker)**

When a new tenant (organization) is provisioned by the operator:
- [ ] Tenant signs up or is invited — today: worker calls `/api/auth/register` with email allowlist; wizard not enforced on first login if org pre-built
- [ ] On first login, redirect to mandatory organization setup wizard
- [ ] Wizard collects: organization name, base currency, fiscal year start, industry, country, address, tax number, logo, date format, language
- [ ] After wizard completion, persist completion flag in DB (not Redux-only)
- [ ] Organization fully initialized only after wizard + build job complete

When a **sub-tenant** is provisioned under a parent:
- [ ] Sub-tenant inherits: base currency, fiscal year, tax rates, chart of accounts template, default accounts (AR, AP, inventory, income, COGS)
- [ ] Sub-tenant can override settings after creation
- [ ] Parent can view and manage all sub-tenants from finance UI
- [x] **(Stockix partial)** Worker inherits org *metadata* settings from parent on build (`fetch-stockix-finance-org-settings.ts`) — currency, fiscal year, country, language, timezone, date format only
- [x] **(Stockix)** Sub-org creation from owner dashboard (`apps/api` + `org-provision-runtime.ts`)

### Multi-Currency Reports (Manual Rates Only)
**STATUS: PARTIAL**

- [ ] **Disable** external exchange rate API entirely — manual input only per transaction and optional dated rate table
- [ ] Reports show foreign currency and base currency **side by side** on financial statements (not only on transaction forms)
- [ ] Filter reports by currency
- [ ] Trial balance in **multiple currencies** (columns or sheets per currency)
- [ ] Balance sheet with foreign currency columns
- [ ] P&L with foreign currency breakdown
- [ ] Realized currency gain/loss (payment rate vs invoice rate) — **backend report + GL posting**
- [ ] Unrealized currency gain/loss (open AR/AP at period-end rate) — **backend report + GL posting**
- [ ] Automatic currency gain/loss GL entries

### Full Inventory — Missing Features
**STATUS: PARTIAL (core WMS / advanced costing missing)**

- [ ] Barcode / QR scanning per item
- [ ] Serial number tracking
- [ ] Lot / batch tracking (lot table exists for costing; not full batch UX with expiry)
- [ ] Expiry date per lot
- [ ] Reorder point per item
- [ ] Low stock alerts / notifications
- [ ] Auto-generate purchase order when stock hits reorder point
- [ ] **FIFO costing** — selectable and enforced (schema hints only; compute uses AVG)
- [ ] **LIFO costing**
- [ ] Standard costing
- [ ] Goods receipt workflow (receive against PO, partial delivery)
- [ ] Bin / shelf / location within warehouse
- [ ] Stock movement history per item (full audit trail UI)
- [ ] Stock aging report
- [ ] Cycle counting / stocktake workflow
- [ ] Dead stock / slow-moving items report
- [ ] Inventory forecasting
- [ ] Multi-currency inventory valuation
- [ ] Landed cost allocation **per item** (bill-level landed cost exists; per-item allocation rules not full WMS)

### Import / Export Gaps
**STATUS: PARTIAL**

- [ ] Export **all** financial reports as downloadable PDF (verify each report; many already have PDF hooks — close gaps)
- [ ] Trial balance in **multi-currency** export (CSV/XLSX/PDF) — single-currency TB export **exists**
- [ ] AR / AP aging — exports **exist** for standard layout; confirm PDF + multi-currency variants
- [ ] Import: **opening balances per GL account** (bulk)
- [ ] Import: **inventory opening stock** (quantities and values)
- [ ] Import: warehouse transfers
- [ ] Bulk import with **detailed row-level error reporting** (beyond basic validation)
- [ ] Export templates: downloadable sample CSV for **every** importable resource (sample endpoint exists — ensure coverage + docs)

### Reporting Gaps
**STATUS: PARTIAL**

- [ ] Consolidated financials across organizations / branches
- [ ] Budget vs actual
- [ ] Cash flow forecast
- [ ] Sales by salesperson
- [ ] Inventory turnover
- [ ] Gross profit by item
- [ ] Customer profitability
- [ ] Fixed assets register and depreciation schedule (fixed-asset **account type** exists; no assets module)

### Other Missing
- [ ] Payroll (employees, salaries, payslips, payroll journals)
- [ ] Fixed assets management module (register, depreciation runs)
- [ ] Project / job costing
- [ ] Budgeting module
- [ ] Recurring expenses (recurring **invoices** exist; not expenses)
- [ ] Approval workflows (invoice/bill approval before posting)
- [ ] Audit log (who changed what, when) — admin audit exists in Stockix control plane only
- [ ] Two-factor authentication (2FA)
- [ ] White-label branding **inside Bigcapital tenant UI** (Stockix `tenant_config` is separate)
- [ ] Mobile apps (iOS / Android)
- [ ] Outbound API webhooks for business events (Stripe/Lemon/Plaid webhooks exist for payments only)

---

## 3. WHAT IS PARTIAL (EXISTS BUT INCOMPLETE)

### Multi-currency
| Area | Status | Notes |
|------|--------|-------|
| Transactions in foreign currency | ✅ | `exchange_rate` on documents; dual-currency footers on invoices/bills |
| Exchange rate API | ⚠️ | Open Exchange Rates integrated — **must disable**; keep manual table + per-transaction rate |
| Manual dated rates | ✅ | `exchange_rates` table + UI |
| Reports in foreign currency | ❌ | TB, BS, P&L are base-currency oriented; no multi-currency columns |
| Currency gain/loss accounting | ❌ | UI routes only for realized/unrealized; no server reports or auto GL |
| Trial balance multi-currency | ❌ | Single-currency TB export exists (`use-trial-balance-sheet.ts`) |

### Inventory
| Area | Status | Notes |
|------|--------|-------|
| Basic stock tracking | ✅ | Qty on hand, adjustments, valuation |
| Multi-warehouse | ✅ | |
| Warehouse transfers | ✅ | |
| Cost lot infrastructure | ⚠️ | `InventoryCostLotTracker`; used with average method |
| FIFO / LIFO | ❌ | `TCostMethod` type + category field; `InventoryComputeCost.service.ts` always calls average method |
| Serial / lot / batch UX | ❌ | |
| Reorder points / alerts | ❌ | |
| Goods receipt vs PO | ❌ | |
| Bin locations | ❌ | |
| Landed cost on bills | ✅ | `BillLandedCosts` module |

### Multi-tenant / Multi-org
| Area | Status | Notes |
|------|--------|-------|
| Tenant isolation | ✅ | Separate tenant DB (Knex) |
| Multi-org per stack | ✅ **(Stockix)** | `user_tenants`, `switch-tenant` |
| Org switcher | ✅ **(Stockix)** | `SidebarHead.tsx` + Stockix public org API |
| Mandatory provisioning wizard | ❌ | Pre-built org skips wizard; completion not in DB |
| Sub-tenant inherits parent settings | ⚠️ **(Stockix)** | Metadata only via worker; no COA/tax copy |
| Operator tenant dashboard | ✅ **(Stockix)** | `apps/dashboard` — separate from Bigcapital UI |
| `GET organization/all` | ❌ | Called by webapp; **no server route** |

### Import / Export
| Area | Status | Notes |
|------|--------|-------|
| Resource table import/export | ✅ | Broad coverage (see §1) |
| Financial report CSV/XLSX | ✅ | Most reports |
| Financial report PDF download | ⚠️ | Hooks for major reports; verify completeness |
| Trial balance export | ✅ | CSV/XLSX/PDF — **single currency** |
| Opening balance import | ❌ | Per-contact opening balance exists; not bulk GL opening import |
| Row-level import errors | ⚠️ | Basic validation; needs richer per-row feedback |

### Auth & licensing (Stockix overlay)
| Area | Status | Notes |
|------|--------|-------|
| Signup disabled + provision | ⚠️ | See `accountmissing2.md` |
| License sync to finance | ❌ | Stockix `licenses` table not pushed to Bigcapital |
| Platform user API | ❌ | Only `internal/attach-user-to-tenant` |

---

## 4. DEVELOPMENT PRIORITY ORDER

### Phase 1 — Foundation (do first)
1. [ ] Disable external exchange rate API — enforce manual-only exchange rates (`ExchangeRates.service.ts`, config flag, remove Open Exchange Rates calls from UI defaults)
2. [ ] Tenant provisioning wizard — mandatory on first login, DB completion flag, all required fields (align with `accountmissing2.md` §1)
3. [ ] Sub-tenant inherits parent org settings on creation — extend worker + finance APIs beyond metadata (tax rates, COA template, default accounts)
4. [ ] Trial balance **multi-currency** export (CSV/XLSX/PDF) — build on existing single-currency TB export
5. [ ] Audit financial reports PDF export — fill any reports missing downloadable PDF

### Phase 2 — Multi-currency Reports
6. [ ] Reports filter by currency
7. [ ] Balance sheet and P&L with foreign currency columns
8. [ ] Realized and unrealized currency gain/loss — **implement server reports + GL logic** (replace UI-only shells)
9. [ ] Automatic currency gain/loss GL entries on payment and period-end
10. [ ] Trial balance in multiple currencies (on-screen + export)

### Phase 3 — Full Inventory
11. [ ] Reorder points and low stock alerts
12. [ ] FIFO costing method (wire `InventoryComputeCost` to FIFO service; consume lots oldest-first)
13. [ ] Serial number tracking
14. [ ] Lot / batch tracking with expiry dates
15. [ ] Goods receipt workflow (partial delivery against PO)
16. [ ] Bin / shelf location within warehouse
17. [ ] Stock movement history per item (audit trail UI)
18. [ ] Auto-generate PO on low stock
19. [ ] Landed cost allocation per item
20. [ ] Stock aging report

### Phase 4 — Import/Export Completion
21. [ ] Opening balance import (GL accounts + inventory)
22. [ ] Export all missing report variants (multi-currency where applicable)
23. [ ] Row-level import error reporting
24. [ ] Download sample CSV for all importable resources (document + verify)

### Phase 5 — Advanced
25. [ ] Budget vs actual report
26. [ ] Project / job costing
27. [ ] Fixed assets + depreciation
28. [ ] Payroll module
29. [ ] Approval workflows
30. [ ] Audit log (finance tenant scope)
31. [ ] API webhooks for tenant business events

### Parallel — Control plane (see `accountmissing2.md`)
- [ ] Platform API for user/license management
- [ ] Organization number field
- [ ] License → finance sync and suspension lockout

---

## 5. TECHNICAL NOTES FOR DEVELOPERS

### Stack
- **Backend:** Node.js, TypeScript, NestJS, Objection.js (Knex), MySQL/MariaDB per tenant
- **Frontend:** React, Blueprint.js, React Query
- **Queue:** BullMQ (Redis)
- **Storage:** S3-compatible (MinIO or cloud)
- **Deploy:** Docker Compose; per-tenant stacks via Stockix worker (`infra/tenant-stack/`)

### Multi-tenancy
- Each tenant has an isolated schema/database batch via Knex migrations (`TenantsManager`, `BuildOrganization.service.ts`)
- Tenant context from JWT + `organization-id` header; `TenancyContext` + guards in `packages/server/src/modules/Tenancy/`
- **Always** scope queries to current tenant; never read/write another tenant’s DB
- **Stockix:** One finance Docker stack per customer; multiple Bigcapital tenants (orgs) on same stack via register + `switch-tenant`

### Exchange rate
- **Current:** `ExchangeRatesService.getLatest()` calls `OpenExchangeRate` (`packages/server/src/modules/ExchangeRates/ExchangeRates.service.ts`)
- **Also:** Manual rates stored in tenant `exchange_rates` table; per-document `exchange_rate` on transactions
- **Required:** Feature flag `EXCHANGE_RATE_PROVIDER=manual` (or remove provider); UI must not auto-fetch; default new documents to user-entered rate or latest **stored** manual rate for date
- **Reports:** Ledger already tracks FCY on some accounts (`LedgetAccountStorage.service.ts`) — extend report transformers for multi-column output

### Inventory costing
- **Current:** `InventoryAverageCostMethodService` only (`InventoryComputeCost.service.ts` L82–85)
- **Schema:** `items_categories.cost_method`, type `TCostMethod = 'FIFO' | 'LIFO' | 'AVG'`
- **Lots:** `InventoryCostLotTracker` + `StoreInventoryLotsCost.service.ts` — foundation for FIFO
- **Required:** Implement `InventoryFifoCostMethodService` / `InventoryLifoCostMethodService`; branch in `computeInventoryItemCost`; org or category-level default method in settings

### Currency gain / loss
- **Realized:** On payment — compare invoice `exchange_rate` vs payment `exchange_rate`; post difference to Currency Gain/Loss (configure default accounts in settings)
- **Unrealized:** Period-end job — revalue open AR/AP at closing rate vs transaction rate; post to Unrealized Gain/Loss; reverse next period
- **Reports:** Implement server modules under `FinancialStatements/modules/` (currently webapp-only routes)

### Organization setup wizard
- **Routes:** `/setup` guarded by `EnsureOrganizationIsReady` / `EnsureOrganizationIsNotReady`
- **Provision bypass:** Worker `fetchBuildOrganization` sets `builtAt` before user visits `/setup` — fix via `setup_completed_at` guard on dashboard
- **Stockix worker paths:** `provision-runtime.ts`, `org-provision-runtime.ts`

### Import
- Register new importables with `@ImportableService` + extend `Importable` class
- Sample files: `ImportSample.sample(resource, format)`
- **Gap:** Opening balances need new importable targeting `ManualJournal` or dedicated opening-balance service

### Export
- Financial reports: pattern in `packages/webapp/src/hooks/query/FinancialReports/use-*.ts` (query params + `accept` header + filename)
- Server: report controllers under `FinancialStatements` with `export` / `pdf` endpoints

### Stockix-specific integration points
- Org list: `REACT_APP_STOCKIX_API_URL` + `REACT_APP_STOCKIX_TENANT_ID` (`useStockixOrgs.tsx`)
- Internal API: `POST /api/internal/attach-user-to-tenant` with `INTERNAL_API_SECRET`
- Do not rely on `organization/all` until implemented

---

## 6. QUICK REFERENCE — STATUS LEGEND

| Symbol | Meaning |
|--------|---------|
| ✅ | Confirmed in codebase / working |
| ⚠️ | Partially implemented or needs hardening |
| ❌ | Missing or not functional |
| **(Stockix)** | Added or integrated by Stockix team, not upstream Bigcapital |

---

*This document is planning-only. No implementation code. Update as features ship.*
