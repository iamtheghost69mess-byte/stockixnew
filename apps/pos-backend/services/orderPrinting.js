const http = require("http");
const https = require("https");
const {
  ThermalPrinter,
  PrinterTypes,
  CharacterSet,
} = require("node-thermal-printer");
const MenuItem = require("../models/menuItemModel");
const PrintJob = require("../models/printJobModel");
const { addJob } = require("./jobQueue");
const { dispatchBluetoothPrintJob } = require("./printDispatchService");
const { applyFakeTcpIfNeeded } = require("./fakePrinterRedirect");
const Location = require("../models/locationModel");
const { modifierAdjustmentForLine } = require("../utils/orderTotals");

function round2Print(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Pre-tax line subtotal for receipt display: base (per menu or stored PPQ) plus modifier adjustments × qty.
 * Matches billing logic in `recalcOrderTotals` when `pricePerQuantity` is the base unit price.
 */
function customerReceiptLineSubtotal(line) {
  const qty = Math.max(1, Number(line.quantity) || 1);
  const modUnit = modifierAdjustmentForLine(line);
  if (String(line.itemType || "").toLowerCase() === "combo") {
    const unit =
      line.comboPrice != null && Number.isFinite(Number(line.comboPrice))
        ? Number(line.comboPrice)
        : line.pricePerQuantity != null && Number.isFinite(Number(line.pricePerQuantity))
          ? Number(line.pricePerQuantity)
          : null;
    if (unit != null) return round2Print(unit * qty);
  }
  if (line.pricePerQuantity != null && Number.isFinite(Number(line.pricePerQuantity))) {
    return round2Print((Number(line.pricePerQuantity) + modUnit) * qty);
  }
  const stored = Number(line.price);
  if (Number.isFinite(stored)) {
    return round2Print(stored + modUnit * qty);
  }
  return 0;
}

/** Interface stub so we can build ESC/POS with ThermalPrinter and read the buffer (e.g. ePOS HTTP). */
const NOOP_INTERFACE = {
  async execute() {},
  async isPrinterConnected() {
    return true;
  },
};

const DRIVER_MAP = {
  epson: PrinterTypes.EPSON,
  star: PrinterTypes.STAR,
  tanca: PrinterTypes.TANCA,
  daruma: PrinterTypes.DARUMA,
  brother: PrinterTypes.BROTHER,
  custom: PrinterTypes.CUSTOM,
};

function orderTableNo(order) {
  if (order.table && typeof order.table === "object" && order.table.tableNo != null) {
    return String(order.table.tableNo);
  }
  return "?";
}

function lineDisplayName(line) {
  const mi = line.menuItem;
  if (mi && typeof mi === "object") return mi.name || line.name || "Item";
  return line.name || "Item";
}

function lineModifierOptions(line) {
  if (!Array.isArray(line?.selectedModifiers)) return [];
  const rows = [];
  for (const group of line.selectedModifiers) {
    const options = Array.isArray(group?.selectedOptions) ? group.selectedOptions : [];
    for (const option of options) {
      const name = String(option?.name || "").trim();
      if (!name) continue;
      rows.push({
        name,
        priceAdjustment: Number(option?.priceAdjustment || 0),
      });
    }
  }
  return rows;
}

function lineComboComponents(line) {
  if (!Array.isArray(line?.selectedSlots)) return [];
  return line.selectedSlots
    .map((slot) => ({
      slotName: String(slot?.slotName || "").trim(),
      menuItemName: String(slot?.menuItemName || "").trim(),
    }))
    .filter((slot) => slot.slotName && slot.menuItemName);
}

function thermalTypeFromDoc(printerDoc) {
  const k = String(printerDoc.thermalDriver || "epson").toLowerCase();
  return DRIVER_MAP[k] || PrinterTypes.EPSON;
}

/**
 * group lines that have a resolved printer on category.printerAssignment
 * @returns {Map<string, { printer: object, lines: array }>}
 */
function groupLinesByPrinter(lines) {
  const map = new Map();
  for (const line of lines) {
    const mi = line.menuItem;
    if (!mi || typeof mi !== "object") continue;
    const cat = mi.category;
    if (!cat || typeof cat !== "object") continue;
    const pr = cat.printerAssignment;
    if (!pr || typeof pr !== "object" || !pr._id) continue;
    const pid = String(pr._id);
    if (!map.has(pid)) map.set(pid, { printer: pr, lines: [] });
    map.get(pid).lines.push(line);
  }
  return map;
}

function createThermalPrinter(printerDoc, networkOpts) {
  const type = thermalTypeFromDoc(printerDoc);
  const config = {
    type,
    width: 48,
    characterSet: CharacterSet.WPC1252,
    removeSpecialCharacters: false,
    lineCharacter: "-",
  };

  if (networkOpts.tcpUri) {
    config.interface = networkOpts.tcpUri;
    config.options = { timeout: networkOpts.timeout || 8000 };
  } else {
    config.interface = NOOP_INTERFACE;
  }

  return new ThermalPrinter(config);
}

function formatMoney(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return "0.00";
  return v.toFixed(2);
}

function lineDiscountAmount(line) {
  const raw = Number(line?.discount?.amount);
  if (Number.isFinite(raw) && raw > 0) return Number(raw.toFixed(2));
  return 0;
}

/**
 * Customer receipt (all order lines, totals from order.bills).
 * @param {*} tp node-thermal-printer instance
 */
function composeCustomerReceipt(tp, order, receiptContext = null) {
  const cfg = receiptContext?.receiptConfig || {};
  const showBranchName = cfg.showBranchName !== false;
  const showBranchAddress = cfg.showBranchAddress !== false;
  const showBranchPhone = cfg.showBranchPhone === true;
  const showTaxVatNumber = cfg.showTaxVatNumber === true;
  const headerLine1 = String(cfg.headerLine1 || "").trim();
  const headerLine2 = String(cfg.headerLine2 || "").trim();
  const footerLine = String(cfg.footerLine || "Thank you").trim() || "Thank you";
  const locationName = String(receiptContext?.name || "").trim();
  const locationAddress = String(receiptContext?.address || "").trim();
  const locationPhone = String(receiptContext?.phone || "").trim();
  const taxVatNumber = String(receiptContext?.taxVatNumber || "").trim();
  const bills = order.bills || {};
  const subtotal = formatMoney(bills.total);
  const tax = formatMoney(bills.tax);
  const serviceCharge = formatMoney(bills.serviceChargeAmount);
  const serviceChargeRate = Number(bills.serviceChargeRate) || 0;
  const manualDiscount = Number(order.manualDiscountAmount || 0);
  const loyaltyDiscount = Number(order.loyaltyDiscountAmount || 0);
  const totalDiscount = manualDiscount + loyaltyDiscount;
  const total = formatMoney(bills.totalWithTax);
  const payMethod = order.paymentMethod
    ? String(order.paymentMethod).trim()
    : "";
  const orderSt = String(order.orderStatus || "").toLowerCase();

  tp.clear();
  tp.initHardware();
  tp.alignCenter();
  tp.bold(true);
  tp.println("CUSTOMER RECEIPT");
  tp.bold(false);
  if (headerLine1) tp.println(headerLine1);
  if (headerLine2) tp.println(headerLine2);
  if (showBranchName && locationName) tp.println(locationName);
  if (showBranchAddress && locationAddress) tp.println(locationAddress);
  if (showBranchPhone && locationPhone) tp.println(`Phone: ${locationPhone}`);
  if (showTaxVatNumber && taxVatNumber) tp.println(`VAT: ${taxVatNumber}`);
  tp.setTextNormal();
  tp.newLine();
  tp.alignLeft();
  tp.drawLine();
  tp.println(`Order #${String(order._id).slice(-8)}`);
  tp.println(`Table: ${orderTableNo(order)}`);
  tp.println(
    `Time: ${new Date().toLocaleString("en-GB", { hour12: false })}`
  );
  tp.drawLine();
  for (const line of order.items || []) {
    const qty = Number(line.quantity) || 1;
    const name = lineDisplayName(line);
    const lineTotal = formatMoney(customerReceiptLineSubtotal(line));
    tp.bold(true);
    tp.println(`${qty} x ${name}`);
    tp.bold(false);
    tp.println(`   ${lineTotal}`);
    const lineDiscount = lineDiscountAmount(line);
    if (lineDiscount > 0) {
      tp.println(`   Discount: -${formatMoney(lineDiscount)}`);
    }
    for (const slot of lineComboComponents(line)) {
      tp.println(`   * ${slot.slotName}: ${slot.menuItemName}`);
    }
    const hideModifierPrices =
      line.pricePerQuantity != null && Number.isFinite(Number(line.pricePerQuantity));
    for (const option of lineModifierOptions(line)) {
      const adjNote =
        !hideModifierPrices && option.priceAdjustment !== 0
          ? ` (${option.priceAdjustment > 0 ? "+" : ""}${formatMoney(option.priceAdjustment)})`
          : "";
      tp.println(`   - ${option.name}${adjNote}`);
    }
    if (line.note) tp.println(`   Note: ${String(line.note)}`);
  }
  tp.drawLine();
  tp.println(`Subtotal: ${subtotal}`);
  tp.println(`Tax:      ${tax}`);
  const branchVatRate = Number(receiptContext?.vatRate);
  const showBranchVatOnReceipt = receiptContext?.receiptShowVAT !== false;
  if (
    showBranchVatOnReceipt &&
    Number.isFinite(branchVatRate) &&
    branchVatRate > 0
  ) {
    const inc = receiptContext?.vatInclusive ? "inclusive" : "exclusive";
    tp.println(`Branch VAT: ${branchVatRate}% (${inc})`);
  }
  if (Number(serviceCharge) > 0) {
    const rateNote = serviceChargeRate > 0 ? ` (${serviceChargeRate}%)` : "";
    tp.println(`Service${rateNote}: ${serviceCharge}`);
  }
  if (totalDiscount > 0) {
    tp.println(`Discount: -${formatMoney(totalDiscount)}`);
  }
  tp.bold(true);
  tp.println(`TOTAL:    ${total}`);
  tp.bold(false);
  if (payMethod && (orderSt === "paid" || orderSt === "cancelled")) {
    tp.println(`Payment:  ${payMethod}`);
  }
  tp.drawLine();
  tp.alignCenter();
  tp.println(footerLine);
  tp.println("— Restro POS —");
  tp.newLine();
  tp.partialCut();
}

function receiptTicketDataFrom(order, stationName) {
  return {
    kind: "receipt",
    items: (order.items || []).map((line) => ({
      name: lineDisplayName(line),
      qty: Number(line.quantity) || 1,
      note: line.note ? String(line.note) : "",
    })),
    tableNumber: orderTableNo(order),
    orderShortId: String(order._id).slice(-8),
    stationName: String(stationName || "Receipt"),
    totals: {
      subtotal: Number(order.bills?.total || 0),
      tax: Number(order.bills?.tax || 0),
      serviceCharge: Number(order.bills?.serviceChargeAmount || 0),
      total: Number(order.bills?.totalWithTax || 0),
    },
    timestamp: new Date().toISOString(),
  };
}

function composeKitchenTicket(tp, order, lines, kind, stationName) {
  tp.clear();
  tp.initHardware();
  tp.alignCenter();
  tp.setTextDoubleHeight();
  tp.bold(true);
  tp.println(kind === "cancel" ? "VOID / CANCELLED" : "STATION ORDER");
  tp.bold(false);
  tp.setTextNormal();
  tp.newLine();
  tp.alignLeft();
  tp.drawLine();
  tp.println(`Order #${String(order._id).slice(-8)}`);
  tp.println(`Table: ${orderTableNo(order)}`);
  tp.println(
    `Time: ${new Date().toLocaleString("en-GB", { hour12: false })}`
  );
  tp.println(`Station: ${stationName}`);
  tp.drawLine();
  for (const line of lines) {
    tp.bold(true);
    tp.println(`${line.quantity} x ${lineDisplayName(line)}`);
    tp.bold(false);
    for (const slot of lineComboComponents(line)) {
      tp.println(`   * ${slot.slotName}: ${slot.menuItemName}`);
    }
    for (const option of lineModifierOptions(line)) {
      tp.println(`   - ${option.name}`);
    }
    if (line.note) tp.println(`   Note: ${String(line.note)}`);
  }
  tp.drawLine();
  tp.alignCenter();
  tp.println("— Restro POS —");
  tp.newLine();
  tp.partialCut();
}

function ticketDataFrom(order, lines, stationName) {
  return {
    items: lines.map((line) => ({
      name: lineDisplayName(line),
      qty: Number(line.quantity) || 1,
      note: line.note ? String(line.note) : "",
    })),
    tableNumber: orderTableNo(order),
    orderShortId: String(order._id).slice(-8),
    stationName: String(stationName || "Station"),
    timestamp: new Date().toISOString(),
  };
}

function sendEposHttp(printer, buffer) {
  const urlStr = String(printer.eposUrl || "").trim();
  if (!urlStr) {
    return Promise.reject(new Error("eposUrl is required for epson-epos printers."));
  }
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    return Promise.reject(new Error("Invalid eposUrl."));
  }
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "POST",
        timeout: 8000,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": buffer.length,
        },
      },
      (res) => {
        res.resume();
        if (res.statusCode >= 400) {
          reject(new Error(`ePOS HTTP ${res.statusCode}`));
        } else {
          resolve();
        }
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("ePOS request timed out."));
    });
    req.write(buffer);
    req.end();
  });
}

