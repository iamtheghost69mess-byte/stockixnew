# Accounting in this POS — what it is, how it works, real-life examples

This document describes **only the accounting subsystem** as implemented in this repository (POS backend + Studio back office). It mirrors the style of `INVENTORY_EXPLAINED.md`: concepts, navigation, permissions, APIs, and practical stories.

---

## What “accounting” means here

Accounting is the **general ledger (GL)** and related **sub-ledgers** for your organization:

- **Chart of accounts** — every book account (code, name, type: asset, liability, equity, revenue, expense).
- **Journal entries** — every financial event is recorded as balanced debits/credits in `JournalEntry` lines (including **automation from the POS** when orders are paid, and **manual** adjustments).
- **Configuration** — one **`AccountingConfig`** per organization: company currency, default GL accounts, tax mappings, payment-method-to-cash/bank mappings, cost method, inventory behaviour flags shared with stock, AP/AR clearing accounts, gift card liability, GRNI, etc.
- **Reporting** — trial balance, P&amp;L, balance sheet, cash-flow style views, budget vs actual, AR aging, session summaries, exports (CSV/PDF/XLSX/JSON).
- **Operations** — **cash register sessions**, **fiscal periods** (open/close), **invoices (AR)**, **vendor bills (AP)**, **credit notes**, **gift cards**, **FX rates**, **bank statement import & matching** (beta), **recurring journals** and **recurring invoices**, **audit log**, **order GL tools** (repost / reverse / refunds hooks).

**Real-life:** Your POS records **sales**; accounting turns that into **double-entry books** so you can file taxes, pay suppliers, show investors a **balance sheet**, and prove every number in an **audit**.

---

## How the pieces fit together (mental model)

1. **AccountingAccount** — A row in your **chart of accounts** (`code`, `name`, `type`, active flag). All journals reference these accounts.
2. **JournalEntry** — A posted document with lines: **which accounts moved**, **debit/credit amounts**, metadata (source order, manual memo, etc.). The ledger is the sum of all posted entries.
3. **AccountingConfig** — The **control panel**: where revenue, cash, card clearing, tax payable, discounts, AR, tips payable, retained earnings, round-off, FX gain/loss, gift card liability, AP, GRNI, customer deposits, purchase price variance default — and **how POS ties to inventory** (`stockDeductTrigger`, `strictOversell`, `reserveStockOnPending`, `defaultCostMethod`). Also **autoPostOnPaid** and **autoPostCogsOnPaid** drive whether paid orders automatically create sale and COGS journals.
4. **Orders → GL** — When an order becomes **`paid`** (and config allows), the backend runs ledger posting: **revenue / tax / tenders / discounts / tips** (sale side) and optionally **COGS + inventory relief** using recipes and cost logic (inventory side). Category-level revenue routing can be resolved via services that map menu categories to specific revenue accounts where configured.
5. **Sub-ledgers** — **AR** (customer invoices, payments, credit notes), **AP** (vendor bills from procurement, payments), **sessions** (register opens/closes), **gift cards** (liability when issued, revenue/reduction when redeemed), **bank** (imported lines matched to GL).
6. **AccountingPeriod** — **Month buckets** (`year`, `month`, `open` | `closed`). Closing a period blocks casual posting into closed months; **retained earnings closing** can roll P&amp;L into equity (separate endpoint — see fiscal periods UI copy).

**Real-life:** A **$12 sandwich + tax** paid by **card** creates journal lines: **card clearing (asset)** up, **revenue** and **tax payable** up on the credit side (pattern depends on implementation — always follow the actual trial balance for your tenant), and optionally **COGS expense** + **inventory** movement in line with your cost method (**FIFO**, **weighted average**, or **standard** per config).

---

## GL settings (`/dashboard/accounting/settings`) — what each idea does

These map to **`AccountingConfig`** (`accountingConfigModel.js`) and the Studio **GL settings** page.

