#!/usr/bin/env node
/**
 * Master runner: fake TCP printers + Mongo seed + routing / mixed / stress + Web Bluetooth mock smoke.
 * Cross-platform (use this entry on Windows); run-tests.sh wraps the same script for bash users.
 */

const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "../../apps/pos-backend/.env"),
});

process.env.PRINTER_MODE = "fake";
process.env.FAKE_PRINTER_HOST = process.env.FAKE_PRINTER_HOST || "127.0.0.1";
process.env.FAKE_PRINTER_PORTS =
  process.env.FAKE_PRINTER_PORTS ||
  require("./lib/tcp-printer-cluster").defaultPortMapJson();

const capture = {
  bluetoothJobs: [],
  /**
   * @param {import('mongoose').Document} job
   */
  async onBluetoothPrint(job) {
    const o = typeof job.toObject === "function" ? job.toObject() : job;
    this.bluetoothJobs.push({
      printerName: o.printer && o.printer.name,
      ticketData: JSON.parse(JSON.stringify(o.ticketData || {})),
    });
  },
};
global.__FAKE_PRINTER_CAPTURE__ = capture;

const mongoose = require("mongoose");
const config = require("../../apps/pos-backend/config/config");
const {
  createTcpPrinterCluster,
  DEFAULT_LAN_PRINTERS,
} = require("./lib/tcp-printer-cluster");
const { seedRoutingFixture } = require("./lib/db-fixture");
const { runRoutingValidator } = require("./routing-validator");
const { runMixedOrderTest } = require("./mixed-order-test");
const { runStressTest } = require("./stress-test");
const {
  installWebBluetoothMock,
  uninstallWebBluetoothMock,
  getBluetoothMockLog,
  clearBluetoothMockLog,
} = require("./bluetooth-mock");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBluetoothMockSmoke() {
  // eslint-disable-next-line no-console
  console.log("\n════════ Web Bluetooth mock (10 writes, failRate=0) ════════\n");
  clearBluetoothMockLog();
  const { getWrites, clearWrites } = installWebBluetoothMock({ failRate: 0 });
  const nav = globalThis.navigator || global.navigator;
  const dev = await nav.bluetooth.requestDevice({ filters: [] });
  await dev.gatt.connect();
  const svc = await dev.gatt.getPrimaryService("49535343-fe7d-4ae5-8fa9-9fafd205e455");
  const ch = await svc.getCharacteristic("49535343-8841-43f4-a8d4-ecbe34729bb3");
  const sample = Buffer.from("STATION ORDER\n2 x MockCola\n", "utf8");
  for (let i = 0; i < 10; i += 1) {
    await ch.writeValue(sample);
  }
  // eslint-disable-next-line no-console
  console.log(`Captured writes: ${getWrites().length}`);
  const tail = getBluetoothMockLog().filter((e) => e.kind === "done").length;
  clearWrites();
  uninstallWebBluetoothMock();
  // eslint-disable-next-line no-console
  console.log(`BT mock "done" events: ${tail}`);
}

async function main() {
  const host = process.env.FAKE_PRINTER_HOST || "127.0.0.1";
  const cluster = createTcpPrinterCluster(
    DEFAULT_LAN_PRINTERS.map((p) => ({ ...p, host })),
  );
  await sleep(250);

  let ctx = null;
  try {
    await mongoose.connect(config.databaseURI);
    // eslint-disable-next-line no-console
    console.log("Connected MongoDB for fake printer suite.");

    ctx = await seedRoutingFixture(mongoose, {
      runId: `suite_${Date.now()}`,
    });

    await runRoutingValidator({ cluster, ctx, capture });
    await runMixedOrderTest({ cluster, ctx, capture });
    await runStressTest({ cluster, ctx });

    await runBluetoothMockSmoke();
  } finally {
    if (ctx && typeof ctx.cleanup === "function") {
      await ctx.cleanup();
    }
    await cluster.stop().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }

  // eslint-disable-next-line no-console
  console.log("\nAll fake printer suite checks completed successfully.\n");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