/**
 * Build and send one station ticket using node-thermal-printer (ESC/POS).
 */
async function printKitchenTicket(printerDoc, order, lines, kind) {
  const stationName = String(printerDoc.name || "Station");
  const pType = printerDoc.type || "network";

  if (pType === "usb") {
    throw new Error("USB printers are not supported on this server build.");
  }

  if (pType === "epson-epos") {
    const tp = createThermalPrinter(printerDoc, {});
    composeKitchenTicket(tp, order, lines, kind, stationName);
    const buf = tp.getBuffer();
    if (!buf || !buf.length) {
      throw new Error("Empty print buffer.");
    }
    return sendEposHttp(printerDoc, buf);
  }

  let host = String(printerDoc.ipAddress || "").trim();
  let port = Number(printerDoc.port) || 9100;
  const redirected = applyFakeTcpIfNeeded(printerDoc, host, port);
  host = redirected.host;
  port = redirected.port;
  if (!host) {
    throw new Error("Printer IP address is required.");
  }

  const tp = createThermalPrinter(printerDoc, {
    tcpUri: `tcp://${host}:${port}`,
    timeout: 8000,
  });
  composeKitchenTicket(tp, order, lines, kind, stationName);
  await tp.execute();
}

/**
 * Print one customer receipt to a single printer (network, epson-epos, usb queue, or bluetooth dispatch).
 * @param {object} printerDoc Mongoose printer doc
 * @param {object} populatedOrder Order with items populated for lineDisplayName
 * @returns {Promise<{ stations: number, results: object[] }>}
 */
