# Inventory in this POS — what it is, how it works, real-life examples

This document describes **only the inventory subsystem** as implemented in this repository (POS backend + dashboard). It is meant for operators and developers who want a plain-language map of concepts and screens.

---

## What “inventory” means here

Inventory is **ingredient- and recipe-based stock** for a restaurant or retail-style operation:

- You define **what you stock** (ingredients), **where** it sits (locations, optional bins/zones in the warehouse), and **how selling a dish consumes stock** (recipes / bill of materials).
- Every change in quantity is recorded as a **stock movement** (audit trail).
- **Procurement** (purchase orders, goods receipt) brings stock in; **POS orders**, **waste**, **transfers**, **returns**, and **adjustments** move it out or between places.
- Optional **cost layers** support valuation and COGS-style reporting.

**Real-life:** You run a café. “Inventory” is not only counting bags of coffee — it is tying **every cappuccino** to **grams of beans + ml of milk**, knowing **main store vs kitchen** stock, and seeing **when to reorder** after a busy weekend.

---

## How the pieces fit together (mental model)

1. **Ingredient** — A stock item (e.g. “Arabica beans”, “Full cream milk”) with a **unit** (g, kg, ml, l, piece), optional **purchase unit** conversion, reorder hints, barcode, serial tracking flags, etc.
2. **Recipe** — Links a **menu item** (and optionally a variant) to **lines** of consumption: each line is either a quantity of one **ingredient** or a scaled reference to another **menu item’s** recipe (nested BOM).
3. **Menu item** — What you sell on the POS; inventory cares about it because recipes hang off it.
4. **Stock balance** — **On-hand quantity per organization × location × ingredient** (and optionally **bin**). This is the operational source of truth for “how much do we have *here*”. The ingredient document also stores **`currentStock`** as a **denormalized total** across locations (kept in sync by balance logic — useful for quick totals and low-stock views).
5. **Stock movement** — Every delta to stock with a **reason** (sale deduction, receive, waste, transfer, return, correction, …), optional order link, location, lot/expiry fields, cost snapshot fields, etc.
6. **Inventory cost layer** — Buckets of quantity received at a **unit cost** (FIFO / weighted logic is handled in services) for valuation and deduction costing.
7. **Accounting / tenant config** — **POS inventory policy** (when stock is deducted, strict oversell, reservations) is read from accounting-style settings (`stockDeductTrigger`: kitchen send vs payment vs both; `strictOversell`; `reserveStockOnPending`).

**Real-life:** A **burger** recipe might consume **one bun (piece)**, **150 g beef**, **30 g cheese**. When staff fire the order (or when the guest pays — depending on policy), the system creates **movements** that reduce **stock balances** at the **kitchen** location and updates **cost** if configured.

---

## POS behaviour (when stock actually moves)

The dashboard shows a summary from **`GET /api/inventory/pos-policy`**:

- **Stock deduction trigger** — When selling reduces inventory:
  - **Kitchen / station send** — Deduct when the kitchen (or station) receives the order / sends the item (typical for food that should reserve usage when production starts).
  - **Payment** — Deduct when payment completes (typical when you only want COGS aligned with cash).
  - **Both** — Logic can fire on both events per configuration (see service rules in code).
- **Strict oversell** — If on, the system is stricter about selling when there is not enough stock to fulfill recipe demand; if off, you may allow sales past on-hand (business risk — know your policy).
- **Reserve stock on pending** — Relates to holding or reserving quantity for open checks/orders where configured.

**Real-life:** Fast casual: you choose **kitchen send** so you do not sell 200 burgers if you only have 80 buns *when the line actually starts cooking*. A small retail counter might use **payment** so stock matches the register closing.

---

## Stock movement reasons (what each represents)

Movements use a fixed set of **reasons** (see `stockMovementModel.js`). In plain language:

