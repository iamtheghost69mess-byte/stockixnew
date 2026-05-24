const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Table = require("../models/tableModel");
const Organization = require("../models/organizationModel");
const { recalcOrderTotals } = require("../utils/orderTotals");
const { toCanonical } = require("../utils/tableStatus");
const {
  emitPos,
  posSocketOptsFromOrder,
  posSocketOptsFromTable,
} = require("../utils/socketEmit");
const {
  processStockAfterStatusPatch,
  processStockAfterItemsPatch,
  assertOrderLinesFulfillable,
} = require("../services/inventoryService");
const { enforceActiveOrganizationById } = require("../middlewares/requireActiveOrganization");

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

const submitSelfOrder = async (req, res, next) => {
  try {
    const { tableId, items, customerDetails } = req.body;
    if (!tableId || !mongoose.Types.ObjectId.isValid(tableId)) {
      return next(createHttpError(400, "Valid tableId is required."));
    }
    if (!Array.isArray(items) || items.length === 0) {
      return next(createHttpError(400, "At least one item is required."));
    }

    const table = await Table.findById(tableId).populate({
      path: "location",
      select: "organization",
    });
    if (!table) {
      return next(createHttpError(404, "Table not found."));
    }
    const organizationId =
      table.organization ||
      table.location?.organization ||
      null;
    if (!organizationId) {
      return next(
        createHttpError(400, "Table has no organization; cannot place order.")
      );
    }

    const orgDoc = await Organization.findById(organizationId)
      .select("timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt")
      .lean();
    if (!orgDoc) {
      return next(
        createHttpError(
          403,
          "Guest ordering is not available for this venue right now."
        )
      );
    }
    try {
      await enforceActiveOrganizationById(organizationId, {
        routeKey: "tenant.public.self-order",
        requestId: req?.requestId || res.locals?.requestId,
        traceparent: req.headers?.traceparent || res.locals?.traceparent,
      });
    } catch {
      return next(
        createHttpError(
          403,
          "Guest ordering is not available for this venue right now."
        )
      );
    }

    const lines = [];
    for (const line of items) {
      if (!line.menuItem || !mongoose.Types.ObjectId.isValid(line.menuItem)) {
        return next(createHttpError(400, "Each item needs a valid menuItem id."));
      }
      lines.push({
        menuItem: line.menuItem,
        quantity: Math.max(1, Number(line.quantity) || 1),
        note: line.note != null ? String(line.note) : "",
        status: "sent",
      });
    }

    if (table.currentOrder) {
      const existing = await Order.findById(table.currentOrder);
      if (!existing) {
        table.currentOrder = null;
        table.status = "available";
        await table.save();
      } else {
        const st = normalizeOrderStatus(existing.orderStatus);
        if (st === "paid" || existing.orderSource !== "self-order") {
          return next(
            createHttpError(
              409,
              "This table is not available for guest ordering right now."
            )
          );
        }
        if (!existing.organization) {
          existing.organization = organizationId;
        }
        const session = await mongoose.startSession();
        let updatedOrderId = String(existing._id);
        try {
          await session.withTransaction(async () => {
            const txOrder = await Order.findOne({
              _id: existing._id,
              organization: organizationId,
            }).session(session);
            if (!txOrder) {
              throw createHttpError(404, "Order not found.");
            }
            for (const line of lines) {
              txOrder.items.push(line);
            }
            await recalcOrderTotals(txOrder);
            await assertOrderLinesFulfillable(txOrder);
            await txOrder.save({ session });
            updatedOrderId = String(txOrder._id);
          });
        } finally {
          await session.endSession();
        }
        const updatedOrder = await Order.findOne({
          _id: updatedOrderId,
          organization: organizationId,
        });
        await processStockAfterItemsPatch(req, updatedOrder);
        emitPos(
          req,
          "order:updated",
          {
            orderId: updatedOrderId,
            tableId: String(table._id),
          },
          {
            organizationId: table.organization,
            ...posSocketOptsFromOrder(updatedOrder),
          }
        );
        return res.status(200).json({
          success: true,
          message: "Added to your table order.",
          data: { orderId: existing._id },
        });
      }
    }

    let createdOrderId = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const txTable = await Table.findById(table._id).session(session);
        if (!txTable) {
          throw createHttpError(404, "Table not found.");
        }
        if (txTable.currentOrder) {
          throw createHttpError(
            409,
            "This table is not available for guest ordering right now."
          );
        }
        const txOrder = new Order({
          organization: organizationId,
          table: txTable._id,
          orderSource: "self-order",
          orderStatus: "in-progress",
          status: "sent",
          customerDetails: {
            name: customerDetails?.name?.trim() || "Guest",
            phone: customerDetails?.phone?.trim() || "-",
            guests: Math.max(1, Number(customerDetails?.guests) || 1),
          },
          items: lines,
          location: txTable.location || null,
        });
        await recalcOrderTotals(txOrder);
        await assertOrderLinesFulfillable(txOrder);
        await txOrder.save({ session });

        txTable.currentOrder = txOrder._id;
        txTable.status = toCanonical("occupied");
        txTable.lastBillPaidAt = null;
        await txTable.save({ session });
        createdOrderId = String(txOrder._id);
      });
    } finally {
      await session.endSession();
    }

    const order = await Order.findOne({
      _id: createdOrderId,
      organization: organizationId,
    });
    const tableAfter = await Table.findById(table._id);

    await processStockAfterStatusPatch(req, order, {
      previousOrderStatus: "pending",
      markAllItemsSent: false,
      idsJustSent: [],
    });

    emitPos(
      req,
      "order:new",
      {
        orderId: String(order._id),
        tableId: String(tableAfter._id),
      },
      {
        organizationId: tableAfter.organization,
        ...posSocketOptsFromOrder(order),
      }
    );
    emitPos(
      req,
      "table:status-changed",
      { tableId: String(tableAfter._id) },
      {
        organizationId: tableAfter.organization,
        ...posSocketOptsFromTable(tableAfter),
      }
    );

    res.status(201).json({
      success: true,
      message: "Order sent to the kitchen.",
      data: { orderId: order._id },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = { submitSelfOrder };