async function printCustomerReceipt(printerDoc, populatedOrder) {
  const results = [];
  const pType = String(printerDoc.type || "network").toLowerCase();
  const stationName = String(printerDoc.name || "Receipt");

  try {
    const locationContext =
      populatedOrder.location && String(populatedOrder.location).match(/^[a-fA-F0-9]{24}$/)
        ? await Location.findById(populatedOrder.location)
            .select(
              "name address phone taxVatNumber receiptConfig vatRate vatInclusive receiptShowVAT"
            )
            .lean()
        : null;
    if (pType === "usb" || pType === "bluetooth") {
      const tp = createThermalPrinter(printerDoc, {});
      composeCustomerReceipt(tp, populatedOrder, locationContext);
      const buf = tp.getBuffer();
      const payloadB64 =
        buf && buf.length ? Buffer.from(buf).toString("base64") : "";
      const orgId =
        (populatedOrder.organization &&
          populatedOrder.organization._id) ||
        populatedOrder.organization ||
        printerDoc.organization;
      const jobDoc = await PrintJob.create({
        org: orgId,
        location: populatedOrder.location || null,
        printer: printerDoc._id,
        order: populatedOrder._id || null,
        printerType: pType,
        ticketPayload: payloadB64,
        ticketData: receiptTicketDataFrom(populatedOrder, stationName),
        status: "pending",
      });
      if (pType === "usb") {
        const enq = await addJob(
          "print-jobs",
          "usb_dispatch",
          { printJobId: String(jobDoc._id) },
          {
            attempts: 3,
            backoff: { type: "printExp" },
          }
        );
        if (enq?.queued && enq.jobId != null) {
          jobDoc.queueJobId = String(enq.jobId);
          await jobDoc.save();
        }
      } else {
        await dispatchBluetoothPrintJob(String(jobDoc._id));
      }
      results.push({
        ok: true,
        printerId: String(printerDoc._id),
        printerName: printerDoc.name,
        jobId: String(jobDoc._id),
        queued: pType === "usb",
        dispatched: pType === "bluetooth",
      });
      return { stations: 1, results };
    }

    if (pType === "epson-epos") {
      const tp = createThermalPrinter(printerDoc, {});
      composeCustomerReceipt(tp, populatedOrder, locationContext);
      const buf = tp.getBuffer();
      if (!buf || !buf.length) {
        throw new Error("Empty print buffer.");
      }
      await sendEposHttp(printerDoc, buf);
      results.push({
        ok: true,
        printerId: String(printerDoc._id),
        printerName: printerDoc.name,
      });
      return { stations: 1, results };
    }

    let host = String(printerDoc.ipAddress || "").trim();
    let port = Number(printerDoc.port) || 9100;
    const redirectedReceipt = applyFakeTcpIfNeeded(printerDoc, host, port);
    host = redirectedReceipt.host;
    port = redirectedReceipt.port;
    if (!host) {
      throw new Error("Printer IP address is required.");
    }
    const tp = createThermalPrinter(printerDoc, {
      tcpUri: `tcp://${host}:${port}`,
      timeout: 8000,
    });
    composeCustomerReceipt(tp, populatedOrder, locationContext);
    await tp.execute();
    results.push({
      ok: true,
      printerId: String(printerDoc._id),
      printerName: printerDoc.name,
    });
    return { stations: 1, results };
  } catch (e) {
    results.push({
      ok: false,
      printerId: String(printerDoc._id),
      printerName: printerDoc.name,
      error: e.message || String(e),
    });
    return { stations: 0, results };
  }
}

