const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Table = require("../models/tableModel");
const Location = require("../models/locationModel");
const Printer = require("../models/printerModel");
const { recalcOrderTotals } = require("../utils/orderTotals");
const {
  printTicketsForLines,
  printCancelledSnapshots,
  printCustomerReceipt,
} = require("../services/orderPrinting");
const {
  processStockAfterStatusPatch,
  processStockAfterItemsPatch,
  processStockAfterPayment,
  processStockForLineIds,
  restoreStockForOrderLine,
  restoreStockForAllDeductedLines,
  emitInventoryUpdated,
  assertOrderLinesFulfillable,
} = require("../services/inventoryService");
const orderReservationService = require("../services/orderReservationService");
const { toCanonical } = require("../utils/tableStatus");
const {
  emitPos,
  posSocketOptsFromOrder,
  posSocketOptsFromTable,
} = require("../utils/socketEmit");
const { tableIdsForOrderFilter } = require("../utils/tableScope");
const { parsePaginationQuery } = require("../utils/listPagination");
const LoyaltyAccount = require("../models/loyaltyAccountModel");
const { getLoyaltyConfig } = require("../services/loyaltyService");
const { assertWithinLimit, incrementUsage } = require(
  "../services/entitlementService"
);
const { canAccessOperation } = require("../services/rbacService");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");
const { rbacRoleKey } = require("../utils/rbacRoleKey");
const {
  onOrderBecamePaid,
  accountingPostingFromOrder,
} = require("../services/accountingService");
const DiscountAudit = require("../models/discountAuditModel");
const PosAuditLog = require("../models/posAuditLogModel");
const SplitBill = require("../models/splitBillModel");
const {
  validateOrderPaymentSplitsForPay,
} = require("../utils/orderPaymentSplits");
const AccountingConfig = require("../models/accountingConfigModel");
const {
  enqueueBigcapitalSyncIfEnabled,
} = require("../services/bigcapitalSyncEnqueue");

const ACTIVE = ["pending", "in-progress", "ready"];

function fireBigcapitalSync(order) {
  enqueueBigcapitalSyncIfEnabled(order).catch((err) => {
    console.error("[BigcapitalSync] enqueue failed:", err?.message || err);
  });
}
const ORDER_LIFECYCLE_STEPS = ["draft", "sent", "billed", "paid", "closed"];

/** Non-breaking GL snapshot for POS clients (persisted on order after `onOrderBecamePaid`). */
function accountingPostingPayloadForResponse(populated) {
  return { accountingPosting: accountingPostingFromOrder(populated) };
}

/**
 * strictOversell: assertOrderLinesFulfillable runs on
 * - addOrder, syncOfflineOrders (before save)
 * - patchOrderItems (after line edits, before save)
 * - updateOrder (when `items` payload present, before save)
 * - deductForOrderLine (per line, when strictOversell)
 * Self-order: submitSelfOrder (before save) for parity.
 */

function normalizeOrderStatus(s) {
  if (s == null || s === "") return "pending";
  const key = String(s).toLowerCase().trim().replace(/\s+/g, " ");
  const map = {
    "in progress": "in-progress",
    pending: "pending",
    ready: "ready",
    served: "served",
    paid: "paid",
    cancelled: "cancelled",
  };
  if (map[key]) return map[key];
  return String(s).toLowerCase().replace(/\s+/g, "-");
}

/** `null` if the value is non-empty but not a valid item status. */
function normalizeOrderItemStatus(s) {
  if (s == null || s === "") return "pending";
  const key = String(s).toLowerCase().trim();
  return Order.ITEM_STATUSES.includes(key) ? key : null;
}

