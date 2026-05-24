# Fake printer test suite

End-to-end exercises for **category → printer** routing using the real backend pipeline (`printTicketsForLines`, `printCustomerReceipt`, `printDispatchService`) against **TCP simulators** on `localhost` and **captured Bluetooth** print jobs (no physical hardware).

## Prerequisites

- MongoDB reachable via `DATABASE_URI` / `MONGODB_URI` in `apps/pos-backend/.env` (same as normal backend).
- Ports **9100–9103** free on `127.0.0.1` (Kitchen, Bar, Grill, Receipt simulators).

## How it works

1. **`PRINTER_MODE=fake`** turns on:
   - [`fakePrinterRedirect.js`](../../apps/pos-backend/services/fakePrinterRedirect.js) — rewrites TCP targets to `FAKE_PRINTER_HOST` + per-printer port from **`FAKE_PRINTER_PORTS`** (JSON map by printer `name`).
   - [`printDispatchService.js`](../../apps/pos-backend/services/printDispatchService.js) — skips Socket.IO and records Bluetooth jobs on `global.__FAKE_PRINTER_CAPTURE__` (installed by the runner).

2. **TCP simulators** (`lib/tcp-printer-cluster.js`) accept raw ESC/POS, strip control codes for a readable preview, log a per-job summary, and keep jobs in memory for assertions.

3. **Tests** seed a disposable org (printers, categories, menu items) and call the **same** `orderPrinting` code paths used in production.

## Commands

From monorepo root:

```bash
# Cross-platform (recommended)
npm run test:printers

# Bash wrapper (sets PRINTER_MODE if unset)
bash tools/fake-printers/run-tests.sh
```

### Standalone TCP simulators (manual / debugging)

```bash
node tools/fake-printers/server.js
```

Point real backend printers (with `PRINTER_MODE=fake` and `FAKE_PRINTER_PORTS`) at these ports while exercising the POS.

### Individual scripts (after exporting env)

```bash
export PRINTER_MODE=fake
export FAKE_PRINTER_PORTS='{"Kitchen":9100,"Bar":9101,"Grill":9102,"Receipt":9103}'
export FAKE_PRINTER_HOST=127.0.0.1
# Start TCP simulators in another terminal: node tools/fake-printers/server.js
node -e "require('./tools/fake-printers/routing-validator')"  # not wired as CLI; use run-all.js
```

Use **`node tools/fake-printers/run-all.js`** for the full flow.

### Deterministic stress seed

```bash
STRESS_SEED=7 npm run test:printers
```

## Layout

| File | Role |
|------|------|
| `server.js` | Long-running TCP fake printers (CLI). |
| `lib/tcp-printer-cluster.js` | Programmatic TCP cluster + job capture. |
| `lib/escpos-utils.js` | ESC/POS → readable text + box drawing. |
| `lib/db-fixture.js` | Mongo seed + synthetic populated order lines. |
| `routing-validator.js` | Per-category routing + receipt TCP probe. |
| `mixed-order-test.js` | Multi-category split + receipt totals. |
| `stress-test.js` | 50 concurrent `printTicketsForLines` + leak detection. |
| `bluetooth-mock.js` | `navigator.bluetooth` mock for Jest/Electron. |
| `run-all.js` | Single-process orchestration. |
| `run-tests.sh` | Bash entry → `run-all.js`. |

## Web Bluetooth mock (frontend / Jest)

```javascript
const { installWebBluetoothMock, uninstallWebBluetoothMock } = require("../../tools/fake-printers/bluetooth-mock");
beforeAll(() => installWebBluetoothMock({ failRate: 0 }));
afterAll(() => uninstallWebBluetoothMock());
```

Use **`failRate: 0.1`** to simulate intermittent pairing failures.

## Notes

- **USB** print jobs are not covered here (BullMQ worker + Redis). The suite uses **network** and **bluetooth** printers only.
- Bluetooth **capture** requires `PRINTER_MODE=fake` so the backend does not require a running Socket.IO terminal.
