/**
 * MongoDB seed for printer routing tests — uses real models + real print pipeline.
 */

const path = require("path");

function requireBackend(rel) {
  return require(path.join(__dirname, "../../../apps/pos-backend", rel));
}

/**
 * @param {import('mongoose')} mongoose
 * @param {{ runId: string }} opts
 */
async function seedRoutingFixture(_mongoose, opts) {
  const Organization = requireBackend("models/organizationModel");
  const Location = requireBackend("models/locationModel");
  const Table = requireBackend("models/tableModel");
  const Printer = requireBackend("models/printerModel");
  const Category = requireBackend("models/categoryModel");
  const MenuItem = requireBackend("models/menuItemModel");
  const PrintJob = requireBackend("models/printJobModel");
  const Order = requireBackend("models/orderModel");

  const runId = opts.runId || `fp_${Date.now()}`;
  const org = await Organization.create({
    name: `Fake printer suite ${runId}`,
    slug: `fp-${runId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40),
    lifecycle: "active",
  });
  const orgId = org._id;

  const loc = await Location.create({
    organization: orgId,
    name: "FP Loc",
    code: `FP${String(runId).slice(-6)}`,
  });

  const table = await Table.create({
    organization: orgId,
    location: loc._id,
    tableNo: 5,
    seats: 4,
    status: "free",
  });

  const printerDefs = [
    { name: "Kitchen", type: "network", ipAddress: "192.168.1.20", port: 9100 },
    { name: "Bar", type: "network", ipAddress: "192.168.1.21", port: 9101 },
    { name: "Grill", type: "network", ipAddress: "192.168.1.22", port: 9102 },
    { name: "Receipt", type: "network", ipAddress: "192.168.1.23", port: 9103 },
    {
      name: "Drinks",
      type: "bluetooth",
      ipAddress: "",
      bluetoothAddress: "00:11:22:33:44:55",
    },
  ];

  const printers = [];
  for (const pd of printerDefs) {
    printers.push(
      await Printer.create({
        organization: orgId,
        location: loc._id,
        name: pd.name,
        type: pd.type,
        ipAddress: pd.ipAddress || "",
        port: pd.port || 9100,
        bluetoothAddress: pd.bluetoothAddress || "",
      }),
    );
  }

  const printerByName = Object.fromEntries(printers.map((p) => [p.name, p]));

  const categorySpecs = [
    { name: "Kitchen", printer: "Kitchen" },
    { name: "Bar", printer: "Bar" },
    { name: "Grill", printer: "Grill" },
    { name: "Drinks", printer: "Drinks" },
    { name: "Receipt", printer: "Receipt" },
  ];

  const categories = [];
  for (const cs of categorySpecs) {
    const pr = printerByName[cs.printer];
    categories.push(
      await Category.create({
        organization: orgId,
        name: cs.name,
        printerAssignment: pr._id,
      }),
    );
  }

  const catByName = Object.fromEntries(
    categories.map((c) => [c.name, c]),
  );

  const menuSpecs = [
    { name: "Burger", price: 12.99, category: "Kitchen" },
    { name: "Beer", price: 5, category: "Bar" },
    { name: "Grilled Fish", price: 18, category: "Grill" },
    { name: "Water", price: 1.5, category: "Drinks" },
    { name: "Side Salad", price: 4, category: "Kitchen" },
  ];

  const menuItems = [];
  for (const ms of menuSpecs) {
    const cat = catByName[ms.category];
    menuItems.push(
      await MenuItem.create({
        organization: orgId,
        name: ms.name,
        price: ms.price,
        category: cat._id,
        isAvailable: true,
      }),
    );
  }

  const menuByName = Object.fromEntries(menuItems.map((m) => [m.name, m]));

  async function cleanup() {
    await PrintJob.deleteMany({ org: orgId });
    await Order.deleteMany({ organization: orgId });
    await MenuItem.deleteMany({ organization: orgId });
    await Category.deleteMany({ organization: orgId });
    await Printer.deleteMany({ organization: orgId });
    await Table.deleteMany({ organization: orgId });
    await Location.deleteMany({ organization: orgId });
    await Organization.deleteOne({ _id: orgId });
  }

  return {
    orgId,
    locationId: loc._id,
    tableId: table._id,
    tableNo: table.tableNo,
    printers,
    printerByName,
    categories,
    catByName,
    menuItems,
    menuByName,
    cleanup,
  };
}

function menuItemsCategory(mi, catByName) {
  const catId = mi.category;
  const cat = Object.values(catByName).find((c) => String(c._id) === String(catId));
  if (!cat) throw new Error(`Category not found for menu item ${mi.name}`);
  return cat;
}

/**
 * @param {Record<string, object>} menuByName
 * @param {Record<string, object>} catByName
 * @param {Record<string, object>} printerByName
 */
function buildPopulatedLinesFromSpecs(menuByName, catByName, printerByName, lines) {
  const mongoose = require("mongoose");
  return lines.map((spec) => {
    const mi = menuByName[spec.item];
    if (!mi) throw new Error(`Unknown menu item: ${spec.item}`);
    const catDoc = menuItemsCategory(mi, catByName);
    const pr = printerByName[catDoc.name];
    if (!pr) throw new Error(`No printer for category ${catDoc.name}`);
    const qty = spec.qty ?? 1;
    return {
      _id: new mongoose.Types.ObjectId(),
      menuItem: {
        _id: mi._id,
        name: mi.name,
        category: {
          _id: catDoc._id,
          name: catDoc.name,
          printerAssignment: pr,
        },
      },
      quantity: qty,
      note: spec.note || "",
      name: mi.name,
      status: "pending",
    };
  });
}

module.exports = {
  seedRoutingFixture,
  buildPopulatedLinesFromSpecs,
};
