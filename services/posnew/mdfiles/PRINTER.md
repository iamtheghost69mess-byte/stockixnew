# Printer stack (this monorepo)

## NPM packages

### `apps/pos-backend`

- `@node-escpos/core` — ESC/POS over USB (print worker)
- `@node-escpos/usb-adapter` — USB adapter for escpos
- `node-thermal-printer` — ESC/POS build + network / Epson ePOS HTTP

**Related infra:** `bullmq`, `ioredis` (USB job queue), `socket.io` (Bluetooth job push + acks)

### `apps/pos-frontend2`

- `@point-of-sale/receipt-printer-encoder` — ticket bytes for Web Bluetooth
- `socket.io-client` — `print:job` listener

### Root

- Scripts: `test:printer-phases`, `test:print:live` (delegate to backend)

---

## Key files

### Backend

| Area | Path |
|------|------|
| Routes | `apps/pos-backend/routes/printerRoute.js`, `routes/printJobRoute.js` |
| Controllers | `apps/pos-backend/controllers/printerController.js`, `controllers/printJobController.js` |
| Models | `apps/pos-backend/models/printerModel.js`, `models/printJobModel.js` |
| Ticket / dispatch | `apps/pos-backend/services/orderPrinting.js`, `services/printDispatchService.js` |
| USB worker | `apps/pos-backend/workers/printWorker.js` |
| Sockets (`printer:register`, `print:ack`) | `apps/pos-backend/app.js` |
| Reprint / POS print | `apps/pos-backend/routes/orderRoute.js` → `orderController.js` (`reprintOrderToPrinter`, `printOrderDocument`) |
| Category → printer | `apps/pos-backend/controllers/categoryController.js` |
| RBAC | `apps/pos-backend/constants/defaultRbacRoles.js`, `constants/permissionsCatalog.js` (`pos.printer.read`) |
| OpenAPI | `apps/pos-backend/openapi/tenant-pos-v1.yaml` (printers + reprint) |
| Live test | `apps/pos-backend/scripts/print-order-live-test.js` |
| Fake LAN + routing suite | `tools/fake-printers/` — `npm run test:printers` (MongoDB + `PRINTER_MODE=fake`) |
| Fake LAN + routing suite | `tools/fake-printers/` — `npm run test:printers` (requires MongoDB; sets `PRINTER_MODE=fake`) |
| CI script | `scripts/test-printer-phases.sh` |

### Frontend (`apps/pos-frontend2`)

- `src/lib/bluetooth-printer.ts` — Web Bluetooth + encoder
- `src/types/bluetooth-printing.d.ts`
- `src/hooks/usePrintJobListener.ts` — socket + pending jobs + ack
- `src/components/pos/pos-print-job-listener.tsx`
- `src/app/(main)/pos/layout.tsx` — mounts listener
- `src/lib/pos-printer-api.ts`, `src/lib/schemas/printer.ts`
- `src/app/(main)/dashboard/printers/page.tsx`
- `src/app/(main)/settings/bluetooth-printer/page.tsx`
- `src/lib/pos-order-api.ts` — `posPrintOrder`
- `src/app/(main)/pos/_hooks/use-pos-session.ts`, `_components/pos-table-session-page.tsx`
- `src/lib/pos-catalog-api.ts` — `printerAssignment`

---

## Preview

No dedicated on-screen thermal receipt preview. Closest: test print from Bluetooth settings; other `preview*` UI is unrelated (e.g. guest menu rows, invoice subtotals). `window.print()` on some dashboard pages is browser print, not ESC/POS.

---

## Route note

`posPrintOrder` posts **`POST /api/order/:id/print`** (legacy alias **`/api/orders/:id/print`**) with JSON `{ "type": "kitchen" | "receipt", "printerId"?: "..." }`. Kitchen omits `printerId` (runs `completeSubmitStationTickets`). Receipt requires `printerId`. Station-only reprints remain **`POST /:id/reprint/:printerId`**.
