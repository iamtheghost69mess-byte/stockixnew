#!/usr/bin/env node
/**
 * Standalone fake LAN printers: listens on localhost ports and logs tickets.
 *
 * Usage:
 *   node tools/fake-printers/server.js
 *   FAKE_PRINTER_HOST=127.0.0.1 node tools/fake-printers/server.js
 *
 * Ports default: Kitchen 9100, Bar 9101, Grill 9102, Receipt 9103
 */

const { createTcpPrinterCluster, DEFAULT_LAN_PRINTERS } = require("./lib/tcp-printer-cluster");

function main() {
  const host = process.env.FAKE_PRINTER_HOST || "127.0.0.1";
  const printers = DEFAULT_LAN_PRINTERS.map((p) => ({ ...p, host }));
  // eslint-disable-next-line no-console
  console.log(`Fake printer TCP servers on ${host}:`);
  for (const p of printers) {
    // eslint-disable-next-line no-console
    console.log(`  - ${p.name} :${p.port}`);
  }
  createTcpPrinterCluster(printers);
  // eslint-disable-next-line no-console
  console.log("Listening (Ctrl+C to exit). Send ESC/POS from POS backend with PRINTER_MODE=fake.");
}

if (require.main === module) {
  main();
}

module.exports = { main };