async function printTicketsForLines(order, lines, kind) {
  const map = groupLinesByPrinter(lines);
  const results = [];
  for (const [, { printer, lines: ls }] of map) {
    try {
      const pType = String(printer.type || "network").toLowerCase();
      if (pType === "usb" || pType === "bluetooth") {
        const tp = createThermalPrinter(printer, {});
        const stationName = String(printer.name || "Station");
        composeKitchenTicket(tp, order, ls, kind, stationName);
        const buf = tp.getBuffer();
        const payloadB64 = buf && buf.length ? Buffer.from(buf).toString("base64") : "";
        const jobDoc = await PrintJob.create({
          org: order.organization || printer.organization,
          location: order.location || null,
          printer: printer._id,
          order: order._id || null,
          printerType: pType,
          ticketPayload: payloadB64,
          ticketData: ticketDataFrom(order, ls, stationName),
          status: "pending",
        });
        if (pType === "usb") {
          const enq = await addJob(
            "print-jobs",
            "usb_dispatch",
            { printJobId: String(jobDoc._id) },
            {
              attempts: 3,
              backoff: { type: "printExp" },
            }
          );
          if (enq?.queued && enq.jobId != null) {
            jobDoc.queueJobId = String(enq.jobId);
            await jobDoc.save();
          }
        } else {
          await dispatchBluetoothPrintJob(String(jobDoc._id));
        }
        results.push({
          ok: true,
          printerId: String(printer._id),
          printerName: printer.name,
          jobId: String(jobDoc._id),
          queued: pType === "usb",
          dispatched: pType === "bluetooth",
        });
        continue;
      }

      await printKitchenTicket(printer, order, ls, kind);
      results.push({
        ok: true,
        printerId: String(printer._id),
        printerName: printer.name,
      });
    } catch (e) {
      results.push({
        ok: false,
        printerId: String(printer._id),
        printerName: printer.name,
        error: e.message || String(e),
      });
    }
  }
  return {
    stations: map.size,
    results,
  };
}

async function enrichCancelSnapshots(snapshots) {
  const enriched = [];
  for (const snap of snapshots) {
    if (!snap.menuItem) continue;
    const mi = await MenuItem.findById(snap.menuItem).populate({
      path: "category",
      populate: { path: "printerAssignment" },
    });
    enriched.push({
      _id: snap._id,
      menuItem: mi || { _id: snap.menuItem },
      quantity: snap.quantity,
      note: snap.note || "",
      name: snap.name,
      status: snap.status,
    });
  }
  return enriched;
}

async function printCancelledSnapshots(order, snapshots) {
  if (!snapshots.length) return { stations: 0, results: [] };
  const lines = await enrichCancelSnapshots(snapshots);
  return printTicketsForLines(order, lines, "cancel");
}

module.exports = {
  printKitchenTicket,
  printCustomerReceipt,
  groupLinesByPrinter,
  printTicketsForLines,
  printCancelledSnapshots,
  orderTableNo,
};
