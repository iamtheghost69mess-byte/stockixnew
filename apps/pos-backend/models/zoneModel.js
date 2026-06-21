const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const zoneSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    /** Zone purpose for operational routing */
    zoneType: {
      type: String,
      enum: ["receiving", "picking", "bulk", "shipping", "staging", "qc"],
      default: "bulk",
      index: true,
    },
    /** For nested zone hierarchies (Aisles -> Racks) */
    parentZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      default: null,
    },
    status: { type: String, enum: ["active", "archived"], default: "active" },
  },
  { timestamps: true }
);

zoneSchema.plugin(orgScopePlugin);
zoneSchema.index({ organization: 1, location: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Zone", zoneSchema);
