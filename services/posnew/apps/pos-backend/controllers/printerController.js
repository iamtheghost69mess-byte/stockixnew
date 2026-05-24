const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const net = require("net");
const Printer = require("../models/printerModel");
const Category = require("../models/categoryModel");
const { printKitchenTicket } = require("../services/orderPrinting");
const { parsePaginationQuery } = require("../utils/listPagination");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const escpos = require("@node-escpos/core");
const USB = require("@node-escpos/usb-adapter");

const listPrinters = async (req, res, next) => {
  try {
    const q = {};
    if (req.tenantOrganizationId) {
      q.organization = req.tenantOrganizationId;
    }
    if (req.locationScopeId) {
      q.$or = [
        { location: req.locationScopeId },
        { location: null },
        { location: { $exists: false } },
      ];
    }
    if (req.query.type) {
      q.type = String(req.query.type).trim().toLowerCase();
    }
    const pag = parsePaginationQuery(req.query);
    const base = Printer.find(q).sort({ name: 1 });

    if (pag.active) {
      const [printers, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit),
        Printer.countDocuments(q),
      ]);
      return res.status(200).json({
        success: true,
        data: printers,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }

    const printers = await base;
    res.status(200).json({ success: true, data: printers });
  } catch (e) {
    next(e);
  }
};

const getPrinterById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid printer id."));
    }
    const pq = { _id: id };
    if (req.tenantOrganizationId) {
      pq.organization = req.tenantOrganizationId;
    }
    const printer = await Printer.findOne(pq);
    if (!printer) {
      return next(createHttpError(404, "Printer not found."));
    }
    res.status(200).json({ success: true, data: printer });
  } catch (e) {
    next(e);
  }
};

const createPrinter = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const {
      name,
      type,
      thermalDriver,
      ipAddress,
      port,
      eposUrl,
      usbVendorId,
      usbProductId,
      bluetoothAddress,
    } = req.body;
    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    const loc =
      req.body.location && mongoose.Types.ObjectId.isValid(req.body.location)
        ? req.body.location
        : req.locationScopeId || null;

    const printer = await Printer.create({
      organization: orgId,
      name: String(name).trim(),
      type: type || "network",
      thermalDriver: thermalDriver || "epson",
      ipAddress: ipAddress != null ? String(ipAddress).trim() : "",
      port: port != null ? Number(port) : 9100,
      eposUrl: eposUrl != null ? String(eposUrl).trim() : "",
      usbVendorId: usbVendorId != null ? String(usbVendorId).trim() : "",
      usbProductId: usbProductId != null ? String(usbProductId).trim() : "",
      bluetoothAddress:
        bluetoothAddress != null ? String(bluetoothAddress).trim() : "",
      location: loc,
    });
    res.status(201).json({ success: true, data: printer });
  } catch (e) {
    next(e);
  }
};

const updatePrinter = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid printer id."));
    }
    const printer = await Printer.findOne({ _id: id, organization: orgId });
    if (!printer) {
      return next(createHttpError(404, "Printer not found."));
    }
    const {
      name,
      type,
      thermalDriver,
      ipAddress,
      port,
      eposUrl,
      usbVendorId,
      usbProductId,
      bluetoothAddress,
    } = req.body;
    if (name !== undefined) printer.name = String(name).trim();
    if (type !== undefined) printer.type = type;
    if (thermalDriver !== undefined) printer.thermalDriver = thermalDriver;
    if (ipAddress !== undefined) printer.ipAddress = String(ipAddress).trim();
    if (port !== undefined) printer.port = Number(port);
    if (eposUrl !== undefined) printer.eposUrl = String(eposUrl).trim();
    if (usbVendorId !== undefined) printer.usbVendorId = String(usbVendorId).trim();
    if (usbProductId !== undefined) {
      printer.usbProductId = String(usbProductId).trim();
    }
    if (bluetoothAddress !== undefined) {
      printer.bluetoothAddress = String(bluetoothAddress).trim();
    }
    await printer.save();
    res.status(200).json({ success: true, data: printer });
  } catch (e) {
    next(e);
  }
};

const deletePrinter = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid printer id."));
    }
    const printer = await Printer.findOneAndDelete({
      _id: id,
      organization: orgId,
    });
    if (!printer) {
      return next(createHttpError(404, "Printer not found."));
    }
    res.status(200).json({ success: true, message: "Printer removed." });
  } catch (e) {
    next(e);
  }
};

