# How Inventory Works Here (Operational View)

This is the real behavior of the current codebase, explained as day-to-day workflow (not API listing).

## Core idea

Inventory is tracked as a live ledger with 3 layers working together:

- `StockBalance`: current on-hand per `location x ingredient` (plus `reservedQty` and `incomingQty`).
- `StockMovement`: immutable movement history (in/out, why, cost, lot, user, location).
- Cost/Lot layers: valuation and lot-based consumption for FIFO/LIFO/weighted/standard methods.

So the app does not only store a single stock number. It stores:

- current state (`StockBalance`)
- historical truth (`StockMovement`)
- valuation truth (cost layers / lots)

## What each inventory object stands for

### Ingredient

Raw stock item (tomato, cheese, flour, etc.) with:

- stock unit (`unit`)
- thresholds (`reorderThreshold`, `reorderQuantity`)
- cost anchors (`unitCost`, `averageUnitCost`)
- optional serial tracking / shelf-life behavior

This is the atomic thing inventory moves in and out.

### Menu Item inventory mode

Each menu item has `inventoryImpact`:

- `stockable`: normal deduction from ingredient demand (recipe / finished-goods ingredient)
- `consumable`: currently treated as "do not reduce stock" in deduction flow
- `service`: no stock effect

### Recipe / demand

For stockable items, demand is computed from:

- direct ingredient lines
- or nested sub-recipes
- or `finishedGoodsIngredient` shortcut (one sold unit deducts one finished ingredient unit)

So "1 burger" can consume bun + patty + sauce, and sauce can consume oil + spices if nested.

### StockBalance

Per location+ingredient live quantities:

- `quantity`: on-hand
- `reservedQty`: soft-held for active demand/planning
- `incomingQty`: expected from confirmed POs not fully received yet

`ingredient.currentStock` is synchronized as sum of balances.

### StockMovement

Every stock change writes movement rows with:

- signed `delta` (+in / -out)
- reason (`receive`, `order_deduction`, `waste`, `correction`, `transfer_*`, etc.)
- post-balance snapshot (`balanceAfter`)
- cost (`costAmount`, `extendedValue`)
- lot metadata, location, user, linkage fields

This is your audit trail and reporting source.

### Purchase Order (PO)

Procurement intent:

- what to buy
- where to receive
- expected quantity/cost

When PO is confirmed, it increases `incomingQty` (planned inbound), not on-hand yet.

### GRN (Goods Receipt Note)

Physical receiving event.

When GRN is confirmed:

- on-hand (`quantity`) increases
- `incomingQty` decreases
- cost layers/lots are created
- movement `reason=receive` is posted
- PO line `quantityReceived` is advanced
- accounting GRNI accrual is attempted

### Stock Take Session

Physical count reconciliation:

- system qty snapshot vs counted qty
- variance is posted as `reason=correction`
- stock balances are corrected
- optional approval flow (`awaiting_approval`)
- accounting journal for variance can be posted

## Real-time operational flows

## 1) Replenishment flow (what happens when you buy stock)

Example:

- You create PO: 100 kg flour for Branch A at $0.90/kg.
- Confirm PO.
- System marks `incomingQty +100` for flour in Branch A.
- Nothing added to on-hand yet.
- Truck arrives with 92 kg; receiver confirms GRN.
- System posts:
  - `StockBalance.quantity +92`
  - `StockBalance.incomingQty -92`
  - `StockMovement(reason=receive, delta=+92)`
  - cost/lot entries for valuation and expiry tracking

Meaning:

- availability increases only when physically received (GRN confirm), not when PO is created.

## 2) Selling flow (what happens when POS sells)

Example:

- Customer buys 3 burgers.
- Burger recipe says each burger needs:
  - 1 bun
  - 150g beef patty
  - 20g sauce
- Demand is calculated for 3 units.
- Deduction runs based on org policy (`stockDeductTrigger`):
  - at kitchen send, or
  - at payment
- System writes negative stock movements per ingredient and updates stock balances.

If strict oversell is enabled:

- system blocks sale if available stock (qty - reserved) cannot satisfy demand.

If line/order is voided/cancelled after deduction:

- reversal logic restores stock and posts reversal movements.

## 3) Transfer flow (branch/warehouse rebalancing)

Example:

- Move 20 kg sugar from Warehouse -> Branch B.
- System posts two linked movements:
  - `transfer_out -20` at source
  - `transfer_in +20` at destination
- Both rows share one transfer group id for traceability.

Total org stock does not change, only location distribution.

## 4) Adjustment flow (manual corrections, waste, emergency receives)

Example:

- Found 4 kg spoiled chicken.
- Post adjustment with `reason=waste`, delta `-4`.
- System updates on-hand, posts movement with waste metadata, and applies valuation impact.

Example:

- Emergency supplier drop-off without PO:
- Post `reason=receive`, delta `+10`, unit cost.
- System adds stock and cost layer directly.

## 5) Stock take flow (physical audit)

Example:

- System says olive oil is 50L in branch.
- Team counts 46L.
- Post stock-take session:
  - variance `-4`
  - movement `reason=correction`
  - stock balance corrected
  - optional accounting entry for variance impact

Blind count mode can hide expected system qty from counters to avoid bias.

## 6) Menu availability flow (can we sell this item now?)

For each sellable stockable item, system calculates ingredient demand for 1 serving, then computes possible portions from available stock at location.

Example:

- Pizza needs 0.2kg dough and 0.1kg cheese.
- Available: dough 5kg, cheese 1kg.
- Portions = min(5/0.2, 1/0.1) = min(25, 10) = 10.
- Item remains sellable for ~10 portions.

This is recipe-aware 86 behavior.

## What is intentional policy vs configurable

- Deduction timing is policy-driven (`kitchen send` vs `payment`).
- Oversell blocking is policy-driven (`strictOversell`).
- Cost method is configurable (weighted average / FIFO / LIFO / standard).

So behavior can differ by tenant settings even with same code.

## What looks inconsistent or risky right now

These are based on current code behavior, not assumptions:

1. `consumable` comment vs runtime behavior mismatch  
   - Model comment says consumable should "deduct usage for reporting but do not reduce on-hand".  
   - Deduction flow currently marks line as deducted and returns without posting a movement.  
   - Result: no usage ledger for consumables unless handled elsewhere.

2. `customer_return` reason looks incompatible with movement reason enum  
   - Customer return flow posts movement with `reason: "customer_return"`.  
   - `StockMovement` enum currently does not include `"customer_return"` (it has `vendor_return`, `receive`, etc.).  
   - If unchanged in runtime schema, this can fail validation when posting customer returns.

3. Parallel stock authority still includes legacy mirror  
   - `ingredient.currentStock` is maintained as aggregate mirror of balances.  
   - It works, but it is a duplicated source that must stay synchronized.

## Practical reading of the system

If you want to reason about "why stock is X", read in this order:

1. `StockBalance` row for location+ingredient (current state)
2. latest `StockMovement` rows (what changed it)
3. related transaction source:
   - order / stock take / GRN / transfer / adjustment
4. lot & cost layers (why value differs from raw quantity)

That sequence gives you operational truth fast during incidents.
