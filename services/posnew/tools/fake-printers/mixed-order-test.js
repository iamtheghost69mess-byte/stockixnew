/**
 * Mixed multi-category order: split kitchen tickets + full receipt on Receipt printer.
 */

const path = require("path");
const mongoose = require("mongoose");

const { buildPopulatedLinesFromSpecs } = require("./lib/db-fixture");
const { escPosToReadable } = require("./lib/escpos-utils");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadOrderPrinting() {
  return require(path.join(
    __dirname,
    "../../apps/pos-backend/services/orderPrinting",
  ));
}

function includesLoose(text, needle) {
  return String(text).toLowerCase().includes(String(needle).toLowerCase());
}

/**
 * @param {{ cluster: any, ctx: any, capture: { bluetoothJobs: any[] } }} args
 */
async function runMixedOrderTest({ cluster, ctx, capture }) {
  const { printTicketsForLines, printCustomerReceipt } = loadOrderPrinting();
  cluster.reset();
  capture.bluetoothJobs.length = 0;

  const specs = [
    { item: "Burger", qty: 2 },
    { item: "Beer", qty: 3 },
    { item: "Grilled Fish", qty: 1 },
    { item: "Water", qty: 2 },
  ];
  const lines = buildPopulatedLinesFromSpecs(
    ctx.menuByName,
    ctx.catByName,
    ctx.printerByName,
    specs,
  );

  const orderStub = {
    _id: new mongoose.Types.ObjectId(),
    organization: ctx.orgId,
    location: ctx.locationId,
    table: { tableNo: ctx.tableNo },
  };

  const kitchenRes = await printTicketsForLines(orderStub, lines, "order");
  await sleep(450);
  if (!kitchenRes.results.every((r) => r.ok)) {
    throw new Error(`Mixed kitchen dispatch failed: ${JSON.stringify(kitchenRes.results)}`);
  }

  const receiptPrinter = ctx.printerByName.Receipt;
  const bills = {
    total: 2 * 12.99 + 3 * 5 + 1 * 18 + 2 * 1.5,
    tax: 0,
    totalWithTax: 2 * 12.99 + 3 * 5 + 1 * 18 + 2 * 1.5,
  };
  const populatedOrder = {
    _id: orderStub._id,
    organization: ctx.orgId,
    location: ctx.locationId,
    table: { tableNo: ctx.tableNo },
    orderStatus: "paid",
    paymentMethod: "cash",
    bills: {
      total: Math.round(bills.total * 100) / 100,
      tax: 0,
      totalWithTax: Math.round(bills.totalWithTax * 100) / 100,
    },
    items: lines.map((ln) => {
      const name = ln.menuItem.name;
      const unit = Number(ctx.menuByName[name]?.price || 0);
      const qty = Number(ln.quantity) || 1;
      return {
        quantity: qty,
        price: Math.round(unit * qty * 100) / 100,
        name,
        note: ln.note,
        menuItem: { name },
      };
    }),
  };

  const receiptRes = await printCustomerReceipt(receiptPrinter, populatedOrder);
  await sleep(450);
  if (!receiptRes.results.some((r) => r.ok)) {
    throw new Error(`Receipt print failed: ${JSON.stringify(receiptRes.results)}`);
  }

  // eslint-disable-next-line no-console
  console.log("\n════════ MIXED ORDER — per-station previews ════════\n");

  const checks = [
    { printer: "Kitchen", must: ["Burger"], mustNot: ["Beer", "Grilled Fish", "Water"] },
    { printer: "Bar", must: ["Beer"], mustNot: ["Burger", "Water"] },
    { printer: "Grill", must: ["Grilled Fish"], mustNot: ["Beer", "Burger"] },
  ];

  for (const c of checks) {
    const jobs = cluster.getJobs(c.printer);
    const last = jobs[jobs.length - 1];
    const text = last ? last.readable : "";
    // eslint-disable-next-line no-console
    console.log(`--- ${c.printer} (TCP) ---\n${escPosToReadable(last?.buffer || Buffer.alloc(0)).trim() || "(empty)"}\n`);
    for (const m of c.must) {
      if (!includesLoose(text, m)) {
        throw new Error(`Mixed order: ${c.printer} missing "${m}"`);
      }
    }
    for (const x of c.mustNot) {
      if (includesLoose(text, x)) {
        throw new Error(`Mixed order: ${c.printer} must not include "${x}"`);
      }
    }
  }

  const bt = capture.bluetoothJobs[capture.bluetoothJobs.length - 1];
  const btItems = (bt && bt.ticketData && bt.ticketData.items) || [];
  // eslint-disable-next-line no-console
  console.log("--- Drinks (Bluetooth capture) ---\n", JSON.stringify(btItems, null, 2), "\n");
  if (!btItems.some((it) => includesLoose(it.name, "Water"))) {
    throw new Error("Mixed order: Bluetooth ticket missing Water");
  }

  const rJobs = cluster.getJobs("Receipt");
  const rLast = rJobs[rJobs.length - 1];
  const rText = rLast ? rLast.readable : "";
  // eslint-disable-next-line no-console
  console.log("--- Receipt (TCP, full check) ---\n", (rText || "").trim(), "\n");
  for (const name of ["Burger", "Beer", "Grilled Fish", "Water"]) {
    if (!includesLoose(rText, name)) {
      throw new Error(`Receipt ticket missing line for ${name}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log("Mixed order test: PASSED\n");
}

module.exports = {
  runMixedOrderTest,
};
