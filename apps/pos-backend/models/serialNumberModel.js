const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const SERIAL_STATUSES = ["available", "consumed", "transferred", "expired"];

const serialNumberSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    serial: { type: String, required: true, trim: true, index: true },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: SERIAL_STATUSES,
      default: "available",
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    bin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bin",
      default: null,
      index: true,
    },
    stockLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockLot",
      default: null,
    },
    lastMovement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockMovement",
      default: null,
    },
  },
  { timestamps: true }
);

serialNumberSchema.plugin(orgScopePlugin);
serialNumberSchema.index({ organization: 1, serial: 1 }, { unique: true });

module.exports = mongoose.model("SerialNumber", serialNumberSchema);
module.exports.SERIAL_STATUSES = SERIAL_STATUSES;