| Setting | What it represents | Real-life example |
|--------|---------------------|-------------------|
| **Company currency** (`companyCurrency`) | ISO currency for reporting (e.g. USD). | You operate in **Lebanon** but report consolidated in **USD** — set company currency and use **FX rates** for mixed-currency activity where supported. |
| **Auto post on paid** (`autoPostOnPaid`) | When an order is marked **paid**, automatically create the **sales / tender / tax** side of the journal (subject to service rules). | Busy lunch: **200 tickets** — you do not want a bookkeeper typing each one manually. |
| **Auto post COGS on paid** (`autoPostCogsOnPaid`) | Also post **cost of goods sold** and inventory relief when paid, using recipes and costing. | Month-end **food cost %** lines up because COGS hit the same day as revenue. |
| **Default cost method** (`defaultCostMethod`: fifo / weighted_average / standard) | How ingredient cost is consumed when posting COGS / moving stock. | **FIFO** for perishable lots; **weighted average** for bulk dry goods. |
| **Default GL accounts** (revenue, cash, card clearing, tax payable, discount, AR, tips payable, retained earnings, round-off, FX gain/loss, gift card liability, AP, GRNI, customer deposit, purchase price variance) | Fallback accounts when automation or AP/AR flows do not specify another account. | Every **cash sale** hits **defaultCashAccount** unless a **payment method map** overrides it. |
| **Tax rates** (`taxRates`: code, name, rate, kind sales/withholding, **account**) | Maps order **tax line codes** to **liability (or withholding) GL accounts**. | **City tax** vs **state tax** post to **different payable accounts** for remittance. |
| **Payment method accounts** (`paymentMethodAccounts`: methodKey → account) | Maps POS tender keys (**cash**, **card**, **online**, **on_account**, etc.) to **cash, clearing, or AR**. | **Card** settles to **1010 Card clearing** until the processor payout reconciles to bank. |
| **Stock deduct trigger / strict oversell / reserve on pending** | Same flags inventory reads — they live on **AccountingConfig** and drive **POS + stock** behaviour (see `INVENTORY_EXPLAINED.md`). | Accounting and ops agree: **deduct on kitchen send** but **strict oversell on** for high-value items. |
| **Inventory alerts** (webhook URL, enabled flag, expiry days) | Optional outbound notifications for low stock / expiry summaries. | Slack webhook when **cream** is below threshold **and** when lots expire within **7 days**. |

---

## Permissions (who can touch what)

Routes use slices from `backofficeAccounting.js`. Typical keys:

| Permission | Used for |
|------------|----------|
| `backoffice.accounting.read` | Chart list, config read, sessions list, some reports, audit log read, FX read, etc. |
| `backoffice.accounting.write` | Create/update accounts, update config, ensure defaults, some cross-cutting posts. |
| `backoffice.accounting.gl.read` / `gl.write` | Journal entries, trial balance, P&amp;L, balance sheet, cash flow, budgets, recurring **journal** templates, exports, account ledger drill-down. |
| `backoffice.accounting.ar.read` / `ar.write` | Invoices, recurring invoices, AR aging, credit notes, gift cards, AR payments. |
| `backoffice.accounting.ap.read` / `ap.write` | Vendor bills, bill posting, bill payments (ties to procurement). |
| `backoffice.accounting.bank.read` / `bank.write` | Bank statements, import, line matching, reconciliation report. |
| `backoffice.accounting.periods.write` | Close fiscal periods, post **retained earnings** closing. |

**Real-life:** **Bookkeeper** gets **GL read**; **controller** gets **periods.write**; **AP clerk** gets **ap.write** only — separation of duties.

---

## Accounting menu (Studio) — each screen, what it does, real-life example

Paths are under `apps/pos-frontend2/.../dashboard/accounting/` and match the **Accounting** sidebar block.

