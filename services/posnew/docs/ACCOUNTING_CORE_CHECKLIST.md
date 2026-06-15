# Accounting — CORE only (simple checklist)

Use this **before** AR, AP, bank, budgets, or exports. Seven features; same order you should set them up in Studio (`pos-frontend2`).

### Sidebar (Studio)

Under **Accounting — Core**, items are listed top-to-bottom in workflow order: **Overview** (hub) → **Chart of accounts** → **Journal entries** → **GL settings** (AccountingConfig: company currency, **auto post on paid**, **tax rate → payable** rows, **payment method → GL** rows, cost method, inventory flags) → **Register sessions** → **Trial balance** → **Profit & Loss** → **Fiscal periods**.  
Everything else lives under **Accounting — Extended** so the core list stays short and scannable.

---

## One-line map

| # | Feature | Plain English | Where in Studio |
|---|---------|---------------|-----------------|
| 1 | **Chart of accounts** | Your GL “buckets” (codes + types). | **Accounting → Chart of accounts** `/dashboard/accounting/accounts` (overview hub: `/dashboard/accounting`) |
| 2 | **Journal entries** | Every money movement (manual + from POS). | **Journal entries** `/dashboard/accounting/ledger` |
| 3 | **AccountingConfig (GL settings)** | Wire tenders, tax codes, and defaults to those buckets. | **GL settings** `/dashboard/accounting/settings` |
| 4 | **Auto post on paid** | When an order is **paid**, post the **sales** journal automatically (if toggled on). | Same page: **Auto post on paid** switch |
| 5 | **Tax + payment maps** | Each tax code → payable account; each tender (cash/card/…) → account. | Same page: **Tax rates** + **Payment method accounts** tables |
| 6 | **Register sessions** | Open/close a **cash shift** (float, close, variance). | **Register sessions** `/dashboard/accounting/sessions` |
| 7 | **Trial balance + P&amp;L + fiscal periods** | TB = debits/credits check; P&amp;L = profit story; periods = **lock a month**. | **Trial balance**, **Profit &amp; Loss**, **Fiscal periods** |

---

## Permissions (minimum to “check” core)

| Task | Permission |
|------|------------|
| See accounts + settings + sessions + periods | `backoffice.accounting.read` |
| Edit settings, create accounts, open/close sessions | `backoffice.accounting.write` |
| See journals, TB, P&amp;L | `backoffice.accounting.gl.read` |
| Post **manual** journal | `backoffice.accounting.gl.write` |
| **Close** a fiscal month | `backoffice.accounting.periods.write` |

If something is greyed out, the role is missing that key.

---

## Happy-path test (15 minutes)

Do **1 → 5** in order once; then **6** if you use cash; then **7** when you trust the numbers.

1. **GL settings** — Turn **Auto post on paid** **ON**. Set **company currency**. Pick **default** accounts (revenue, cash, card clearing, tax payable) from dropdowns. Save.
2. **Tax / payment rows** — At least one **tax code** that matches your menu tax line, and **cash** + **card** (or whatever you use) mapped to accounts.
3. **Accounts** — Confirm accounts exist (use **Ensure defaults** in settings if your tenant is new). Codes like 4000 / 2000 / 1010 are typical.
4. **POS** — Ring a **small test order**, **pay** it (use a real tender you mapped).
5. **Journal entries** — Filter **Order sale**, find today’s entry, open it: lines should balance.
6. **Trial balance** — Same date range: **total debits = total credits**.
7. **P&amp;L** — Revenue line should move for the test day.
8. **Sessions** (optional) — **Open session** with float → take a **cash** payment → **close session**; check variance makes sense.
9. **Fiscal periods** — Leave months **open** until month-end; **close** only when TB is clean (needs `periods.write`).

---

## What “good” looks like

- After a paid sale, you see an **Order sale** journal without typing it.
- TB always **balances** for the same org/date range.
- Staff with only **accounting.read** can **view**; only trusted roles get **write** / **gl.write** / **periods.write**.

---

## Paid order ↔ GL visibility (API + Mongo)

When an order becomes **paid**, the backend persists **`accountingSaleStatus`**, **`accountingCogsStatus`**, and optional error strings on the **Order** document, and includes **`accountingPosting`** in the JSON body next to **`data`** on create/update/patch responses (HTTP **200** by default so POS clients are not broken).

- **Check in the field:** Inspect the latest PATCH/create response: `accountingPosting.sale.status` should be **`ok`** when `autoPostOnPaid` is on and config is valid; **`failed`** means fix GL settings and use **Order GL tools** (`/dashboard/accounting/order-gl`).
- **Check in Mongo:** Query orders with `accountingSaleStatus: "failed"` for a support queue until a dedicated admin list exists.

Treat **trial balance vs POS** as your month-end safety net; failures should no longer be “log only” with no order-level trace.

---

## Not core (ignore for first pass)

Balance sheet, cash flow, budgets, AR/AP, gift cards, FX, recurring JE, bank import, exports — use **`docs/ACCOUNTING_EXPLAINED.md`** when you are ready.