function isTerminalOrderStatus(st) {
  return ["paid", "cancelled"].includes(st);
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function logPosAudit(req, order, action, metadata = {}) {
  const organizationId =
    order?.organization || req.tenantOrganizationId || req.user?.organization || null;
  if (!organizationId) return;
  await PosAuditLog.create({
    organization: organizationId,
    location: order?.location || req.locationScopeId || null,
    user: req.user?._id || null,
    action: String(action || "").trim(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  });
}

async function createVoidAuditLogs({ req, order, voidEntries, voidReason }) {
  if (!Array.isArray(voidEntries) || voidEntries.length === 0) return;
  const tableDoc =
    order.table && mongoose.Types.ObjectId.isValid(String(order.table))
      ? await Table.findById(order.table).select("tableNo")
      : null;
  const tableNumber = tableDoc?.tableNo != null ? String(tableDoc.tableNo) : "";
  await PosAuditLog.insertMany(
    voidEntries.flatMap((entry) => {
      const baseMetadata = {
        itemName: String(entry.itemName || "").trim(),
        orderRef: String(order._id),
        tableNumber,
        voidedBy: String(req.user?.name || "").trim(),
        reason: String(voidReason || "").trim(),
        voidType: entry.voidType,
      };
      const specificAction =
        entry.voidType === "post_send"
          ? "item_voided_postsend"
          : "item_voided_presend";
      const base = {
        organization: order.organization || req.tenantOrganizationId,
        location: order.location || req.locationScopeId || null,
        user: req.user?._id || null,
      };
      return [
        { ...base, action: "void", metadata: baseMetadata },
        { ...base, action: specificAction, metadata: baseMetadata },
      ];
    })
  );
}

function normalizeOrderLifecycleStatus(s) {
  if (s == null || s === "") return "draft";
  const key = String(s).toLowerCase().trim();
  return ORDER_LIFECYCLE_STEPS.includes(key) ? key : "draft";
}

function lifecycleRank(s) {
  const normalized = normalizeOrderLifecycleStatus(s);
  return ORDER_LIFECYCLE_STEPS.indexOf(normalized);
}

function assertForwardLifecycleTransition(previousStatus, nextStatus) {
  const prev = lifecycleRank(previousStatus);
  const next = lifecycleRank(nextStatus);
  if (next < prev) {
    throw createHttpError(
      400,
      `Invalid lifecycle transition from ${normalizeOrderLifecycleStatus(
        previousStatus
      )} to ${normalizeOrderLifecycleStatus(nextStatus)}.`
    );
  }
}

function setOrderLifecycleStatus(order, nextStatus) {
  assertForwardLifecycleTransition(order.status, nextStatus);
  order.status = normalizeOrderLifecycleStatus(nextStatus);
}

async function rbacCan(req, operation) {
  const role = rbacRoleKey(req.user);
  if (!role) return false;
  return canAccessOperation(
    role,
    operation,
    resolveOrganizationIdFromUser(req.user)
  );
}

function orderWaiterId(order) {
  const w = order.waiter;
  if (w == null) return null;
  if (typeof w === "object" && w._id != null) return String(w._id);
  return String(w);
}

/** Aligns with roles.md: read-all OR assigned waiter OR cashier (payment). */
async function assertPosOrderReadAccess(req, order) {
  if (await rbacCan(req, "pos.order.read_all")) return;
  if (orderWaiterId(order) === String(req.user._id)) return;
  if (await rbacCan(req, "pos.payment.use")) return;
  throw createHttpError(
    403,
    "You do not have access to this order. Only assigned staff, cashiers, or managers can open it."
  );
}

async function assertPosOrderWriteAccess(req, order) {
  if (await rbacCan(req, "pos.order.read_all")) return;
  if (orderWaiterId(order) === String(req.user._id)) return;
  if (await rbacCan(req, "pos.payment.use")) return;
  throw createHttpError(
    403,
    "You cannot modify this order. It belongs to another server or requires manager access."
  );
}

async function assertWaiterReceiptPermission(req, order) {
  if (String(req.user?.role || "").toLowerCase() !== "waiter") return;
  if (await rbacCan(req, "pos.receipt.print")) return;
  const locationId =
    order?.location && mongoose.Types.ObjectId.isValid(String(order.location))
      ? String(order.location)
      : req.locationScopeId && mongoose.Types.ObjectId.isValid(String(req.locationScopeId))
        ? String(req.locationScopeId)
        : null;
  if (!locationId) return;
  const location = await Location.findOne({
    _id: locationId,
    organization: req.tenantOrganizationId,
  })
    .select("waiterCanPrintReceipt")
    .lean();
  if (!location?.waiterCanPrintReceipt) {
    throw createHttpError(
      403,
      "Receipt printing is disabled for waiters in this branch."
    );
  }
}

async function assertSplitBillSettledForPaidTransition(order, organizationId) {
  const openSplit = await SplitBill.findOne({
    organization: organizationId,
    order: order._id,
    status: { $in: ["pending", "partial"] },
  })
    .select("_id status")
    .lean();
  if (openSplit) {
    throw createHttpError(
      400,
      "Cannot close order while split bill has unpaid balances."
    );
  }
}

const ORDER_ITEM_POPULATE = {
  path: "items.menuItem",
  populate: {
    path: "category",
    populate: { path: "printerAssignment" },
  },
};

function buildScopedOrderFilter(id, organizationId) {
  const filter = { _id: id };
  if (organizationId) {
    filter.organization = organizationId;
  }
  return filter;
}

function buildScopedTableFilter(id, organizationId) {
  const filter = { _id: id };
  if (organizationId) {
    filter.organization = organizationId;
  }
  return filter;
}

async function populateOrder(doc, organizationId = null) {
  const id = doc && doc._id ? doc._id : doc;
  return Order.findOne(buildScopedOrderFilter(id, organizationId))
    .populate(ORDER_ITEM_POPULATE)
    .populate("table")
    .populate("waiter", "name role")
    .populate("customer", "name phone loyaltyCard vatNumber");
}

/**
 * @param {import("mongoose").Types.ObjectId | string} orderId
 * @param {{ session?: import("mongoose").ClientSession | null }} [options]
 */
async function releaseTableByOrderId(orderId, options = {}) {
  const { session = null } = options;
  const orderQ = Order.findById(orderId).select("table orderStatus status");
  if (session) orderQ.session(session);
  const order = await orderQ;
  if (!order || !order.table) return;
  const st = normalizeOrderStatus(order.orderStatus);
  const tableId = order.table;
  const opts = session ? { session } : {};
  const unsetOrder = { $unset: { currentOrder: 1, currentWaiter: 1 } };
  if (st === "paid") {
    const closedAt = new Date();
    await Table.findByIdAndUpdate(
      tableId,
      { ...unsetOrder, $set: { status: toCanonical("closed"), lastBillPaidAt: closedAt } },
      opts
    );
    await Table.findByIdAndUpdate(
      tableId,
      { $set: { status: toCanonical("available") } },
      opts
    );
    return;
  }
  await Table.findByIdAndUpdate(
    tableId,
    { ...unsetOrder, $set: { status: "available" } },
    opts
  );
}

/**
 * Branch flag: when false, send-to-kitchen marks lines sent but skips physical station tickets.
 * @param {import("mongoose").Document | { location?: unknown } | null} order
 * @returns {Promise<boolean>}
 */
async function isBranchKitchenWorkflowEnabled(order) {
  const locId = order?.location;
  if (!locId || !mongoose.Types.ObjectId.isValid(String(locId))) {
    return true;
  }
  const row = await Location.findById(locId).select("kitchenWorkflowEnabled").lean();
  if (!row) return true;
  return row.kitchenWorkflowEnabled !== false;
}

function emitOrderTable(req, order, tableId) {
  const locOpts = posSocketOptsFromOrder(order);
  emitPos(req, "order:updated", {
    orderId: String(order._id),
    tableId: tableId ? String(tableId) : undefined,
  }, locOpts);
  if (tableId) {
    emitPos(
      req,
      "table:status-changed",
      { tableId: String(tableId) },
      locOpts
    );
  }
}

/**
 * Category station tickets + stock deduct. Only **pending** lines that map to a
 * station printer are printed, then marked `sent` so repeat submits print only new items.
 */
async function completeSubmitStationTickets(req, order) {
  const st0 = normalizeOrderStatus(order.orderStatus);
  if (["paid", "cancelled"].includes(st0)) {
    throw createHttpError(400, "Cannot fire kitchen tickets for a closed check.");
  }
  if (st0 !== "pending" && st0 !== "in-progress") {
    throw createHttpError(
      400,
      "Submit stations is only for open checks (pending or in progress)."
    );
  }
  if (!order.items.length) {
    throw createHttpError(400, "Order has no lines to submit.");
  }

  const populated = await populateOrder(order);
  const linesToPrint = populated.items.filter((li) => {
    const st = String(li.status || "").toLowerCase();
    if (st !== "pending") return false;
    const mi = li.menuItem;
    if (!mi || typeof mi !== "object") return false;
    const pr = mi.category?.printerAssignment;
    return pr && pr._id;
  });

  let printing = { stations: 0, results: [] };
  const kitchenWorkflow = await isBranchKitchenWorkflowEnabled(order);
  if (linesToPrint.length && kitchenWorkflow) {
    printing = await printTicketsForLines(populated, linesToPrint, "order");
  }

  for (const li of linesToPrint) {
    const sub = order.items.id(li._id);
    if (sub) sub.status = "sent";
  }
  if (linesToPrint.length > 0) {
    setOrderLifecycleStatus(order, "sent");
  }
  await order.save();

  const populated2 = await populateOrder(order);
  return { printing, populated: populated2 };
}

async function resolveKitchenFlowMode(req) {
  const orgId = req.tenantOrganizationId || null;
  if (!orgId) return "station_tickets";
  const cfg = await AccountingConfig.findOne({ organization: orgId })
    .select("kitchenFlowMode")
    .lean();
  const mode = String(cfg?.kitchenFlowMode || "").toLowerCase().trim();
  return mode === "kitchen_display" ? "kitchen_display" : "station_tickets";
}

async function completeSubmitKitchenDisplay(req, order) {
  const st0 = normalizeOrderStatus(order.orderStatus);
  if (["paid", "cancelled"].includes(st0)) {
    throw createHttpError(400, "Cannot send a closed check to kitchen display.");
  }
  if (st0 !== "pending" && st0 !== "in-progress") {
    throw createHttpError(
      400,
      "Kitchen dispatch is only for open checks (pending or in progress)."
    );
  }
  if (!order.items.length) {
    throw createHttpError(400, "Order has no lines to submit.");
  }
  let changed = false;
  for (const line of order.items) {
    const lineStatus = String(line.status || "").toLowerCase();
    if (lineStatus === "pending") {
      line.status = "sent";
      changed = true;
    }
  }
  if (changed) {
    setOrderLifecycleStatus(order, "sent");
  }
  if (normalizeOrderStatus(order.orderStatus) === "pending") {
    order.orderStatus = "in-progress";
  }
  await recalcOrderTotals(order);
  await order.save();
  const populated = await populateOrder(order);
  return { printing: { stations: 0, results: [] }, populated };
}

const addOrder = async (req, res, next) => {
  try {
    const body = { ...req.body };
    const tableId = body.table;
    if (!tableId || !mongoose.Types.ObjectId.isValid(tableId)) {
      return next(createHttpError(400, "Valid table is required."));
    }

    const table = await Table.findOne(
      buildScopedTableFilter(tableId, req.tenantOrganizationId)
    );
    if (!table) {
      return next(createHttpError(404, "Table not found."));
    }

    if (toCanonical(table.status) === "occupied" && !table.currentOrder) {
      table.status = "available";
      await table.save();
    }

    if (table.currentOrder) {
      return next(
        createHttpError(
          400,
          "Table already has an open order. Continue from the menu or complete the existing order."
        )
      );
    }

    body.orderStatus = normalizeOrderStatus(body.orderStatus) || "pending";
    body.status = "draft";
    body.waiter = req.user._id;
    body.waiterUsername = String(req.user?.username || "").trim().toLowerCase();
    body.location = table.location || null;
    body.organization = req.tenantOrganizationId;
    if (!body.orderSource) body.orderSource = "staff";

    if (body.organization) {
      const oid = body.organization._id || body.organization;
      await assertWithinLimit(oid, "orders", 0);
    }

    if (body.items && body.items.length) {
      for (const line of body.items) {
        if (line.menuItem && !mongoose.Types.ObjectId.isValid(line.menuItem)) {
          return next(createHttpError(400, "Invalid menuItem in order line."));
        }
        const itemSt = normalizeOrderItemStatus(line.status);
        if (itemSt === null) {
          return next(createHttpError(400, "Invalid line item status."));
        }
        line.status = itemSt;
      }
    }

    const order = new Order(body);
    await recalcOrderTotals(order);
    const initialSt = normalizeOrderStatus(order.orderStatus);
    if (initialSt === "paid") {
      order.paidAt = new Date();
      validateOrderPaymentSplitsForPay(order, body);
    }
    await assertOrderLinesFulfillable(order);
    if (initialSt === "paid") {
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          await order.save({ session: dbSession });
          setOrderLifecycleStatus(order, "paid");
          await processStockAfterPayment(req, order, {
            previousOrderStatus: "pending",
            mongooseSession: dbSession,
          });
          await onOrderBecamePaid(order, null, req.user._id, {
            session: dbSession,
          });
          setOrderLifecycleStatus(order, "closed");
          await order.save({ session: dbSession });
          if (order.organization && !order.entitlementOrderUsageCounted) {
            await assertWithinLimit(order.organization, "orders", 1);
            await incrementUsage(order.organization, "orders", 1);
            order.entitlementOrderUsageCounted = true;
            await order.save({ session: dbSession });
          }
        });
      } finally {
        dbSession.endSession();
      }
      fireBigcapitalSync(order);
    } else {
      await order.save();
    }

    const newSt = normalizeOrderStatus(order.orderStatus);
    if (newSt === "pending") {
      await orderReservationService.reserveLinesForOrder(req, order);
    }

    if (!isTerminalOrderStatus(newSt)) {
      table.currentOrder = order._id;
      table.currentWaiter = order.waiter || req.user._id;
      table.status = toCanonical("occupied");
      table.lastBillPaidAt = null;
      await table.save();
      emitPos(
        req,
        "table:status-changed",
        {
          tableId: String(table._id),
          status: table.status,
        },
        posSocketOptsFromTable(table)
      );
    }

    const populated = await populateOrder(order);
    await logPosAudit(req, order, "order_created", {
      orderRef: String(order._id),
      itemCount: Array.isArray(order.items) ? order.items.length : 0,
    });
    if (Array.isArray(order.items) && order.items.length > 0) {
      await logPosAudit(req, order, "item_added", {
        orderRef: String(order._id),
        addedCount: order.items.length,
      });
    }
    if (newSt === "paid") {
      await logPosAudit(req, order, "payment_recorded", {
        orderRef: String(order._id),
        paymentMethod: String(order.paymentMethod || ""),
        totalWithTax: Number(order.bills?.totalWithTax || 0),
      });
      await logPosAudit(req, order, "bill_closed", {
        orderRef: String(order._id),
      });
    }

    emitPos(
      req,
      "order:new",
      {
        orderId: String(order._id),
        tableId: String(table._id),
      },
      posSocketOptsFromOrder(order)
    );

    res.status(201).json({
      success: true,
      message: "Order created!",
      data: populated,
      ...accountingPostingPayloadForResponse(populated),
    });
  } catch (error) {
    next(error);
  }
};