const testPrint = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid printer id."));
    }
    const printer = await Printer.findOne({ _id: id, organization: orgId });
    if (!printer) {
      return next(createHttpError(404, "Printer not found."));
    }
    const mockOrder = { _id: printer._id, table: { tableNo: "TEST" } };
    const mockLines = [
      {
        quantity: 1,
        name: "Restro POS test print",
        menuItem: { name: "Restro POS test print" },
        note: "",
      },
    ];
    await printKitchenTicket(printer, mockOrder, mockLines, "order");
    res.status(200).json({ success: true, message: "Test print sent." });
  } catch (e) {
    next(e);
  }
};

async function stampPrinterCheck(printerId, payload) {
  const checkedAt = new Date();
  await Printer.findByIdAndUpdate(printerId, {
    $set: { lastCheckedAt: checkedAt },
  });
  return { ...payload, lastCheckedAt: checkedAt.toISOString() };
}

function parseUsbId(v) {
  const raw = String(v || "").trim().toLowerCase().replace(/^0x/, "");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidNetworkHost(host) {
  const trimmedHost = String(host || "").trim();
  if (!trimmedHost || trimmedHost.length > 253) {
    return false;
  }
  if (net.isIP(trimmedHost)) {
    return true;
  }
  const hostnameRegex =
    /^(?=.{1,253}$)(?!-)(?:[A-Za-z0-9-]{1,63}\.)*[A-Za-z0-9-]{1,63}$/;
  return hostnameRegex.test(trimmedHost);
}

async function checkNetworkHost(host, port) {
  if (!isValidNetworkHost(host)) {
    return false;
  }
  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    return false;
  }
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: String(host).trim(), port: parsedPort }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(2500);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function checkEposUrl(urlStr) {
  let u;
  try {
    u = new URL(String(urlStr || "").trim());
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    return false;
  }
  if (u.username || u.password) {
    return false;
  }
  if (!isValidNetworkHost(u.hostname)) {
    return false;
  }
  const lib = u.protocol === "https:" ? require("https") : require("http");
  return new Promise((resolve) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname || "/",
        method: "GET",
        timeout: 2500,
      },
      (r) => {
        r.resume();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function checkUsbConfigured(vendorIdRaw, productIdRaw) {
  const vendorId = parseUsbId(vendorIdRaw);
  const productId = parseUsbId(productIdRaw);
  if (!vendorId || !productId) {
    return { online: false, detail: "USB vendor/product IDs missing or invalid." };
  }
  const device = new USB(vendorId, productId);
  const printer = new escpos.Printer(device);
  return new Promise((resolve) => {
    device.open((openErr) => {
      if (openErr) {
        return resolve({
          online: false,
          detail: `USB unavailable (${openErr.message || "open failed"})`,
        });
      }
      printer.close(() => {
        resolve({ online: true, detail: "USB device reachable" });
      });
    });
  });
}

const printerStatus = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid printer id."));
    }
    const printer = await Printer.findOne({ _id: id, organization: orgId });
    if (!printer) {
      return next(createHttpError(404, "Printer not found."));
    }
    const type = printer.type || "network";

    if (type === "usb") {
      const data = await stampPrinterCheck(id, {
        online: false,
        detail: "USB status not available on server.",
      });
      return res.status(200).json({ success: true, data });
    }

    if (type === "bluetooth") {
      const data = await stampPrinterCheck(id, {
        online: false,
        detail: "Bluetooth status is managed by paired terminal clients.",
      });
      return res.status(200).json({ success: true, data });
    }

    if (type === "epson-epos") {
      const urlStr = String(printer.eposUrl || "").trim();
      if (!urlStr) {
        const data = await stampPrinterCheck(id, {
          online: false,
          detail: "eposUrl not configured.",
        });
        return res.status(200).json({ success: true, data });
      }
      const online = await checkEposUrl(urlStr);
      if (!online && !String(urlStr || "").trim()) {
        const data = await stampPrinterCheck(id, {
          online: false,
          detail: "Invalid eposUrl.",
        });
        return res.status(200).json({ success: true, data });
      }
      const data = await stampPrinterCheck(id, {
        online,
        detail: online ? "HTTP reachable" : "Unreachable",
      });
      return res.status(200).json({ success: true, data });
    }

    const host = String(printer.ipAddress || "").trim();
    const port = Number(printer.port) || 9100;
    if (!host) {
      const data = await stampPrinterCheck(id, {
        online: false,
        detail: "No IP address.",
      });
      return res.status(200).json({ success: true, data });
    }

    const online = await checkNetworkHost(host, port);

    const data = await stampPrinterCheck(id, {
      online,
      detail: online ? "TCP port open" : "Unreachable",
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const discoverPrinters = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const typeFilter = String(req.query.type || "all").toLowerCase();
    const supported = new Set(["all", "network", "usb", "epson-epos"]);
    if (!supported.has(typeFilter)) {
      return next(createHttpError(400, "Invalid discovery type."));
    }
    const q = { organization: orgId };
    if (typeFilter !== "all") q.type = typeFilter;
    const printers = await Printer.find(q).populate("location", "name code").sort({ name: 1 }).lean();
    const printerIds = printers.map((p) => p._id);
    const categoryCounts = await Category.aggregate([
      {
        $match: {
          organization: orgId,
          printerAssignment: { $in: printerIds },
        },
      },
      {
        $group: {
          _id: "$printerAssignment",
          count: { $sum: 1 },
        },
      },
    ]);
    const categoryCountByPrinterId = new Map(
      categoryCounts.map((r) => [String(r._id), Number(r.count) || 0])
    );

    const rows = await Promise.all(
      printers.map(async (p) => {
        const type = String(p.type || "network").toLowerCase();
        if (type === "network") {
          const host = String(p.ipAddress || "").trim();
          const port = Number(p.port) || 9100;
          if (!host) {
            return {
              printerId: String(p._id),
              name: p.name,
              type,
              online: false,
              detail: "No IP address.",
              locationId: p.location?._id ? String(p.location._id) : null,
              locationName: p.location?.name || "",
              categoryCount: categoryCountByPrinterId.get(String(p._id)) || 0,
            };
          }
          const online = await checkNetworkHost(host, port);
          return {
            printerId: String(p._id),
            name: p.name,
            type,
            online,
            detail: online ? "TCP reachable" : "Unreachable",
            locationId: p.location?._id ? String(p.location._id) : null,
            locationName: p.location?.name || "",
            categoryCount: categoryCountByPrinterId.get(String(p._id)) || 0,
          };
        }
        if (type === "epson-epos") {
          const urlStr = String(p.eposUrl || "").trim();
          if (!urlStr) {
            return {
              printerId: String(p._id),
              name: p.name,
              type,
              online: false,
              detail: "No eposUrl.",
              locationId: p.location?._id ? String(p.location._id) : null,
              locationName: p.location?.name || "",
              categoryCount: categoryCountByPrinterId.get(String(p._id)) || 0,
            };
          }
          const online = await checkEposUrl(urlStr);
          return {
            printerId: String(p._id),
            name: p.name,
            type,
            online,
            detail: online ? "HTTP reachable" : "Unreachable",
            locationId: p.location?._id ? String(p.location._id) : null,
            locationName: p.location?.name || "",
            categoryCount: categoryCountByPrinterId.get(String(p._id)) || 0,
          };
        }
        if (type === "usb") {
          const usb = await checkUsbConfigured(p.usbVendorId, p.usbProductId);
          return {
            printerId: String(p._id),
            name: p.name,
            type,
            online: usb.online,
            detail: usb.detail,
            locationId: p.location?._id ? String(p.location._id) : null,
            locationName: p.location?.name || "",
            categoryCount: categoryCountByPrinterId.get(String(p._id)) || 0,
          };
        }
        return {
          printerId: String(p._id),
          name: p.name,
          type,
          online: false,
          detail: "Discovery not supported for this type.",
          locationId: p.location?._id ? String(p.location._id) : null,
          locationName: p.location?.name || "",
          categoryCount: categoryCountByPrinterId.get(String(p._id)) || 0,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        scannedAt: new Date().toISOString(),
        total: rows.length,
        online: rows.filter((r) => r.online).length,
        offline: rows.filter((r) => !r.online).length,
        items: rows,
      },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listPrinters,
  getPrinterById,
  createPrinter,
  updatePrinter,
  deletePrinter,
  testPrint,
  printerStatus,
  discoverPrinters,
};
