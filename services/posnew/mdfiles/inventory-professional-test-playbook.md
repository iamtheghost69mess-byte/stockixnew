# Professional Inventory Test Playbook

Use this after running:

`npm run seed:inventory:professional -- --force`

## Login users

- If target org is `dev-org`: use dev PINs (`1001`..`1006`).
- If target org is not `dev-org` (for example `montaser-pos-test`): use your existing SaaS Owner dashboard staff PINs.

## What was seeded

- Org: chosen by `--org=...` (defaults to `dev-org`)
- Locations: `MAIN` + `DEMO-WH2` (commissary cold store)
- Professional menu: 7 categories, 24 items
- Inventory operations scenario:
  - ingredient categories + ingredients + supplier links
  - warehouse zones/bins
  - stock balances at 2 locations
  - transfer (MAIN -> DEMO-WH2)
  - waste + customer return movement examples
  - PO draft + PO confirmed + GRN confirmed + GRN draft
  - stock take draft + in-progress
- Floor plan showcase tables (9100–9199 range)
- Accounting baseline + finance showcase

## Real-life test flow (recommended)

1) **Waiter POS smoke test**
- Login as waiter (PIN from your org's SaaS Owner dashboard)
- Open `/pos`
- Verify table list loads (no 403 on `/api/locations`)
- Open a table and place a sample order

2) **Inventory availability behavior**
- Open `/dashboard/inventory/menu-availability`
- Check stockable items have portion estimates
- Confirm unavailable menu item remains blocked

3) **Procurement flow**
- Open `/dashboard/purchase-orders`
- Find:
  - `DEMO-UI-PO-WEEKLY-DRAFT` (draft)
  - `DEMO-UI-PO-IMPORTED-OIL` (confirmed + GRN confirmed path)
  - `DEMO-UI-PO-TOMATO-PARTIAL` (partial receiving scenario)
- Open `/dashboard/goods-receipt-notes` and inspect linked GRNs

4) **Warehouse + location behavior**
- Open `/dashboard/warehouse`
- Verify zones and bins exist (receiving/cold/dry + archived)
- Verify inventory appears in both `MAIN` and `DEMO-WH2`

5) **Movement analytics**
- Open `/dashboard/inventory` and movement/analytics pages
- Confirm seeded movement reasons exist:
  - transfer in/out
  - receive
  - waste
  - customer return

6) **Stock take workflow**
- Open `/dashboard/inventory/stock-take`
- Verify one draft and one in-progress session are present
- Continue counts and post to test correction movements
- Serial-tracked line with variance: blocking banner, Finalize disabled, link to Inventory Adjust

7) **Offline inventory (POS)**
- Online: open a table session so menu availability snapshot is cached (IndexedDB `stock_snapshot`)
- Go offline: strict oversell blocks add when portions exhausted; banner if no snapshot
- Inventory hub: manual adjust while offline queues `inventory_adjust`; sync when online
- Reconnect: flush queue; stock conflict toast if server rejects oversold offline order

9) **Barcode lookup**
- Open `/dashboard/inventory/barcode-lookup`
- Scan/enter: `DEMO-UI-BC-SCAN-999`
- Verify mozzarella ingredient details appear

## Notes

- Re-run safely with `--force` to reset showcase rows.
- This dataset is designed for operational demos, not accounting reconciliation sign-off.
