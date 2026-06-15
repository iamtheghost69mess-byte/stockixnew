/**
 * Validates category → printer routing using the real `printTicketsForLines` implementation.
 * Requires PRINTER_MODE=fake, FAKE_PRINTER_PORTS, TCP cluster listening, and MongoDB.
 */

const path = require("path");
const mongoose = require("mongoose");

const { buildPopulatedLinesFromSpecs } = require("./lib/db-fixture");
const { escPosToReadable } = require("./lib/escpos-utils");

function loadOrderPrinting() {
  return require(path.join(
    __dirname,
    "../../apps/pos-backend/services/orderPrinting",
  ));
}

/**
 * @param {string} text
 * @param {string} needle
 */
function includesLoose(text, needle) {
  return String(text).toLowerCase().includes(String(needle).toLowerCase());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {{ getJobs: (name: string) => any[] }} cluster
 * @param {{ bluetoothJobs: any[] }} capture
 * @param {{ printerByName: Record<string, any>, menuByName: Record<string, any>, catByName: Record<string, any>, orgId: any, locationId: any, tableNo: number }} ctx
 */
async function runRoutingValidator({ cluster, ctx, capture }) {
  const { printTicketsForLines } = loadOrderPrinting();
  const results = [];

  const matrix = [
    { label: "Kitchen", item: "Burger", expectTcp: "Kitchen", forbid: ["Beer", "Water", "Grilled Fish"] },
    { label: "Bar", item: "Beer", expectTcp: "Bar", forbid: ["Burger", "Water"] },
    { label: "Grill", item: "Grilled Fish", expectTcp: "Grill", forbid: ["Beer", "Burger"] },
    { label: "Drinks", item: "Water", expectBt: true, forbid: [] },
  ];

  for (const row of matrix) {
    cluster.reset();
    capture.bluetoothJobs.length = 0;
    const lines = buildPopulatedLinesFromSpecs(
      ctx.menuByName,
      ctx.catByName,
      ctx.printerByName,
      [{ item: row.item, qty: 1 }],
    );
    const orderStub = {
      _id: new mongoose.Types.ObjectId(),
      organization: ctx.orgId,
      location: ctx.locationId,
      table: { tableNo: ctx.tableNo },
    };
    const dispatch = await printTicketsForLines(orderStub, lines, "order");
    await sleep(450);
    const ok = dispatch.results.every((r) => r.ok);
    if (!ok) {
      results.push({
        route: row.label,
        pass: false,
        detail: JSON.stringify(dispatch.results),
      });
      continue;
    }

    if (row.expectTcp) {
      const jobs = cluster.getJobs(row.expectTcp);
      const last = jobs[jobs.length - 1];
      const text = last ? last.readable : "";
      let pass = includesLoose(text, row.item);
      let leak = "";
      for (const f of row.forbid) {
        if (includesLoose(text, f)) {
          pass = false;
          leak = `unexpected "${f}"`;
          break;
        }
      }
      for (const pname of ["Kitchen", "Bar", "Grill", "Receipt"]) {
        if (pname === row.expectTcp) continue;
        const other = cluster.getJobs(pname);
        if (other.length > 0) {
          const otext = other[other.length - 1].readable || "";
          if (includesLoose(otext, row.item)) {
            pass = false;
            leak = `item appeared on ${pname} instead of/is also on ${row.expectTcp}`;
            break;
          }
        }
      }
      results.push({
        route: `${row.label} → ${row.expectTcp} Printer`,
        pass,
        detail: pass ? "" : leak || "missing item text on ticket",
      });
    }

    if (row.expectBt) {
      const j = capture.bluetoothJobs[capture.bluetoothJobs.length - 1];
      const items = (j && j.ticketData && j.ticketData.items) || [];
      const names = items.map((it) => String(it.name || ""));
      const pass =
        j &&
        String(j.printerName) === "Drinks" &&
        names.some((n) => includesLoose(n, row.item));
      results.push({
        route: `${row.label} → BT Printer`,
        pass,
        detail: pass ? "" : JSON.stringify({ j, names }),
      });
    }
  }

  {
    cluster.reset();
    const { printCustomerReceipt } = loadOrderPrinting();
    const receiptPrinter = ctx.printerByName.Receipt;
    const populatedOrder = {
      _id: new mongoose.Types.ObjectId(),
      organization: ctx.orgId,
      location: ctx.locationId,
      table: { tableNo: ctx.tableNo },
      orderStatus: "paid",
      paymentMethod: "card",
      bills: { total: 9.99, tax: 0, totalWithTax: 9.99 },
      items: [
        {
          quantity: 1,
          price: 9.99,
          name: "RoutingProbe",
          menuItem: { name: "RoutingProbe" },
        },
      ],
    };
    const r = await printCustomerReceipt(receiptPrinter, populatedOrder);
    await sleep(450);
    const pass = r.results.some((x) => x.ok);
    const jobs = cluster.getJobs("Receipt");
    const text = jobs[jobs.length - 1]?.readable || "";
    const hasProbe = includesLoose(text, "RoutingProbe");
    results.push({
      route: "Receipt → Receipt Printer",
      pass: pass && hasProbe,
      detail: pass && hasProbe ? "" : "receipt TCP missing probe line",
    });
  }

  printReport(results);
  const failed = results.filter((r) => !r.pass).length;
  if (failed) {
    throw new Error(`Routing validator: ${failed} failure(s)`);
  }
}

function printReport(results) {
  const w = 42;
  const top = `╔${"═".repeat(w)}╗`;
  const sep = `╠${"═".repeat(w)}╣`;
  const bot = `╚${"═".repeat(w)}╝`;
  // eslint-disable-next-line no-console
  console.log("\n" + top);
  // eslint-disable-next-line no-console
  console.log("║        PRINTER ROUTING TEST REPORT       ║");
  // eslint-disable-next-line no-console
  console.log(sep);
  for (const r of results) {
    const mark = r.pass ? "✅ PASS" : "❌ FAIL";
    const line = (`${r.route}`.padEnd(26) + mark).slice(0, w - 2);
    // eslint-disable-next-line no-console
    console.log("║ " + line.padEnd(w - 2) + " ║");
    if (!r.pass && r.detail) {
      // eslint-disable-next-line no-console
      console.log("║ " + String(r.detail).slice(0, w - 2).padEnd(w - 2) + " ║");
    }
  }
  // eslint-disable-next-line no-console
  console.log(sep);
  const ok = results.filter((r) => r.pass).length;
  // eslint-disable-next-line no-console
  console.log("║ " + `Result: ${ok}/${results.length} PASSED`.padEnd(w - 2) + " ║");
  // eslint-disable-next-line no-console
  console.log(bot + "\n");
}

module.exports = {
  runRoutingValidator,
  printReport,
};
