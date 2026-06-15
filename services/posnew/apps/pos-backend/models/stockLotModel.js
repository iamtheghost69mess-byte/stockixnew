const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

/** Per-location lot/batch quantities for FEFO and expiry (parallel to StockBalance.quantity). */
const stockLotSchema = new mongoose.Schema(
  {
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    lotNumber: { type: String, trim: true, default: "" },
    /** Authoritative receive timestamp used by FIFO lot consumption order. */
    receivedAt: { type: Date, required: true, default: Date.now, index: true },
    expiryDate: { type: Date, default: null },
    productionDate: { type: Date, default: null },
    supplierBatchRef: { type: String, trim: true, default: "" },
    quantity: { type: Number, required: true, min: 0 },
    /** Quantity initially received/created for this lot row. */
    originalQuantity: { type: Number, required: true, min: 0, default: 0 },
    /** Unit cost captured at lot receipt/opening/adjustment time. */
    unitCost: { type: Number, required: true, min: 0, default: 0 },
    source: {
      type: String,
      enum: ["purchase", "manual", "opening_stock", "adjustment"],
      default: "purchase",
      index: true,
    },
    /** Set for opening/manual seeded inventory not backed by purchase receipts. */
    isUnverifiedFifoHistory: { type: Boolean, default: false, index: true },
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      default: null,
      index: true,
    },
    bin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bin",
      default: null,
      index: true,
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      default: null,
    },
  },
  { timestamps: true }
);

stockLotSchema.plugin(orgScopePlugin);
stockLotSchema.index({
  organization: 1,
  location: 1,
  ingredient: 1,
  receivedAt: 1,
});
stockLotSchema.index({
  organization: 1,
  location: 1,
  ingredient: 1,
  expiryDate: 1,
  receivedAt: 1,
});
stockLotSchema.index(
  { organization: 1, location: 1, ingredient: 1, lotNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { lotNumber: { $exists: true, $nin: ["", null] } },
  }
);
stockLotSchema.index({ organization: 1, expiryDate: 1, quantity: 1 });

module.exports = mongoose.model("StockLot", stockLotSchema);