const getOpenOrderForTable = async (req, res, next) => {
  try {
    const { tableId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(tableId)) {
      return next(createHttpError(400, "Invalid table id."));
    }
    const table = await Table.findOne(
      buildScopedTableFilter(tableId, req.tenantOrganizationId)
    );
    if (!table || !table.currentOrder) {
      return res.status(200).json({ success: true, data: null });
    }
    const order = await Order.findOne(
      buildScopedOrderFilter(table.currentOrder, req.tenantOrganizationId)
    );
    if (!order) {
      await Table.updateOne(
        buildScopedTableFilter(tableId, req.tenantOrganizationId),
        {
        $unset: { currentOrder: "" },
        status: "available",
      }
      );
      return res.status(200).json({ success: true, data: null });
    }
    const st = normalizeOrderStatus(order.orderStatus);
    if (isTerminalOrderStatus(st)) {
      return res.status(200).json({ success: true, data: null });
    }
    const populated = await populateOrder(order, req.tenantOrganizationId);
    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const getKitchenOrders = async (req, res, next) => {
  try {
    const filter = {
      orderStatus: {
        $in: ["in-progress", "ready", "In Progress", "Ready"],
      },
    };
    if (req.tenantOrganizationId) {
      filter.organization = req.tenantOrganizationId;
    }
    if (req.locationScopeId) {
      const tids = await tableIdsForOrderFilter(req.locationScopeId);
      filter.table = { $in: tids };
    }
    const pag = parsePaginationQuery(req.query);
    if (pag.active) {
      const [orders, total] = await Promise.all([
        Order.find(filter)
          .populate(ORDER_ITEM_POPULATE)
          .populate("table")
          .populate("waiter", "name")
          .sort({ updatedAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit),
        Order.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        message: "Kitchen orders.",
        data: orders,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }

    const orders = await Order.find(filter)
      .populate(ORDER_ITEM_POPULATE)
      .populate("table")
      .populate("waiter", "name")
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, message: "Kitchen orders.", data: orders });
  } catch (e) {
    next(e);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(404, "Invalid id!"));
    }

    const order = await populateOrder(id, req.tenantOrganizationId);
    if (!order) {
      return next(createHttpError(404, "Order not found!"));
    }

    try {
      await assertPosOrderReadAccess(req, order);
    } catch (e) {
      return next(e);
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const filter = {};
    if (req.tenantOrganizationId) {
      filter.organization = req.tenantOrganizationId;
    }
    if (req.locationScopeId) {
      const tids = await tableIdsForOrderFilter(req.locationScopeId);
      filter.table = { $in: tids };
    }
    const readAll = await rbacCan(req, "pos.order.read_all");
    if (!readAll) {
      filter.waiter = req.user._id;
    }
    const qLimit = parseInt(String(req.query.limit || ""), 10);
    const qPage = parseInt(String(req.query.page || ""), 10);
    const usePage =
      Number.isFinite(qLimit) &&
      qLimit > 0 &&
      Number.isFinite(qPage) &&
      qPage > 0;

    if (usePage) {
      const limit = Math.min(100, qLimit);
      const page = qPage;
      const skip = (page - 1) * limit;
      const [orders, total] = await Promise.all([
        Order.find(filter)
          .populate(ORDER_ITEM_POPULATE)
          .populate("table")
          .populate("waiter", "name role")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Order.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        data: orders,
        page,
        limit,
        total,
      });
    }

    const orders = await Order.find(filter)
      .populate(ORDER_ITEM_POPULATE)
      .populate("table")
      .populate("waiter", "name role")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

const patchOrderItems = async (req, res, next) => {
  let retries = 3;
  while (retries > 0) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(createHttpError(400, "Invalid order id."));
      }
      const order = await Order.findOne(
        buildScopedOrderFilter(id, req.tenantOrganizationId)
      );
      if (!order) {
        return next(createHttpError(404, "Order not found."));
      }
    try {
      await assertPosOrderWriteAccess(req, order);
    } catch (e) {
      return next(e);
    }
    const st = normalizeOrderStatus(order.orderStatus);
    if (["paid", "cancelled"].includes(st)) {
      return next(createHttpError(400, "Cannot edit a closed order."));
    }

    const { add, removeLineIds, replaceLines, reason } = req.body;
    const voidReason = reason == null ? "" : String(reason).trim();
    const voidAuditEntries = [];
    let hasModifierAdded = false;
    let hasPriceOverride = false;
    let itemAddedCount = 0;

    let cancelSnapshots = [];
    const replenishedFromVoid = [];

    if (Array.isArray(replaceLines)) {
      const keepIds = new Set(
        replaceLines
          .filter((l) => l._id && mongoose.Types.ObjectId.isValid(String(l._id)))
          .map((l) => String(l._id))
      );
      const removingSentLine = order.items.some((line) => {
        if (keepIds.has(String(line._id))) return false;
        const lineSt = String(line.status || "").toLowerCase();
        return lineSt === "sent";
      });
      if (removingSentLine && voidReason.length < 3) {
        return next(
          createHttpError(400, "Reason is required for post-send void.")
        );
      }
      const toRemove = order.items.filter((line) => !keepIds.has(String(line._id)));
      for (const line of toRemove) {
        await orderReservationService.releaseReservationsForLine(order, line);
        if (line.stockDeductedAt && line.menuItem) {
          const r = await restoreStockForOrderLine(
            req,
            order,
            line,
            "order_line_void"
          );
          replenishedFromVoid.push(...r.replenishedIds);
        }
        const lineSt = String(line.status || "").toLowerCase();
        if (["sent", "ready"].includes(lineSt) && line.menuItem) {
          cancelSnapshots.push({
            _id: line._id,
            menuItem: line.menuItem,
            quantity: line.quantity,
            note: line.note,
            name: line.name,
            status: line.status,
          });
        }
        voidAuditEntries.push({
          itemName: line.name || "",
          voidType: ["sent", "ready"].includes(lineSt) ? "post_send" : "pre_send",
        });
      }
      order.items = order.items.filter((line) => keepIds.has(String(line._id)));

      for (const line of replaceLines) {
        let st = normalizeOrderItemStatus(line.status);
        if (st === null) st = "pending";
        const id =
          line._id && mongoose.Types.ObjectId.isValid(String(line._id))
            ? String(line._id)
            : null;
        const existing = id ? order.items.id(id) : null;
        if (existing) {
          const nextMi = line.menuItem;
          if (
            nextMi != null &&
            mongoose.Types.ObjectId.isValid(String(nextMi)) &&
            String(existing.menuItem || "") !== String(nextMi)
          ) {
            existing.menuItem = nextMi;
            existing.status = "pending";
          }
          existing.quantity = Math.max(1, Number(line.quantity) || 1);
          existing.note = line.note != null ? String(line.note).trim() : "";
          if (line.name != null) existing.name = line.name;
          if (line.pricePerQuantity != null) {
            existing.pricePerQuantity = line.pricePerQuantity;
            hasPriceOverride = true;
          }
          if (line.price != null) {
            existing.price = line.price;
            hasPriceOverride = true;
          }
        } else {
          if (!line.menuItem || !mongoose.Types.ObjectId.isValid(line.menuItem)) {
            return next(
              createHttpError(400, "Each new line needs a valid menuItem.")
            );
          }
          
          const qty = Math.max(1, Number(line.quantity) || 1);
          const note = line.note != null ? String(line.note).trim() : "";
          
          // Try to merge into an existing pending line with same menuItem and note
          const incomingItemType = String(line.itemType || "menu_item");
          const incomingComboId = line.comboId ? String(line.comboId) : "";
          const mergeTarget = order.items.find(
            (item) =>
              String(item.menuItem) === String(line.menuItem) &&
              (item.note || "").trim() === note &&
              item.status === "pending" &&
              String(item.itemType || "menu_item") === incomingItemType &&
              String(item.comboId || "") === incomingComboId
          );

          if (mergeTarget) {
            mergeTarget.quantity += qty;
            itemAddedCount += qty;
          } else {
            order.items.push({
              menuItem: line.menuItem || undefined,
              quantity: qty,
              note: note,
              status: st,
              name: line.name,
              pricePerQuantity: line.pricePerQuantity,
              price: line.price,
              selectedModifiers: Array.isArray(line.selectedModifiers)
                ? line.selectedModifiers
                : [],
              itemType: incomingItemType,
              comboId: line.comboId || undefined,
              comboName: line.comboName || undefined,
              comboPrice: line.comboPrice,
              selectedSlots: Array.isArray(line.selectedSlots)
                ? line.selectedSlots
                : [],
            });
            if (Array.isArray(line.selectedModifiers) && line.selectedModifiers.length > 0) {
              hasModifierAdded = true;
            }
            if (line.pricePerQuantity != null || line.price != null) {
              hasPriceOverride = true;
            }
            itemAddedCount += qty;
          }
        }
      }
    } else {
      if (Array.isArray(removeLineIds)) {
        const set = new Set(removeLineIds.map(String));
        const removingSentLine = order.items.some((line) => {
          if (!set.has(String(line._id))) return false;
          const lineSt = String(line.status || "").toLowerCase();
          return lineSt === "sent";
        });
        if (removingSentLine && voidReason.length < 3) {
          return next(
            createHttpError(400, "Reason is required for post-send void.")
          );
        }
        for (const line of order.items) {
          if (!set.has(String(line._id))) continue;
          await orderReservationService.releaseReservationsForLine(order, line);
          if (line.stockDeductedAt && line.menuItem) {
            const r = await restoreStockForOrderLine(
              req,
              order,
              line,
              "order_line_void"
            );
            replenishedFromVoid.push(...r.replenishedIds);
          }
          const lineSt = String(line.status || "").toLowerCase();
          if (["sent", "ready"].includes(lineSt) && line.menuItem) {
            cancelSnapshots.push({
              _id: line._id,
              menuItem: line.menuItem,
              quantity: line.quantity,
              note: line.note,
              name: line.name,
              status: line.status,
            });
          }
          voidAuditEntries.push({
            itemName: line.name || "",
            voidType: ["sent", "ready"].includes(lineSt) ? "post_send" : "pre_send",
          });
        }
        order.items = order.items.filter((line) => !set.has(String(line._id)));
      }
      if (Array.isArray(add)) {
        for (const line of add) {
          if (!line.menuItem || !mongoose.Types.ObjectId.isValid(line.menuItem)) {
            return next(
              createHttpError(400, "Each added line needs a valid menuItem.")
            );
          }
          const st = normalizeOrderItemStatus(line.status);
          if (st === null) {
            return next(createHttpError(400, "Invalid line item status."));
          }
          const qty = Math.max(1, Number(line.quantity) || 1);
          const note = line.note != null ? String(line.note).trim() : "";

          // Merge into existing pending line with same menuItem and note if found
          const incomingItemType = String(line.itemType || "menu_item");
          const incomingComboId = line.comboId ? String(line.comboId) : "";
          const existing = order.items.find(
            (item) =>
              String(item.menuItem) === String(line.menuItem) &&
              (item.note || "").trim() === note &&
              item.status === "pending" &&
              String(item.itemType || "menu_item") === incomingItemType &&
              String(item.comboId || "") === incomingComboId
          );

          if (existing) {
            existing.quantity += qty;
            itemAddedCount += qty;
          } else {
            order.items.push({
              menuItem: line.menuItem,
              quantity: qty,
              note: note,
              status: st,
              selectedModifiers: Array.isArray(line.selectedModifiers)
                ? line.selectedModifiers
                : [],
              itemType: incomingItemType,
              comboId: line.comboId || undefined,
              comboName: line.comboName || undefined,
              comboPrice: line.comboPrice,
              selectedSlots: Array.isArray(line.selectedSlots)
                ? line.selectedSlots
                : [],
            });
            if (Array.isArray(line.selectedModifiers) && line.selectedModifiers.length > 0) {
              hasModifierAdded = true;
            }
            if (line.pricePerQuantity != null || line.price != null) {
              hasPriceOverride = true;
            }
            itemAddedCount += qty;
          }
        }
      }
    }

    await recalcOrderTotals(order);
    await assertOrderLinesFulfillable(order);
    await order.save();

    await processStockAfterItemsPatch(req, order);
    const stAfter = normalizeOrderStatus(order.orderStatus);
    if (stAfter === "pending") {
      await orderReservationService.reserveLinesForOrder(req, order);
    }

    if (replenishedFromVoid.length) {
      emitInventoryUpdated(req, replenishedFromVoid);
    }

    const populated = await populateOrder(order);
    emitOrderTable(req, order, order.table);

    let printing = null;
    if (cancelSnapshots.length) {
      printing = await printCancelledSnapshots(populated, cancelSnapshots);
    }
    await createVoidAuditLogs({
      req,
      order,
      voidEntries: voidAuditEntries,
      voidReason,
    });
    if (hasModifierAdded) {
      await logPosAudit(req, order, "modifier_added", {
        orderRef: String(order._id),
      });
    }
    if (hasPriceOverride) {
      await logPosAudit(req, order, "price_override", {
        orderRef: String(order._id),
      });
    }
    if (itemAddedCount > 0) {
      await logPosAudit(req, order, "item_added", {
        orderRef: String(order._id),
        addedCount: itemAddedCount,
      });
    }

    res.status(200).json({
      success: true,
      message: "Order items updated.",
      data: populated,
      ...(printing && printing.stations > 0 ? { printing } : {}),
    });
    return;
  } catch (e) {
    if (e.name === "VersionError" && retries > 1) {
      retries--;
      // Small jittered delay to let the other request finish
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 200 + 50));
      continue;
    }
    next(e);
    return;
  }
}
};