| Screen | What it is for | Real-life example |
|--------|----------------|-------------------|
| **Accounts** (`/dashboard/accounting`) | **Chart of accounts** hub — browse/create/edit accounts (codes, types). | Add **6100 — Utilities expense** before you start posting power bills. |
| **Journal entries** (`/dashboard/accounting/ledger`) | Browse/filter **posted journals**; open detail; often paired with **manual journal** dialog where permitted. | Find **every entry** that hit **4000 Sales** last Tuesday for a **discrepancy** investigation. |
| **Trial balance** | For a date range: **per-account debits, credits, balance** — the foundation of financial statements. | **Auditor** asks for TB **as of quarter end** — export PDF/XLSX. |
| **GL settings** | **`AccountingConfig`** UI: auto-post flags, currency, defaults, tax table, payment maps, inventory policy fields, inventory webhooks. | Turn **autoPostCogsOnPaid** off during a **recipe migration** weekend, then back on. |
| **Profit &amp; Loss** | Income vs expenses over a period (**management view** of performance). | Compare **this March** to **last March** after a **menu price increase**. |
| **Balance sheet** | Assets, liabilities, equity **as of a point in time**. | **Bank loan covenant** reporting: debt vs equity snapshot. |
| **Cash flow** | Ledger-based **cash movement** view (as implemented — label in UI). | See whether operations **generated cash** even when P&amp;L looks good on accruals. |
| **Budget vs actual** | Compare **budgeted** amounts to **actual** GL activity for analysis. | **F&B cost** over budget → tighten **waste** procedures (see inventory doc). |
| **Budgets** | Maintain **budget** documents the BvA report reads. | Set **monthly rent and payroll** targets by account. |
| **FX rates** | Maintain / resolve **foreign exchange** rates for multi-currency contexts. | You invoice a **corporate client in EUR**; base books in **USD**. |
| **Recurring journals** | Templates (e.g. monthly **rent accrual**, **depreciation**) that can be **run** to generate journals. | **First of month**: auto-post **rent** debit / **AP** credit. |
| **Invoices (AR)** | **Customer invoices** (including **from order**), statuses, voids; ties to AR accounts. | Catered **wedding deposit** invoiced from the **banquet order**. |
| **Recurring invoices** | Scheduled **AR billing** (subscription catering, school lunch program). | **Corporate retainer** billed automatically on the **1st**. |
| **AR aging** | **Who owes how much** by age bucket. | Collections call list for **90+ days** past due. |
| **Credit notes** | Reduce AR / adjust revenue for **allowances** or **returns** with proper GL. | Issue **$50 credit** after a **service complaint** — documented, not a silent discount. |
| **Vendor bills (AP)** | Supplier invoices: create from **PO**, **post** to GL, **record payments**. | Match **vendor statement** to posted bills before **ACH run**. |
| **Register sessions** | **Open/close cash sessions** — operational control and tie to **session summary** reporting. | **Shift close**: counted cash vs system **over/short**. |
| **Fiscal periods** | **Open/close months**; closing blocks back-dated chaos; **retained earnings** roll. | **Lock January** so nobody “fixes” December after tax prep started. |
| **Audit log** | **Who changed what** in accounting-sensitive flows (journal/ config trail per implementation). | **SOC 2** evidence: **user X** voided invoice **#1042**. |
| **GL exports** | Download **journals**, **trial balance**, **integration JSON** for external ERP. | Feed **NetSuite / Xero** via CSV until native sync ships. |
| **Gift cards** | **Issue** (liability) and **redeem** (reduce liability / recognize revenue per rules). | **Holiday season**: track **outstanding gift card liability** on the balance sheet. |
| **Order GL tools** | **Repost**, **reverse**, **refund** hooks for orders vs ledger (admin repair paths). | POS glitch: order **paid** but journal failed — operator uses tools after root cause fix (**see integrity note below**). |
| **Bank (beta)** | Import **bank CSV**, **match** lines to GL, reconciliation report. | **Month-end bank rec** without re-keying every line. |

---

## Main HTTP API surface (`/api/accounting/*`)

Defined in `routes/accountingRoute.js` (all tenant-authenticated + RBAC). Grouped by theme:

- **Setup:** `POST /ensure-defaults`, `GET|PUT /config`, `GET|POST|PATCH /accounts`, `GET /accounts/:id/ledger`
- **GL core:** `GET|POST /journal-entries`, `GET /journal-entries/:id`, `GET /trial-balance`, reports `GET /reports/pnl`, `.../cash-flow`, `.../balance-sheet`, `.../budget-vs-actual`
- **Exports:** `GET /export/journals.csv|pdf`, `.../integration.json`, `.../trial-balance.xlsx|pdf`
- **Orders ↔ books:** `POST /post-order/:orderId`, `POST /reverse-order/:orderId`, `POST /refunds/:orderId`
- **AR:** invoices list/create/void, `POST /ar/payments`, recurring invoices CRUD + run, credit notes, AR aging report, gift cards
- **AP:** vendor bills (separate controller mounted on same router): list/get/from-PO/post/payments/void
- **Periods:** `GET /periods`, `POST /periods/close`, `POST /closing/retained-earnings`
- **FX:** `GET|POST /fx/rates`, `DELETE /fx/rates/:id`, `GET /fx/resolve`
- **Budgets & recurring JE:** budgets CRUD; recurring-templates CRUD + run
- **Bank:** statements, import CSV, match, suggestions, reconciliation report
- **Sessions:** list, open, close; `GET /reports/session-summary`
- **Misc:** `GET /audit-log`, `POST /sync/ack`, `POST /inventory/bootstrap-cost-layers`

**Real-life:** Your integration partner uses **`export/integration.json`** nightly; your accountant lives in **`trial-balance.pdf`**.

---

## How POS sales reach the books (happy path)

1. Staff completes an order and marks it **paid** (tenders, tax lines, discounts, tips per order model).
2. If **`autoPostOnPaid`** is on, the accounting service builds **sale journal** lines using **default + category + tax + payment method** mappings.
3. If **`autoPostCogsOnPaid`** is on, **COGS** and inventory-side entries run using **recipes** and **cost method** / layers (inventory module).
4. Journals appear under **Journal entries** and roll into **TB / P&amp;L / BS**.

**Operational integrity note (from codebase audit):** In some paths, **errors while posting the sale journal on payment may be caught without failing the HTTP payment flow**, meaning an order can show **paid** while GL is incomplete. Treat **Order GL tools**, **audit log**, and **“paid order vs journal exists”** checks as part of your **month-end control** until you harden that behaviour in code. COGS failures are similarly sensitive — reconcile **COGS accounts** to **inventory movements** periodically.

---

## Relationship to inventory (short cross-link)

- **Cost method** and **COGS auto-post** live in **AccountingConfig** but drive **inventory valuation** behaviour.
- **Stock deduct trigger** is stored on the same config document inventory reads (`inventorySettingsService`).

For ingredient-level behaviour, read **`docs/INVENTORY_EXPLAINED.md`**.

---

## End-to-end story (puts it all together)

**Scenario:** Multi-location café, month end.

1. **GL settings:** Map **card** tender to **clearing**, **cash** to **till asset**, map **VAT codes** to **2000 / 2011** payables, enable **auto post on paid** + **COGS**.
2. **Daily:** Hundreds of **paid orders** → journals accumulate; **sessions** close with **cash over/short** adjustments if needed.
3. **AP:** **GRN** posts stock; **vendor bill** posts **AP + expense/GRNI**; **payment** clears **AP** and hits **bank** when paid.
4. **AR:** **Corporate account** gets **invoice from order**; **AR aging** drives collections; **credit note** fixes a **billing error**.
5. **Day 30:** **Trial balance** ties; **P&amp;L** shows margin; **balance sheet** shows **gift card liability** + **AP** + **cash**.
6. **Controller** runs **period close** for the month and **retained earnings** closing where policy requires.

---

## If you read nothing else

- **Accounts + journals** are the **source of truth** for financial statements.
- **AccountingConfig** wires **POS behaviour** to **the right GL buckets** and **inventory costing**.
- **AR / AP / sessions / gift cards / bank** are the **operational sub-ledgers** around the GL.
- **Periods + audit + exports** are how you **stay compliant** and **integrate** upward.

For implementation details, start with `apps/pos-backend/services/accountingService.js`, `models/accountingConfigModel.js`, `models/journalEntryModel.js`, and `routes/accountingRoute.js`; Studio pages live under `apps/pos-frontend2/src/app/(main)/dashboard/accounting/`.
