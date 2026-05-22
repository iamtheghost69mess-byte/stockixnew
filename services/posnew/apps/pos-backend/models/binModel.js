const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const binSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    /** Bin function/type */
    binType: {
      type: String,
      enum: ["standard", "cold_storage", "hazardous", "oversize", "high_value"],
      default: "standard",
      index: true,
    },
    /** Physical dimensions for volumetric calculations */
    binDimensions: {
      length: { type: Number, default: 0 },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      unit: { type: String, enum: ["cm", "m", "in", "ft"], default: "cm" },
    },
    /** Priority for picking logic (lower is higher priority) */
    pickPriority: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    capacity: { type: Number, default: null }, // Optional capacity limit
  },
  { timestamps: true }
);

binSchema.plugin(orgScopePlugin);
binSchema.index({ organization: 1, zone: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Bin", binSchema);