| Reason | Meaning |
|--------|--------|
| `order_deduction` | Sale consumed ingredients per recipe (linked to order/line). |
| `order_line_void` / `order_cancel` | Reversal-style flows when a line or order is cancelled after deduction rules apply. |
| `manual_adjust` | Someone intentionally changed stock (found extra, fixed a mistake). |
| `waste` | Spoilage, drops, prep mistakes — stock leaves without revenue. |
| `receive` | Stock in from supplier/receipt/adjustment treated as receiving. |
| `customer_return` | Stock comes back from a customer return (may be restockable or not — quality flags exist). |
| `vendor_return` | Stock sent back to supplier (RTV). |
| `correction` | Administrative correction to align the ledger. |
| `transfer_out` / `transfer_in` | Moving stock between locations (paired by transfer group in the data model). |

**Real-life:** End of day you pour **2 l of milk** down the drain — that is **`waste`**. You move **5 kg flour** from **warehouse** to **bake shop** — **`transfer_out`** / **`transfer_in`**. A customer brings back an unopened retail SKU you reshelve — **`customer_return`**.

---

## Stock balance fields (per location × ingredient)

Besides **quantity** (on hand):

- **`reservedQty`** — Quantity mentally “held” for open checks or reservations (manual / future automation).
- **`incomingQty`** — Expected from purchase orders / deliveries not yet received (planning / visibility).
- **`maxStockLevel`** — Ceiling guidance for that bin/location line.
- **`lastInventoriedAt`** / **`lastMovedAt`** — Audit and aging hints (stock take vs last activity).

**Real-life:** You ordered **20 crates** arriving Friday; you set **incoming** so managers do not panic-order again on Wednesday.

---

## Dashboard: **Inventory** hub (`/dashboard/inventory`)

The main **Inventory** screen is an **operator hub**:

- **Overview** — Aggregated **inventory report** and context.
- **Balances** — Per-location (and filters) view of **stock balances**; you can open **planning** fields (reserved / incoming / max).
- **Movements** — Paginated **history** with filters; export helps accountants and audits.
- **Low stock** — Ingredients at or below **reorder threshold** (ties to ingredient `reorderThreshold` / `reorderQuantity`); quick link to thinking about **purchase orders**.
- **Adjust** — Post a controlled change (reasons like manual adjust, waste, receive, customer return, correction) with notes — creates **movements** and updates balances.
- **Transfer** — Move quantity **from location A to B** for the same ingredient.

**Real-life:** Monday morning the **head chef** opens **Balances** for “Central kitchen”, spots **incomingQty** for chicken, and uses **Low stock** to email procurement — without walking the freezer with a clipboard for every SKU.

---

## Other inventory-related screens (Stock section of the app)

These are grouped under **Stock** in navigation; together they are the full inventory **lifecycle**:

| Screen | What it is for | Real-life example |
|--------|----------------|-------------------|
| **Ingredients** | Master data for every stocked item (units, barcodes, reorder levels, serial flags). | Add **“Oat milk 1L”** with unit **ml** and barcode so scanning works at GRN. |
| **Ing. Categories** | Grouping/filtering ingredients. | **“Dry goods”** vs **“Dairy”** for reports and permissions habits. |
| **Suppliers** | Who you buy from (used with procurement). | **“Local dairy co-op”** payment terms and contact. |
| **Purchase Orders** | Formal request to buy quantities / prices. | Busy season: PO for **200 kg** potatoes with expected delivery date. |
| **Goods receipt notes (GRN)** | Record what **actually arrived** vs PO; posting updates stock and costing. | Supplier short-ships **10 kg**; you receive **190 kg** and the system matches reality. |
| **RFQ** | Request for quotation before committing to a PO. | Compare **three coffee roasters** on price and lead time. |
| **3-Way match** | Reconcile **PO vs receipt vs invoice** (procurement control). | Finance catches an invoice for **100** when only **80** were received. |
| **Vendor returns (RTV)** | Ship goods back to vendors; inventory reduces accordingly. | Wrong **batch** delivered — return **5 cases** and trace in movements. |
| **Recipes** | Define consumption per sold menu item / variant. | **Margherita pizza** → dough ball + sauce + cheese lines. |
| **Inventory** (hub) | Balances, movements, low stock, transfers, POS policy card, adjustments. | Daily control tower for **stock on hand** and **exceptions**. |
| **Customer returns** | Workflow for customer-facing returns affecting stock where applicable. | Guest returns sealed **bottle of wine** — restock or waste per policy. |
| **Menu availability** | Relates sellable menu to **what stock can support** (with POS policy). | Hide **“Lobster roll”** when **lobster** ingredient is below safety stock. |
| **Inventory analytics** | Reports: valuation, slow-moving, forecast, waste, price history (several need **cost read** permission). | Identify **slow movers** to drop from menu; **waste %** by week. |
| **Barcode lookup** | Resolve a scanned code to an ingredient / context for ops. | New staff scans a **case barcode** during receiving troubleshooting. |
| **Stock take** | Physical count sessions vs system snapshot; reconcile variance. | Monthly **full freezer count** — system posts corrections from differences. |
| **Warehouse** | Locations, zones, bins — physical structure of stock. | **“Cold room, shelf B, bin 3”** for traceability. |
| **Serial tracker** | For **serial-tracked** ingredients — track individual unit IDs through their lifecycle. | **High-end equipment** or regulated items where each serial must be auditable. |

