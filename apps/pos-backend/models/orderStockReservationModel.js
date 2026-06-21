const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

/**
 * Tracks soft reservations for open order lines (pending / not yet deducted).
 * StockBalance.reservedQty is the aggregate; this collection is the source of truth per line.
 */
const orderStockReservationSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderLineId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    quantity: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

orderStockReservationSchema.plugin(orgScopePlugin);
orderStockReservationSchema.index(
  { organization: 1, order: 1, orderLineId: 1, ingredient: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);
orderStockReservationSchema.index(
  { order: 1, orderLineId: 1, ingredient: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);

module.exports = mongoose.model(
  "OrderStockReservation",
  orderStockReservationSchema
);
