const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const SERIAL_STATUSES = ["in_stock", "sold", "waste", "transferred", "returned", "reserved"];

const stockUnitSerialSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    serialNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    currentLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    currentBin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bin",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: SERIAL_STATUSES,
      default: "in_stock",
      index: true,
    },
    /** Reference to the movement that created this unit entry (usually 'receive' or 'manual_adjust') */
    initialMovement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockMovement",
      default: null,
    },
    /** Reference to the movement that last updated this unit (e.g. 'order_deduction') */
    lastMovement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockMovement",
      default: null,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

stockUnitSerialSchema.plugin(orgScopePlugin);

// Unique serial per ingredient within an organization
stockUnitSerialSchema.index({ organization: 1, ingredient: 1, serialNumber: 1 }, { unique: true });

module.exports = mongoose.model("StockUnitSerial", stockUnitSerialSchema);
module.exports.SERIAL_STATUSES = SERIAL_STATUSES;