---

## Permissions (who can see what)

Typical permission keys used in the UI:

- **`backoffice.inventory.read`** — View inventory hub, lists, movements, most reports UI.
- **`backoffice.inventory.write`** — Post adjustments, transfers, returns, stock-take outcomes, GRN confirmations, etc.
- **`backoffice.inventory.cost.read`** — Valuation, waste analytics, price history, forecast — anything dollar-sensitive beyond raw quantities.

**Real-life:** Floor supervisors see **quantities**; only **finance** gets **cost.read** for margin reports.

---

## APIs you will see in the network tab (inventory route)

Mounted under inventory (see `inventoryRoute.js`), including:

- **`GET /low-stock`**, **`GET /report`**, **`GET /balances`**, **`GET /movements`**
- **`GET /pos-policy`**, **`GET /menu-availability`**
- **`GET /scan/:barcode`**
- **Reports / analytics:** `/report/valuation`, `/report/slow-moving`, `/forecast`, `/analytics/waste`, `/analytics/price-history`
- **Writes:** **`POST /adjust`**, **`POST /returns`**, **`POST /transfer`**, **`POST /bootstrap-balances`**, **`PATCH /balances/planning`**, **`POST /alerts/run`**

These align with the dashboard cards and exports (CSV) you see in the **Inventory** and **Analytics** clients.

---

## End-to-end story (puts it all together)

**Scenario:** Weekend brunch rush.

1. **Friday:** You create a **PO** for eggs and receive them via **GRN** — stock **receives**, **cost layers** capture unit cost, **movements** show `receive`.
2. **Recipes** say each **eggs benedict** uses **2 eggs** and **30 g hollandaise base**.
3. **POS policy** is **kitchen send**: as tickets hit the pass, **order_deduction** movements reduce **StockBalance** at **kitchen** location.
4. **Low stock** alerts when **eggs** cross **reorderThreshold**; you raise a quick **PO**.
5. **Sunday night stock take** in the walk-in finds a **10% variance** on cheese — you post a **correction** or **waste** movement with a note.
6. **Monday:** **Inventory analytics → waste** shows spike in **hollandaise** — you train prep to batch smaller portions.

That is the loop: **master data → procurement → locations → sales consumption → physical truth → analytics**.

---

## If you read nothing else

- **Ingredients + recipes** define **theoretical usage**.
- **Stock balances + movements** define **actual usage and traceability**.
- **POS policy** defines **when selling hits stock**.
- **Procurement + GRN** defines **how buying becomes on-hand stock**.
- **Stock take + adjustments** keep the system aligned with **physical reality**.

For implementation details, start with `apps/pos-backend/services/inventoryService.js`, `stockBalanceModel.js`, `stockMovementModel.js`, and the **Inventory** dashboard component under `apps/pos-frontend2/src/app/(main)/dashboard/inventory/`.