const patchOrderLineItemStatus = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(itemId)
    ) {
      return next(createHttpError(400, "Invalid order or line id."));
    }
    const order = await Order.findOne(
      buildScopedOrderFilter(id, req.tenantOrganizationId)
    );
    if (!order) {
      return next(createHttpError(404, "Order not found."));
    }
    const stOrd = normalizeOrderStatus(order.orderStatus);
    if (["paid", "cancelled"].includes(stOrd)) {
      return next(createHttpError(400, "Cannot edit a closed order."));
    }

    const raw = req.body?.status ?? req.body?.itemStatus;
    if (raw === undefined || raw === null || raw === "") {
      return next(createHttpError(400, "status is required."));
    }
    const st = normalizeOrderItemStatus(raw);
    if (st === null) {
      return next(createHttpError(400, "Invalid item status."));
    }
    const line = order.items.id(itemId);
    if (!line) {
      return next(createHttpError(404, "Order line not found."));
    }
    line.status = st;
    const allReady =
      order.items.length > 0 &&
      order.items.every((l) => String(l.status) === "ready");
    if (allReady) {
      order.orderStatus = "ready";
    }
    await order.save();
    const populated = await populateOrder(order);
    emitOrderTable(req, order, order.table);
    res
      .status(200)
      .json({ success: true, message: "Line updated.", data: populated });
  } catch (e) {
    next(e);
  }
};

const patchOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid order id."));
    }
    const order = await Order.findOne(
      buildScopedOrderFilter(id, req.tenantOrganizationId)
    );
    if (!order) {
      return next(createHttpError(404, "Order not found."));
    }
    try {
      await assertPosOrderWriteAccess(req, order);
    } catch (e) {
      return next(e);
    }

    const previousOrderStatus = order.orderStatus;
    const previousLifecycleStatus = normalizeOrderLifecycleStatus(order.status);

    const {
      orderStatus,
      lineId,
      itemStatus,
      markAllItemsSent,
      paymentMethod,
      paymentData,
      paymentSplits,
      submitStationTickets,
    } = req.body;

    if (req.body.billingMode !== undefined) {
      const bm = String(req.body.billingMode).toLowerCase();
      if (bm === "immediate" || bm === "on_account") {
        order.billingMode = bm;
      }
    }
    if (req.body.documentCurrency !== undefined) {
      if (req.body.documentCurrency === null || req.body.documentCurrency === "") {
        order.documentCurrency = null;
      } else {
        order.documentCurrency = String(req.body.documentCurrency)
          .toUpperCase()
          .trim()
          .slice(0, 3);
      }
    }
    if (
      req.body.fxRateToCompany !== undefined &&
      req.body.fxRateToCompany !== null &&
      req.body.fxRateToCompany !== ""
    ) {
      const fx = Number(req.body.fxRateToCompany);
      if (!Number.isNaN(fx) && fx > 0) {
        order.fxRateToCompany = fx;
      }
    }

    /** Fire station printers by category only — no KDS queue, no item "sent" status, no receipt. */
    if (submitStationTickets === true) {
      try {
        const kitchenFlowMode = await resolveKitchenFlowMode(req);
        const { printing, populated } =
          kitchenFlowMode === "kitchen_display"
            ? await completeSubmitKitchenDisplay(req, order)
            : await completeSubmitStationTickets(req, order);
        await logPosAudit(req, order, "order_sent", {
          orderRef: String(order._id),
          mode: kitchenFlowMode,
        });
        emitOrderTable(req, order, order.table);
        return res.status(200).json({
          success: true,
          message:
            kitchenFlowMode === "kitchen_display"
              ? "Order submitted to kitchen display."
              : "Order submitted. Tickets print by category to assigned stations (not on kitchen display).",
          data: populated,
          ...(printing && printing.stations > 0 ? { printing } : {}),
        });
      } catch (e) {
        return next(e);
      }
    }

    if (lineId && itemStatus !== undefined && itemStatus !== null) {
      const st = normalizeOrderItemStatus(itemStatus);
      if (st === null) {
        return next(createHttpError(400, "Invalid item status."));
      }
      const line = order.items.id(lineId);
      if (!line) {
        return next(createHttpError(404, "Order line not found."));
      }
      line.status = st;
      const allReady =
        order.items.length > 0 &&
        order.items.every((l) => String(l.status) === "ready");
      if (allReady) {
        order.orderStatus = "ready";
      }
      await order.save();
      const populated = await populateOrder(order);
      emitOrderTable(req, order, order.table);
      return res
        .status(200)
        .json({ success: true, message: "Line updated.", data: populated });
    }

    const idsJustSent = [];
    if (markAllItemsSent) {
      order.items.forEach((l) => {
        if (l.status === "pending") {
          idsJustSent.push(l._id);
          l.status = "sent";
        }
      });
    }

    if (orderStatus !== undefined) {
      const nextSt = normalizeOrderStatus(orderStatus);
      const prevNormForPay = normalizeOrderStatus(previousOrderStatus);
      if (nextSt === "paid" && prevNormForPay !== "paid") {
        const ok = await rbacCan(req, "pos.payment.use");
        if (!ok) {
          return next(
            createHttpError(
              403,
              "Marking an order paid requires payment access (cashier or manager)."
            )
          );
        }
        await assertSplitBillSettledForPaidTransition(
          order,
          req.tenantOrganizationId
        );
      }
      order.orderStatus = nextSt;
      if (nextSt === "paid") {
        setOrderLifecycleStatus(order, "paid");
      }
    }
    if (paymentMethod !== undefined) {
      order.paymentMethod = paymentMethod;
    }
    if (paymentData !== undefined) {
      order.paymentData = { ...order.paymentData, ...paymentData };
    }
    if (Array.isArray(paymentSplits) && paymentSplits.length > 1) {
      await logPosAudit(req, order, "split_bill_created", {
        orderRef: String(order._id),
        splitCount: paymentSplits.length,
      });
    }

    if (markAllItemsSent || orderStatus !== undefined) {
      await recalcOrderTotals(order);
    }
    const prevNorm = normalizeOrderStatus(previousOrderStatus);
    const effectiveNew = normalizeOrderStatus(order.orderStatus);
    const becamePaid = effectiveNew === "paid" && prevNorm !== "paid";
    const hadServiceCharge =
      Number(order.bills?.serviceChargeAmount || 0) > 0 ||
      Number(order.bills?.serviceChargeRate || 0) > 0;
    if (effectiveNew === "paid" && prevNorm !== "paid") {
      order.paidAt = new Date();
      order.linesLockedAt = new Date();
      const manualOff = roundMoney(Number(order.manualDiscountAmount || 0));
      if (manualOff > 0) {
        order.bills.totalWithTax = Math.max(
          0,
          roundMoney(Number(order.bills.totalWithTax || 0) - manualOff)
        );
      }
      const custId = req.body.customer;
      const pts = Number(req.body.loyaltyPointsRedeemed) || 0;
      const discount = Number(req.body.loyaltyDiscountAmount) || 0;
      if (
        custId &&
        mongoose.Types.ObjectId.isValid(custId) &&
        pts > 0 &&
        discount > 0
      ) {
        const orderOrg = order.organization || req.tenantOrganizationId;
        const accQ = { customer: custId };
        if (orderOrg) accQ.organization = orderOrg;
        const acc = await LoyaltyAccount.findOne(accQ);
        if (!acc || acc.points < pts) {
          return next(createHttpError(400, "Insufficient loyalty points."));
        }
        const cfg = await getLoyaltyConfig(orderOrg);
        const expected = roundMoney(pts / cfg.pointsPerRupeeOff);
        if (Math.abs(expected - discount) > 0.02) {
          return next(
            createHttpError(400, "Loyalty discount does not match points.")
          );
        }
        acc.points -= pts;
        acc.history.push({
          action: "redeem",
          delta: -pts,
          note: `pay:${String(order._id)}`,
        });
        await acc.save();
        order.customer = custId;
        order.loyaltyPointsRedeemed = pts;
        order.loyaltyDiscountAmount = discount;
        order.bills.totalWithTax = Math.max(
          0,
          roundMoney(Number(order.bills.totalWithTax) - discount)
        );
      } else if (custId && mongoose.Types.ObjectId.isValid(custId)) {
        order.customer = custId;
      }
      if (
        req.body.tipAmount !== undefined &&
        req.body.tipAmount !== null &&
        req.body.tipAmount !== ""
      ) {
        const t = roundMoney(Number(req.body.tipAmount));
        if (!Number.isNaN(t) && t >= 0) {
          order.tipAmount = t;
          if (t > 0) {
            order.bills.totalWithTax = roundMoney(
              Number(order.bills.totalWithTax || 0) + t
            );
          }
        }
      }
      validateOrderPaymentSplitsForPay(order, { paymentSplits });
      if (order.organization && !order.entitlementOrderUsageCounted) {
        await assertWithinLimit(order.organization, "orders", 1);
        await incrementUsage(order.organization, "orders", 1);
        order.entitlementOrderUsageCounted = true;
      }
    }
    assertForwardLifecycleTransition(previousLifecycleStatus, order.status);

    const newSt = normalizeOrderStatus(order.orderStatus);

    if (becamePaid) {
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          await order.save({ session: dbSession });
          if (isTerminalOrderStatus(newSt)) {
            if (newSt === "paid" && order.table) {
              await Table.findOneAndUpdate(
                buildScopedTableFilter(order.table, req.tenantOrganizationId),
                {
                  $set: {
                    status: toCanonical("closed"),
                    lastBillPaidAt: new Date(),
                  },
                },
                { session: dbSession }
              );
            }
            await releaseTableByOrderId(order._id, { session: dbSession });
            if (newSt === "paid") {
              setOrderLifecycleStatus(order, "closed");
              await order.save({ session: dbSession });
            }
          }
          await processStockAfterStatusPatch(req, order, {
            previousOrderStatus,
            markAllItemsSent: !!markAllItemsSent,
            idsJustSent,
          });
          await processStockAfterPayment(req, order, {
            previousOrderStatus,
            mongooseSession: dbSession,
          });
          await onOrderBecamePaid(order, previousOrderStatus, req.user._id, {
            session: dbSession,
          });
        });
      } finally {
        dbSession.endSession();
      }
    } else {
      await order.save();

      if (newSt === "cancelled" && prevNorm !== "cancelled") {
        await orderReservationService.releaseAllReservationsForOrder(order._id);
        await restoreStockForAllDeductedLines(req, order, "order_cancel");
      }

      if (isTerminalOrderStatus(newSt)) {
        if (newSt === "paid" && order.table) {
          await Table.findOneAndUpdate(
            buildScopedTableFilter(order.table, req.tenantOrganizationId),
            { $set: { status: toCanonical("closed"), lastBillPaidAt: new Date() } }
          );
        }
        await releaseTableByOrderId(order._id);
        if (newSt === "paid") {
          setOrderLifecycleStatus(order, "closed");
          await order.save();
        }
      }

      await processStockAfterStatusPatch(req, order, {
        previousOrderStatus,
        markAllItemsSent: !!markAllItemsSent,
        idsJustSent,
      });

      await processStockAfterPayment(req, order, {
        previousOrderStatus,
      });

      await onOrderBecamePaid(order, previousOrderStatus, req.user._id);
    }
    if (becamePaid) {
      await logPosAudit(req, order, "payment_recorded", {
        orderRef: String(order._id),
        paymentMethod: String(order.paymentMethod || ""),
        totalWithTax: Number(order.bills?.totalWithTax || 0),
      });
      await logPosAudit(req, order, "bill_closed", {
        orderRef: String(order._id),
      });
      fireBigcapitalSync(order);
    }
    if (
      hadServiceCharge &&
      Number(order.bills?.serviceChargeAmount || 0) <= 0 &&
      Number(order.bills?.serviceChargeRate || 0) <= 0
    ) {
      await logPosAudit(req, order, "service_charge_removed", {
        orderRef: String(order._id),
      });
    }

    const populated = await populateOrder(order);
    emitOrderTable(req, order, order.table);

    let printing = null;
    if (markAllItemsSent && idsJustSent.length > 0) {
      const idSet = new Set(idsJustSent.map(String));
      const linesToPrint = populated.items.filter((li) =>
        idSet.has(String(li._id))
      );
      if (linesToPrint.length && (await isBranchKitchenWorkflowEnabled(order))) {
        printing = await printTicketsForLines(populated, linesToPrint, "order");
      }
    }

    res.status(200).json({
      success: true,
      message: "Order updated.",
      data: populated,
      ...accountingPostingPayloadForResponse(populated),
      ...(printing && printing.stations > 0 ? { printing } : {}),
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/order/:id/print — kitchen (station submit + tickets) or receipt (single printer).
 * Body: { type: "kitchen" | "receipt", printerId?: string } — printerId required for receipt.
 */
const printOrderDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, printerId } = req.body || {};
    const t = String(type || "").toLowerCase().trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid order id."));
    }
    if (t !== "kitchen" && t !== "receipt") {
      return next(
        createHttpError(400, "type must be \"kitchen\" or \"receipt\".")
      );
    }

    const order = await Order.findOne(
      buildScopedOrderFilter(id, req.tenantOrganizationId)
    );
    if (!order) {
      return next(createHttpError(404, "Order not found."));
    }
    try {
      await assertPosOrderWriteAccess(req, order);
    } catch (e) {
      return next(e);
    }

    if (t === "kitchen") {
      try {
        const kitchenFlowMode = await resolveKitchenFlowMode(req);
        const { printing, populated } =
          kitchenFlowMode === "kitchen_display"
            ? await completeSubmitKitchenDisplay(req, order)
            : await completeSubmitStationTickets(req, order);
        await logPosAudit(req, order, "order_sent", {
          orderRef: String(order._id),
          mode: kitchenFlowMode,
        });
        emitOrderTable(req, order, order.table);
        return res.status(200).json({
          success: true,
          message:
            kitchenFlowMode === "kitchen_display"
              ? "Order submitted to kitchen display."
              : "Order submitted. Tickets print by category to assigned stations (not on kitchen display).",
          data: populated,
          ...(printing && printing.stations > 0 ? { printing } : {}),
        });
      } catch (e) {
        return next(e);
      }
    }

    const pid = printerId;
    if (!pid || !mongoose.Types.ObjectId.isValid(String(pid))) {
      return next(
        createHttpError(
          400,
          "printerId is required for receipt printing."
        )
      );
    }
    const pq = {
      _id: pid,
      organization: req.tenantOrganizationId,
    };
    if (req.locationScopeId) {
      pq.$or = [
        { location: req.locationScopeId },
        { location: null },
        { location: { $exists: false } },
      ];
    }
    const printer = await Printer.findOne(pq);
    if (!printer) {
      return next(createHttpError(404, "Printer not found."));
    }
    try {
      await assertWaiterReceiptPermission(req, order);
    } catch (e) {
      return next(e);
    }

    const populated = await populateOrder(order, req.tenantOrganizationId);
    const printing = await printCustomerReceipt(printer, populated);
    const anyOk = printing.results.some((r) => r.ok);
    if (!anyOk) {
      const errMsg =
        printing.results.map((r) => r.error).filter(Boolean)[0] ||
        "Receipt print failed.";
      return next(createHttpError(502, errMsg));
    }
    setOrderLifecycleStatus(order, "billed");
    await order.save();
    await logPosAudit(req, order, "bill_printed", {
      orderRef: String(order._id),
      printerId: String(printer._id),
    });
    if (order.table) {
      await Table.findOneAndUpdate(
        buildScopedTableFilter(order.table, req.tenantOrganizationId),
        { $set: { status: toCanonical("billed") } }
      );
    }
    emitOrderTable(req, order, order.table);
    return res.status(200).json({
      success: true,
      message: "Receipt sent.",
      data: populated,
      ...(printing && printing.stations > 0 ? { printing } : {}),
    });
  } catch (e) {
    next(e);
  }
};

