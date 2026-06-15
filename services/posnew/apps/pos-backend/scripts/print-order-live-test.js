/**
 * Live print pipeline test (end-to-end through real print paths).
 *
 * What it does:
 * 1) Loads selected printers.
 * 2) Creates temporary categories/menu items assigned to those printers.
 * 3) Creates a temporary order with those items.
 * 4) Calls printTicketsForLines() to execute actual print dispatch logic.
 * 5) Polls PrintJob status for usb/bluetooth jobs and reports outcomes.
 * 6) Cleans temporary data unless --keep-data is provided.
 *
 * Usage examples:
 *   node scripts/print-order-live-test.js --printer-ids=<id1,id2>
 *   node scripts/print-order-live-test.js --printer-ids=<id1> --strict
 *   node scripts/print-order-live-test.js --printer-ids=<id1,id2> --keep-data
 */
require("dotenv").config();

const mongoose = require("mongoose");
const config = require("../config/config");
const Printer = require("../models/printerModel");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const Order = require("../models/orderModel");
const PrintJob = require("../models/printJobModel");
const { printTicketsForLines } = require("../services/orderPrinting");

function parseArgs(argv) {
  const out = {
    printerIds: [],
    strict: false,
    keepData: false,
    kind: "order",
    timeoutMs: 30000,
    help: false,
  };
  for (const token of argv.slice(2)) {
    if (token === "--help" || token === "-h") {
      out.help = true;
    } else
    if (token.startsWith("--printer-ids=")) {
      out.printerIds = token
        .split("=")[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (token === "--strict") {
      out.strict = true;
    } else if (token === "--keep-data") {
      out.keepData = true;
    } else if (token.startsWith("--kind=")) {
      const kind = token.split("=")[1].trim();
      if (kind === "order" || kind === "cancel") out.kind = kind;
    } else if (token.startsWith("--timeout-ms=")) {
      const n = Number(token.split("=")[1]);
      if (Number.isFinite(n) && n > 0) out.timeoutMs = n;
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fmtPrinter(pr) {
  const target =
    pr.type === "network"
      ? `${pr.ipAddress || "?"}:${pr.port || 9100}`
      : pr.type === "epson-epos"
      ? pr.eposUrl || "?"
      : pr.type === "usb"
      ? `${pr.usbVendorId || "?"}:${pr.usbProductId || "?"}`
      : pr.bluetoothAddress || "terminal-managed";
  return `${pr.name} (${pr.type}) target=${target}`;
}

async function waitForPrintJobs(orderId, timeoutMs) {
  const startedAt = Date.now();
  let snapshot = [];
  while (Date.now() - startedAt < timeoutMs) {
    snapshot = await PrintJob.find({ order: orderId }).populate("printer").sort({ createdAt: 1 }).lean();
    if (!snapshot.length) {
      await sleep(1500);
      continue;
    }
    const unfinished = snapshot.filter((j) => !["done", "failed"].includes(String(j.status || "")));
    if (!unfinished.length) break;
    await sleep(2000);
  }
  return snapshot;
}

async function run() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/print-order-live-test.js --printer-ids=<id1,id2,...> [options]

Options:
  --kind=order|cancel      Ticket kind to send (default: order)
  --timeout-ms=30000       Wait window for PrintJob status polling
  --strict                 Fails if any jobs remain pending at timeout
  --keep-data              Keep temporary test category/menu/order docs
  --help                   Show this help
`);
    return;
  }
  assert(args.printerIds.length > 0, "Provide --printer-ids=<id1,id2,...>");

  await mongoose.connect(config.databaseURI);
  console.log(`Connected DB: ${config.databaseURI}`);

  const printers = await Printer.find({ _id: { $in: args.printerIds } }).lean();
  assert(printers.length === args.printerIds.length, "One or more printer IDs were not found.");

  const orgIds = [...new Set(printers.map((p) => String(p.organization || "")))];
  assert(orgIds.length === 1, "All printers must belong to the same organization.");
  const orgId = printers[0].organization || null;

  console.log("Selected printers:");
  for (const pr of printers) {
    console.log(` - ${fmtPrinter(pr)}`);
  }

  const createdCategoryIds = [];
  const createdMenuItemIds = [];
  let createdOrderId = null;

  try {
    const suffix = `print_test_${Date.now()}`;

    for (const pr of printers) {
      const cat = await Category.create({
        organization: orgId,
        name: `TEMP ${pr.name} ${suffix}`,
        printerAssignment: pr._id,
      });
      createdCategoryIds.push(cat._id);
      const mi = await MenuItem.create({
        organization: orgId,
        name: `TEST ITEM ${pr.name}`,
        price: 1,
        category: cat._id,
        isAvailable: true,
      });
      createdMenuItemIds.push(mi._id);
    }

    const orderItems = createdMenuItemIds.map((menuItemId, idx) => ({
      menuItem: menuItemId,
      quantity: 1,
      name: `TEST ITEM ${idx + 1}`,
      pricePerQuantity: 1,
      price: 1,
      status: "pending",
    }));

    const order = await Order.create({
      organization: orgId,
      orderStatus: "pending",
      customerDetails: { name: "Printer Test", phone: "-", guests: 1 },
      items: orderItems,
      bills: { total: 1, tax: 0, totalWithTax: 1 },
      location: printers[0].location || null,
    });
    createdOrderId = order._id;

    const printerById = new Map(printers.map((p) => [String(p._id), p]));
    const lines = createdMenuItemIds.map((menuItemId, idx) => {
      const pr = printers[idx];
      return {
        _id: new mongoose.Types.ObjectId(),
        menuItem: {
          _id: menuItemId,
          name: `TEST ITEM ${idx + 1}`,
          category: {
            _id: createdCategoryIds[idx],
            printerAssignment: pr,
          },
        },
        quantity: 1,
        note: `live-test ${new Date().toISOString()}`,
        name: `TEST ITEM ${idx + 1}`,
        status: "pending",
      };
    });

    console.log(`Dispatching ${lines.length} line(s) as kind=${args.kind} ...`);
    const dispatchResult = await printTicketsForLines(order, lines, args.kind);
    console.log("Dispatch result:", JSON.stringify(dispatchResult, null, 2));

    const jobs = await waitForPrintJobs(order._id, args.timeoutMs);
    if (jobs.length) {
      console.log("PrintJob results:");
      for (const job of jobs) {
        console.log(
          ` - job=${job._id} printer=${job.printer?.name || job.printer} type=${job.printerType} status=${job.status} attempts=${job.attempts} error=${job.lastError || "-"}`
        );
      }
    } else {
      console.log("No PrintJob docs created (expected when only network/ePOS printers are tested).");
    }

    const failedDispatch = (dispatchResult.results || []).filter((r) => !r.ok);
    const failedJobs = jobs.filter((j) => String(j.status) === "failed");
    const pendingJobs = jobs.filter((j) => !["done", "failed"].includes(String(j.status)));

    if (failedDispatch.length) {
      console.log(`Dispatch failures: ${failedDispatch.length}`);
      for (const r of failedDispatch) {
        console.log(`   * ${r.printerName} -> ${r.error || "unknown error"}`);
      }
    }
    if (failedJobs.length) {
      console.log(`PrintJob failures: ${failedJobs.length}`);
    }
    if (pendingJobs.length) {
      console.log(`Timed out pending jobs: ${pendingJobs.length}`);
    }

    const hasFailure = failedDispatch.length > 0 || failedJobs.length > 0 || (args.strict && pendingJobs.length > 0);
    if (hasFailure) {
      throw new Error(
        `Live print test failed (dispatch=${failedDispatch.length}, jobsFailed=${failedJobs.length}, jobsPending=${pendingJobs.length}).`
      );
    }

    console.log("print-order-live-test: OK");
  } finally {
    if (!args.keepData) {
      if (createdOrderId) {
        await Order.deleteOne({ _id: createdOrderId });
        await PrintJob.deleteMany({ order: createdOrderId });
      }
      if (createdMenuItemIds.length) {
        await MenuItem.deleteMany({ _id: { $in: createdMenuItemIds } });
      }
      if (createdCategoryIds.length) {
        await Category.deleteMany({ _id: { $in: createdCategoryIds } });
      }
    } else {
      console.log("keep-data enabled: temporary documents were not deleted.");
    }
    await mongoose.disconnect();
  }
}

run().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
