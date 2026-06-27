const path = require("path");
const { loadEnvIfDev } = require("../lib/load-env-if-dev");
loadEnvIfDev({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
const mongoose = require("mongoose");
const escpos = require("@node-escpos/core");
const USB = require("@node-escpos/usb-adapter");

const connectDB = require("../config/database");
const config = require("../config/config");
const { createWorker } = require("../services/jobQueue");
const PrintJob = require("../models/printJobModel");
const Order = require("../models/orderModel");
const Organization = require("../models/organizationModel");
const { printKitchenTicket } = require("../services/orderPrinting");
const {
  resolveOrganizationAccessState,
  logWorkerSkipDueToBlockedOrg,
} = require("../services/organizationAccessService");

function parseUsbId(v) {
  const raw = String(v || "").trim().toLowerCase().replace(/^0x/, "");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildTicketLines(ticketData) {
  const lines = Array.isArray(ticketData?.items) ? ticketData.items : [];
  return lines.map((it) => ({
    quantity: Number(it.qty) || 1,
    note: it.note || "",
    name: it.name || "Item",
    menuItem: { name: it.name || "Item" },
  }));
}

async function resolveOrderForJob(job) {
  if (!job.order) {
    return {
      _id: job.order || new mongoose.Types.ObjectId(),
      table: { tableNo: job.ticketData?.tableNumber || "?" },
    };
  }
  const order = await Order.findById(job.order).populate("table");
  if (order) return order;
  return {
    _id: job.order,
    table: { tableNo: job.ticketData?.tableNumber || "?" },
  };
}

async function writeUsbPayload(job) {
  const vendorId = parseUsbId(job.printer?.usbVendorId);
  const productId = parseUsbId(job.printer?.usbProductId);
  if (!vendorId || !productId) {
    throw new Error("USB vendor/product IDs are required for USB printers.");
  }
  if (!job.ticketPayload) {
    throw new Error("USB job has empty ticket payload.");
  }
  const payload = Buffer.from(job.ticketPayload, "base64");
  const device = new USB(vendorId, productId);
  const printer = new escpos.Printer(device);

  await new Promise((resolve, reject) => {
    device.open((openErr) => {
      if (openErr) return reject(openErr);
      printer.raw(payload, (writeErr) => {
        if (writeErr) return reject(writeErr);
        printer.close((closeErr) => {
          if (closeErr) return reject(closeErr);
          resolve();
        });
      });
    });
  });
}

async function processPrintJob(data) {
  const doc = await PrintJob.findById(data?.printJobId).populate("printer");
  if (!doc) return { ok: false, reason: "not_found" };
  const org = await Organization.findById(doc.org)
    .select("timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt")
    .lean();
  if (!org) return { ok: false, reason: "org_not_found" };
  const accessState = await resolveOrganizationAccessState(doc.org, org, {
    routeKey: "worker.print-jobs",
    useCache: true,
  });
  if (accessState.blocked) {
    await logWorkerSkipDueToBlockedOrg(doc.org, accessState, {
      workerName: "printWorker",
    });
    doc.status = "failed";
    doc.lastError = `Blocked organization: ${accessState.reason}`;
    await doc.save();
    return { ok: false, reason: "blocked_org" };
  }

  const jobLabel = `[print-jobs] printJobId=${String(doc._id)} printerId=${String(
    doc.printer?._id || ""
  )} type=${String(doc.printerType || "")} attempt=${Number(doc.attempts || 0) + 1}`;
  // eslint-disable-next-line no-console
  console.log(`${jobLabel} state=processing`);
  doc.attempts = Number(doc.attempts || 0) + 1;
  doc.status = "printing";
  await doc.save();

  try {
    const pType = String(doc.printerType || doc.printer?.type || "").toLowerCase();

    if (pType === "usb") {
      await writeUsbPayload(doc);
      doc.status = "done";
      doc.lastError = "";
      await doc.save();
      // eslint-disable-next-line no-console
      console.log(`${jobLabel} state=done`);
      return { ok: true, type: pType };
    }

    if (pType === "bluetooth") {
      doc.status = "pending";
      doc.lastError = "";
      await doc.save();
      // eslint-disable-next-line no-console
      console.log(`${jobLabel} state=deferred reason=api_dispatch_only`);
      return { ok: true, type: pType, skipped: "api_dispatch_only" };
    }

    const order = await resolveOrderForJob(doc);
    const lines = buildTicketLines(doc.ticketData);
    await printKitchenTicket(doc.printer, order, lines, "order");
    doc.status = "done";
    doc.lastError = "";
    await doc.save();
    // eslint-disable-next-line no-console
    console.log(`${jobLabel} state=done`);
    return { ok: true, type: pType || "network" };
  } catch (e) {
    doc.status = "failed";
    doc.lastError = e && e.message ? e.message : String(e);
    await doc.save();
    // eslint-disable-next-line no-console
    console.error(`${jobLabel} state=failed error=${doc.lastError}`);
    return { ok: false, error: doc.lastError };
  }
}

async function main() {
  if (!config.redisUrl) {
    // eslint-disable-next-line no-console
    console.error("REDIS_URL is required for print worker.");
    process.exit(1);
  }

  await connectDB();

  const worker = createWorker("print-jobs", processPrintJob, {
    concurrency: 5,
    settings: {
      backoffStrategy(attemptsMade, type) {
        if (type !== "printExp") return 0;
        if (attemptsMade <= 1) return 1000;
        if (attemptsMade === 2) return 5000;
        return 30000;
      },
    },
  });

  if (!worker) {
    console.error("[print-jobs] Worker not started — Redis unavailable or bullmq missing");
    process.exit(1);
  }

  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(`[print-jobs] completed job=${job.id}`);
  });
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[print-jobs] failed job=${job?.id || "?"}: ${err.message}`);
  });

  const shutdown = async () => {
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