const reprintOrderToPrinter = async (req, res, next) => {
  try {
    const { id, printerId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(printerId)
    ) {
      return next(createHttpError(400, "Invalid id."));
    }
    const order = await populateOrder(id, req.tenantOrganizationId);
    if (!order) {
      return next(createHttpError(404, "Order not found."));
    }
    try {
      await assertPosOrderReadAccess(req, order);
    } catch (e) {
      return next(e);
    }
    const printer = await Printer.findById(printerId);
    if (!printer) {
      return next(createHttpError(404, "Printer not found."));
    }
    const lines = order.items.filter((line) => {
      const mi = line.menuItem;
      if (!mi || typeof mi !== "object") return false;
      const pr = mi.category?.printerAssignment;
      return pr && String(pr._id) === String(printerId);
    });
    if (!lines.length) {
      return next(
        createHttpError(400, "No items for this printer on this order.")
      );
    }
    const printing = await printTicketsForLines(order, lines, "order");
    res.status(200).json({ success: true, message: "Reprint sent.", printing });
  } catch (e) {
    next(e);
  }
};

const transferOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { toTableId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid order id."));
    }
    if (!toTableId || !mongoose.Types.ObjectId.isValid(toTableId)) {
      return next(createHttpError(400, "Valid toTableId is required."));
    }

    const order = await Order.findOne(
      buildScopedOrderFilter(id, req.tenantOrganizationId)
    );
    if (!order) {
      return next(createHttpError(404, "Order not found."));
    }
    try {
      await assertPosOrderWriteAccess(req, order);
    } catch (e) {
      return next(e);
    }
    const st = normalizeOrderStatus(order.orderStatus);
    if (["paid", "cancelled"].includes(st)) {
      return next(createHttpError(400, "Cannot transfer a closed order."));
    }

    let fromTableId = null;
    let toTable = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const txOrder = await Order.findOne(
          buildScopedOrderFilter(id, req.tenantOrganizationId)
        ).session(session);
        if (!txOrder) {
          throw createHttpError(404, "Order not found.");
        }

        const txFromTable = txOrder.table
          ? await Table.findOne(
              buildScopedTableFilter(txOrder.table, req.tenantOrganizationId)
            ).session(session)
          : null;
        const txToTable = await Table.findOne(
          buildScopedTableFilter(toTableId, req.tenantOrganizationId)
        ).session(session);
        if (!txToTable) {
          throw createHttpError(404, "Destination table not found.");
        }
        if (String(txToTable._id) === String(txFromTable?._id)) {
          throw createHttpError(400, "Order is already on this table.");
        }
        if (txToTable.currentOrder) {
          throw createHttpError(400, "Destination table already has an open order.");
        }

        if (txFromTable) {
          txFromTable.currentOrder = undefined;
          txFromTable.currentWaiter = undefined;
          txFromTable.status = "available";
          await txFromTable.save({ session });
          fromTableId = String(txFromTable._id);
        }

        txOrder.table = txToTable._id;
        txOrder.location = txToTable.location || null;
        await txOrder.save({ session });

        txToTable.currentOrder = txOrder._id;
        txToTable.currentWaiter = txOrder.waiter || null;
        txToTable.status = "occupied";
        txToTable.lastBillPaidAt = null;
        await txToTable.save({ session });
        toTable = txToTable.toObject();
      });
    } finally {
      await session.endSession();
    }

    const refreshedOrder = await Order.findOne(
      buildScopedOrderFilter(id, req.tenantOrganizationId)
    );
    const populated = await populateOrder(refreshedOrder, req.tenantOrganizationId);
    emitPos(
      req,
      "order:updated",
      { orderId: String(refreshedOrder._id) },
      posSocketOptsFromOrder(refreshedOrder)
    );
    if (fromTableId) {
      emitPos(
        req,
        "table:status-changed",
        { tableId: fromTableId },
        posSocketOptsFromTable({ _id: fromTableId, organization: req.tenantOrganizationId })
      );
    }
    emitPos(
      req,
      "table:status-changed",
      { tableId: String(toTable._id) },
      posSocketOptsFromTable(toTable)
    );

    res.status(200).json({ success: true, message: "Order transferred.", data: populated });
  } catch (e) {
    next(e);
  }
};

