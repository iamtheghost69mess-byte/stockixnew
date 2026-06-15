# Offline inventory (POS)

## Stock mirror (best-effort)

When the POS terminal is online, `GET /api/inventory/menu-availability` is persisted to IndexedDB (`pos-offline-db` → `stock_snapshot`) via [`offline-stock-mirror.ts`](../apps/pos-frontend2/src/lib/offline-stock-mirror.ts).

While offline:

- Strict oversell uses the last snapshot plus an in-memory portion ledger (per menu item) updated as items are added to the cart.
- If strict oversell is enabled and no snapshot exists, the table session shows a warning and blocks add/send.

## Sync

- Offline mutations (orders, payments, `inventory_adjust`) flush in [`pos-check-sync.ts`](../apps/pos-frontend2/src/lib/pos-check-sync.ts).
- The server still runs `assertOrderLinesFulfillable` on replay. If stock changed on another till while offline, flush fails with a stock conflict toast; the mutation is kept for manual resolution.
- After a successful flush, the stock snapshot is refreshed when online.

## Stock take and serials

Serial-tracked ingredients cannot post variance from stock take. Use Inventory → Adjust with serial numbers. The stock-take detail UI blocks finalize when a serial line has variance.
