const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const TAKE_STATUSES = ["draft", "in_progress", "awaiting_approval", "posted", "cancelled"];

const stockTakeLineSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
    },
    /** Physical bin location being counted (for granular warehousing) */
    bin: { type: mongoose.Schema.Types.ObjectId, ref: "Bin", default: null },
    systemQty: { type: Number, required: true, min: 0 },
    countedQty: { type: Number, default: null, min: 0 },
    /** Calculated: countedQty - systemQty */
    varianceQty: { type: Number, default: 0 },
    /** Financial impact based on avg cost: varianceQty * unitCost */
    varianceValue: { type: Number, default: 0 },
  },
  { _id: true }
);

const stockTakeSessionSchema = new mongoose.Schema(
  {
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: TAKE_STATUSES,
      default: "draft",
      index: true,
    },
    /** If true, counters should not see the expected systemQty (blind audit) */
    blindCount: { type: Boolean, default: false },
    /** Strategy: 'full' inventory, 'cycle' (rotating), or 'spot' check */
    countMethod: {
      type: String,
      enum: ["full", "cycle", "spot"],
      default: "full",
      index: true,
    },
    note: { type: String, trim: true, default: "" },
    lines: { type: [stockTakeLineSchema], default: [] },
    postedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** GL journal posted for net variance (optional). */
    journalEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
  },
  { timestamps: true }
);

stockTakeSessionSchema.plugin(orgScopePlugin);
stockTakeSessionSchema.index({ organization: 1, location: 1, status: 1 });

module.exports = mongoose.model("StockTakeSession", stockTakeSessionSchema);
module.exports.TAKE_STATUSES = TAKE_STATUSES;