/** Staff/manager manual discount on open check; writes DiscountAudit row. */
const applyManualDiscount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      amount,
      reason,
      discountType,
      discountValue,
      valueType,
      discountScope,
      itemId,
    } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid order id."));
    }
    const order = await Order.findOne(
      buildScopedOrderFilter(id, req.tenantOrganizationId)
    );
    if (!order) {
      return next(createHttpError(404, "Order not found."));
    }
    try {
      await assertPosOrderWriteAccess(req, order);
    } catch (e) {
      return next(e);
    }
    const st = normalizeOrderStatus(order.orderStatus);
    if (["paid", "cancelled"].includes(st)) {
      return next(createHttpError(400, "Cannot discount a closed order."));
    }
    let discountReasonRequired = true;
    if (order.location && mongoose.Types.ObjectId.isValid(String(order.location))) {
      const locCfg = await Location.findById(order.location)
        .select("discountReasonRequired")
        .lean();
      if (locCfg && locCfg.discountReasonRequired !== undefined) {
        discountReasonRequired = locCfg.discountReasonRequired !== false;
      } else {
        const cfg = await AccountingConfig.findOne({
          organization: req.tenantOrganizationId,
        }).select("discountReasonRequired");
        discountReasonRequired = cfg?.discountReasonRequired !== false;
      }
    } else {
      const cfg = await AccountingConfig.findOne({
        organization: req.tenantOrganizationId,
      }).select("discountReasonRequired");
      discountReasonRequired = cfg?.discountReasonRequired !== false;
    }
    const normalizedReason =
      reason != null ? String(reason).trim().slice(0, 500) : "";
    if (discountReasonRequired && normalizedReason.length === 0) {
      return next(
        createHttpError(
          400,
          "Reason is required for discounts in this branch."
        )
      );
    }

    await recalcOrderTotals(order);
    const gross = roundMoney(Number(order.bills.totalWithTax || 0));
    const current = roundMoney(Number(order.manualDiscountAmount || 0));
    const dueBeforeThis = roundMoney(gross - current);
    if (dueBeforeThis <= 0) {
      return next(
        createHttpError(400, "Nothing left to discount on this check.")
      );
    }
    const rawDiscountType = String(discountType || "").toLowerCase().trim();
    const normalizedScope =
      String(discountScope || "").toLowerCase().trim() === "item" ||
      rawDiscountType === "item"
        ? "item"
        : "bill";
    const normalizedType =
      String(valueType || "").toLowerCase().trim() === "percentage" ||
      rawDiscountType === "percentage"
        ? "percentage"
        : "fixed";
    const providedValue =
      discountValue !== undefined ? Number(discountValue) : Number(amount);
    const parsedValue = roundMoney(providedValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return next(
        createHttpError(
          400,
          "discountValue (or amount) must be a positive number."
        )
      );
    }
    if (normalizedType === "percentage" && parsedValue > 100) {
      return next(
        createHttpError(400, "Percentage discount cannot exceed 100.")
      );
    }
    let add =
      normalizedType === "percentage"
        ? roundMoney((dueBeforeThis * parsedValue) / 100)
        : parsedValue;
    if (!Number.isFinite(add) || add <= 0) {
      return next(
        createHttpError(400, "Calculated discount amount must be positive.")
      );
    }
    let orderItem = null;
    let orderItemLabel = "";
    let previousItemDiscountAmount = 0;
    if (normalizedScope === "item") {
      if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
        return next(createHttpError(400, "Valid itemId is required for item discount."));
      }
      orderItem =
        order.items.find((line) => String(line._id) === String(itemId)) || null;
      if (!orderItem) {
        return next(createHttpError(404, "Order item not found."));
      }
      const lineQty = Math.max(1, Number(orderItem.quantity || 1));
      const lineGross = roundMoney(
        Number.isFinite(Number(orderItem.price))
          ? Number(orderItem.price)
          : Number(orderItem.pricePerQuantity || 0) * lineQty
      );
      previousItemDiscountAmount = roundMoney(Number(orderItem.discount?.amount || 0));
      const remainingLineDiscountable = roundMoney(
        Math.max(0, lineGross - previousItemDiscountAmount)
      );
      if (remainingLineDiscountable <= 0) {
        return next(
          createHttpError(400, "Nothing left to discount for this line.")
        );
      }
      add =
        normalizedType === "percentage"
          ? roundMoney((remainingLineDiscountable * parsedValue) / 100)
          : parsedValue;
      if (add > remainingLineDiscountable) {
        return next(
          createHttpError(
            400,
            `Discount cannot exceed remaining line amount (${remainingLineDiscountable.toFixed(2)}).`
          )
        );
      }
      const newItemDiscountAmount = roundMoney(previousItemDiscountAmount + add);
      orderItem.discount = {
        type: normalizedType,
        scope: "item",
        value: parsedValue,
        amount: newItemDiscountAmount,
        appliedBy: req.user._id,
        reason: reason != null ? String(reason).trim().slice(0, 500) : "",
        appliedAt: new Date(),
      };
      orderItemLabel = String(orderItem.name || "").trim();
    }
    const newManual = roundMoney(
      normalizedScope === "item"
        ? current + (roundMoney(Number(orderItem?.discount?.amount || 0)) - previousItemDiscountAmount)
        : current + add
    );
    if (newManual > gross) {
      return next(
        createHttpError(
          400,
          `Discount cannot exceed check total (${gross.toFixed(2)}).`
        )
      );
    }
    const totalAfter = roundMoney(gross - newManual);

    order.manualDiscountAmount = newManual;
    await order.save();

    const tableDoc = order.table
      ? await Table.findOne(
          buildScopedTableFilter(order.table, req.tenantOrganizationId)
        ).select("tableNo location")
      : null;
    const tableNo = tableDoc?.tableNo ?? 0;

    await DiscountAudit.create({
      order: order._id,
      tableNo,
      totalBefore: dueBeforeThis,
      totalAfter,
      discountAmount: add,
      discountType: normalizedType,
      discountScope: normalizedScope,
      discountValue: parsedValue,
      orderItemId: normalizedScope === "item" ? orderItem?._id || null : null,
      orderItemName: normalizedScope === "item" ? orderItemLabel : "",
      reason: normalizedReason,
      appliedBy: req.user._id,
      location: order.location || tableDoc?.location || null,
    });
    await logPosAudit(req, order, "discount_applied", {
      orderRef: String(order._id),
      discountType: normalizedType,
      discountScope: normalizedScope,
      discountValue: parsedValue,
      discountAmount: add,
      itemId: normalizedScope === "item" && orderItem ? String(orderItem._id) : null,
    });

    const populated = await populateOrder(order);
    emitOrderTable(req, order, order.table);

    res.status(200).json({
      success: true,
      message: "Discount applied.",
      data: populated,
    });
  } catch (e) {
    next(e);
  }
};

const syncOfflineOrders = async (req, res, next) => {
  try {
    const { orders: batch } = req.body;
    if (!Array.isArray(batch)) {
      return next(createHttpError(400, "Body must include an orders array."));
    }

    const results = [];
    for (const payload of batch.slice(0, 25)) {
      try {
        if (!payload.table || !mongoose.Types.ObjectId.isValid(payload.table)) {
          throw new Error("Invalid table id.");
        }
        const table = await Table.findOne(
          buildScopedTableFilter(payload.table, req.tenantOrganizationId)
        );
        if (!table) throw new Error("Table not found.");
        if (table.currentOrder) {
          throw new Error("Table already has an open order.");
        }

        const items = Array.isArray(payload.items) ? payload.items : [];
        for (const line of items) {
          if (line.menuItem && !mongoose.Types.ObjectId.isValid(line.menuItem)) {
            throw new Error("Invalid menuItem in line.");
          }
          const itemSt = normalizeOrderItemStatus(line.status);
          if (itemSt === null) {
            throw new Error("Invalid line item status.");
          }
          line.status = itemSt;
        }

        if (payload.offlineSyncKey) {
          const dup = await Order.findOne({
            offlineSyncKey: String(payload.offlineSyncKey).trim(),
          });
          if (dup) {
            results.push({
              ok: true,
              orderId: String(dup._id),
              duplicate: true,
            });
            continue;
          }
        }

        const order = new Order({
          organization: req.tenantOrganizationId,
          table: table._id,
          waiter: req.user._id,
          waiterUsername: String(req.user?.username || "")
            .trim()
            .toLowerCase(),
          customerDetails: payload.customerDetails || {
            name: "Walk-in",
            phone: "-",
            guests: 1,
          },
          items,
          orderStatus: normalizeOrderStatus(payload.orderStatus) || "pending",
          status: "draft",
          orderSource: "staff",
          location: table.location || null,
          offlineSyncKey: payload.offlineSyncKey
            ? String(payload.offlineSyncKey).trim()
            : undefined,
          paymentMethod: payload.paymentMethod,
          paymentSplits: payload.paymentSplits,
          billingMode: payload.billingMode,
        });
        await recalcOrderTotals(order);
        const initialSt = normalizeOrderStatus(order.orderStatus);
        if (initialSt === "paid") {
          order.paidAt = new Date();
          order.status = "paid";
          validateOrderPaymentSplitsForPay(order, payload);
        }
        await assertOrderLinesFulfillable(order);
        if (initialSt === "paid") {
          const dbSession = await mongoose.startSession();
          try {
            await dbSession.withTransaction(async () => {
              await order.save({ session: dbSession });
              await processStockAfterPayment(req, order, {
                previousOrderStatus: "pending",
                mongooseSession: dbSession,
              });
              await onOrderBecamePaid(order, "pending", req.user._id, {
                session: dbSession,
              });
              order.status = "closed";
              await order.save({ session: dbSession });
            });
          } finally {
            dbSession.endSession();
          }
          fireBigcapitalSync(order);
          await logPosAudit(req, order, "payment_recorded", {
            orderRef: String(order._id),
            paymentMethod: String(order.paymentMethod || ""),
            totalWithTax: Number(order.bills?.totalWithTax || 0),
          });
          await logPosAudit(req, order, "bill_closed", {
            orderRef: String(order._id),
          });
        } else {
          await order.save();
        }

        if (initialSt === "pending") {
          await orderReservationService.reserveLinesForOrder(req, order);
        }

        const wantSubmitStations =
          payload.submitStationTickets === true && initialSt === "pending";

        if (wantSubmitStations) {
          await completeSubmitStationTickets(req, order);
          emitOrderTable(req, order, order.table);
        } else if (initialSt === "in-progress") {
          await processStockAfterStatusPatch(req, order, {
            previousOrderStatus: "pending",
            markAllItemsSent: false,
            idsJustSent: [],
          });
        }

        const newSt = normalizeOrderStatus(order.orderStatus);
        if (!isTerminalOrderStatus(newSt)) {
          table.currentOrder = order._id;
          table.currentWaiter = order.waiter || req.user._id;
          table.status = toCanonical("occupied");
          table.lastBillPaidAt = null;
          await table.save();
          emitPos(
            req,
            "table:status-changed",
            {
              tableId: String(table._id),
              status: table.status,
            },
            posSocketOptsFromTable(table)
          );
        }

        emitPos(
          req,
          "order:new",
          {
            orderId: String(order._id),
            tableId: String(table._id),
          },
          posSocketOptsFromOrder(order)
        );

        const accLean = await Order.findById(order._id)
          .select(
            "accountingSaleStatus accountingSaleError accountingCogsStatus accountingCogsError"
          )
          .lean();
        await logPosAudit(req, order, "order_created", {
          orderRef: String(order._id),
          itemCount: Array.isArray(order.items) ? order.items.length : 0,
        });
        if (Array.isArray(order.items) && order.items.length > 0) {
          await logPosAudit(req, order, "item_added", {
            orderRef: String(order._id),
            addedCount: order.items.length,
          });
        }
        results.push({
          ok: true,
          orderId: String(order._id),
          accountingPosting: accountingPostingFromOrder(accLean),
        });
      } catch (err) {
        results.push({ ok: false, error: err.message || "failed" });
      }
    }

    res.status(200).json({ success: true, data: results });
  } catch (e) {
    next(e);
  }
};

const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid order id."));
    }
    const order = await Order.findOne(
      buildScopedOrderFilter(id, req.tenantOrganizationId)
    );
    if (!order) {
      return next(createHttpError(404, "Order not found."));
    }
    try {
      await assertPosOrderReadAccess(req, order);
    } catch (e) {
      return next(e);
    }
    const st = normalizeOrderStatus(order.orderStatus);
    if (st === "paid") {
      return next(createHttpError(400, "Cannot delete a paid order."));
    }

    await orderReservationService.releaseAllReservationsForOrder(order._id);

    const replenishedOnCancel = [];
    for (const line of order.items) {
      if (line.stockDeductedAt && line.menuItem) {
        const r = await restoreStockForOrderLine(
          req,
          order,
          line,
          "order_cancel"
        );
        replenishedOnCancel.push(...r.replenishedIds);
      }
    }
    if (replenishedOnCancel.length) {
      emitInventoryUpdated(req, replenishedOnCancel);
    }

    await releaseTableByOrderId(order._id);
    await Order.deleteOne(buildScopedOrderFilter(id, req.tenantOrganizationId));
    await logPosAudit(req, order, "order_voided", {
      orderRef: String(order._id),
      via: "delete_order",
    });

    emitPos(
      req,
      "order:updated",
      { orderId: String(id), deleted: true },
      posSocketOptsFromOrder(order)
    );
    emitPos(
      req,
      "table:status-changed",
      { tableId: String(order.table) },
      posSocketOptsFromOrder(order)
    );

    res.status(200).json({ success: true, message: "Order cancelled." });
  } catch (e) {
    next(e);
  }
};

const updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      orderStatus,
      items,
      customerDetails,
      bills,
      paymentMethod,
      paymentData,
      paymentSplits,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(404, "Invalid id!"));
    }

    const order = await Order.findOne(
      buildScopedOrderFilter(id, req.tenantOrganizationId)
    );
    if (!order) {
      return next(createHttpError(404, "Order not found!"));
    }
    try {
      await assertPosOrderWriteAccess(req, order);
    } catch (e) {
      return next(e);
    }

    const prevSt = normalizeOrderStatus(order.orderStatus);
    const hadServiceCharge =
      Number(order.bills?.serviceChargeAmount || 0) > 0 ||
      Number(order.bills?.serviceChargeRate || 0) > 0;

    if (orderStatus !== undefined) {
      order.orderStatus = normalizeOrderStatus(orderStatus);
    }
    if (customerDetails) {
      order.customerDetails = { ...order.customerDetails, ...customerDetails };
    }
    if (Array.isArray(items)) {
      for (const line of order.items) {
        await orderReservationService.releaseReservationsForLine(order, line);
        if (line.stockDeductedAt && line.menuItem) {
          const r = await restoreStockForOrderLine(
            req,
            order,
            line,
            "order_line_void"
          );
          if (r.replenishedIds.length) {
            emitInventoryUpdated(req, r.replenishedIds);
          }
        }
      }
      for (const line of items) {
        if (line && line.status !== undefined && line.status !== null) {
          const st = normalizeOrderItemStatus(line.status);
          if (st === null) {
            return next(createHttpError(400, "Invalid line item status."));
          }
          line.status = st;
        }
      }
      order.items = items;
    }
    if (bills) {
      order.bills = { ...order.bills, ...bills };
    }
    if (paymentMethod !== undefined) order.paymentMethod = paymentMethod;
    if (paymentData) order.paymentData = { ...order.paymentData, ...paymentData };
    if (Array.isArray(paymentSplits) && paymentSplits.length > 1) {
      await logPosAudit(req, order, "split_bill_created", {
        orderRef: String(order._id),
        splitCount: paymentSplits.length,
      });
    }

    if (items) {
      await recalcOrderTotals(order);
      await assertOrderLinesFulfillable(order);
    }
    const willBe = normalizeOrderStatus(order.orderStatus);
    const becamePaidUpdate = willBe === "paid" && prevSt !== "paid";
    if (becamePaidUpdate) {
      await assertSplitBillSettledForPaidTransition(order, req.tenantOrganizationId);
      order.paidAt = new Date();
      setOrderLifecycleStatus(order, "paid");
      validateOrderPaymentSplitsForPay(order, { paymentSplits });
    }

    if (becamePaidUpdate) {
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          await order.save({ session: dbSession });
          const newStInner = normalizeOrderStatus(order.orderStatus);
          if (newStInner === "cancelled" && prevSt !== "cancelled") {
            await orderReservationService.releaseAllReservationsForOrder(order._id);
            await restoreStockForAllDeductedLines(req, order, "order_cancel");
            await logPosAudit(req, order, "order_voided", {
              orderRef: String(order._id),
              via: "update_order_status",
            });
          }
          if (isTerminalOrderStatus(newStInner)) {
            await releaseTableByOrderId(order._id, { session: dbSession });
            if (newStInner === "paid") {
              setOrderLifecycleStatus(order, "closed");
              await order.save({ session: dbSession });
            }
          }
          await processStockAfterStatusPatch(req, order, {
            previousOrderStatus: prevSt,
            markAllItemsSent: false,
            idsJustSent: [],
          });
          await processStockAfterPayment(req, order, {
            previousOrderStatus: prevSt,
            mongooseSession: dbSession,
          });
          await onOrderBecamePaid(order, prevSt, req.user._id, {
            session: dbSession,
          });
        });
      } finally {
        dbSession.endSession();
      }
      await logPosAudit(req, order, "bill_closed", {
        orderRef: String(order._id),
      });
      fireBigcapitalSync(order);
    } else {
      await order.save();

      const newSt = normalizeOrderStatus(order.orderStatus);
      if (newSt === "cancelled" && prevSt !== "cancelled") {
        await orderReservationService.releaseAllReservationsForOrder(order._id);
        await restoreStockForAllDeductedLines(req, order, "order_cancel");
        await logPosAudit(req, order, "order_voided", {
          orderRef: String(order._id),
          via: "update_order_status",
        });
      }

      if (isTerminalOrderStatus(newSt)) {
        await releaseTableByOrderId(order._id);
        if (newSt === "paid") {
          setOrderLifecycleStatus(order, "closed");
          await order.save();
          await logPosAudit(req, order, "bill_closed", {
            orderRef: String(order._id),
          });
        }
      }

      await processStockAfterStatusPatch(req, order, {
        previousOrderStatus: prevSt,
        markAllItemsSent: false,
        idsJustSent: [],
      });
      await processStockAfterPayment(req, order, {
        previousOrderStatus: prevSt,
      });

      await onOrderBecamePaid(order, prevSt, req.user._id);
      if (newSt === "paid" && prevSt !== "paid") {
        fireBigcapitalSync(order);
      }
    }

    const newSt = normalizeOrderStatus(order.orderStatus);
    if (newSt === "pending" && items) {
      await orderReservationService.reserveLinesForOrder(req, order);
    }
    if (newSt === "paid" && prevSt !== "paid") {
      await logPosAudit(req, order, "payment_recorded", {
        orderRef: String(order._id),
        paymentMethod: String(order.paymentMethod || ""),
        totalWithTax: Number(order.bills?.totalWithTax || 0),
      });
    }
    if (
      hadServiceCharge &&
      Number(order.bills?.serviceChargeAmount || 0) <= 0 &&
      Number(order.bills?.serviceChargeRate || 0) <= 0
    ) {
      await logPosAudit(req, order, "service_charge_removed", {
        orderRef: String(order._id),
      });
    }

    const populated = await populateOrder(order);
    emitOrderTable(req, order, order.table);

    res.status(200).json({
      success: true,
      message: "Order updated",
      data: populated,
      ...accountingPostingPayloadForResponse(populated),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addOrder,
  getOpenOrderForTable,
  getKitchenOrders,
  getOrderById,
  getOrders,
  updateOrder,
  patchOrderItems,
  patchOrderLineItemStatus,
  patchOrderStatus,
  printOrderDocument,
  reprintOrderToPrinter,
  transferOrder,
  applyManualDiscount,
  deleteOrder,
  syncOfflineOrders,
  normalizeOrderStatus,
  normalizeOrderItemStatus,
};
