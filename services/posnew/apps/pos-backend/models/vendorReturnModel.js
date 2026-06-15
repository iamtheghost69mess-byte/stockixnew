const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const RETURN_STATUSES = ["draft", "confirmed", "shipped", "completed", "cancelled"];
const QUALITY_GRADES = [
  "damaged",
  "expired",
  "wrong_item",
  "short_shipped",
  "other",
];

const vendorReturnLineSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, default: "" },
    /**
     * RTV quality disposition for supplier claims + warehouse triage.
     * Enum defined in `QUALITY_GRADES`. Defaults to `other` for legacy rows.
     */
    qualityGrade: {
      type: String,
      enum: QUALITY_GRADES,
      default: "other",
    },
  },
  { _id: true }
);

const vendorReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, index: true },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    vendorBill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorBill",
      default: null,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: RETURN_STATUSES,
      default: "draft",
      index: true,
    },
    returnDate: { type: Date, required: true, default: Date.now },
    notes: { type: String, trim: true, default: "" },
    lines: { type: [vendorReturnLineSchema], default: [] },
    /** Reference to the Credit Note issued by the vendor for this return */
    vendorCreditNoteRef: { type: String, trim: true, default: "" },
    /** Financial linkage to accounting */
    journalEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

vendorReturnSchema.plugin(orgScopePlugin);
vendorReturnSchema.index({ organization: 1, returnNumber: 1 }, { unique: true });

module.exports = mongoose.model("VendorReturn", vendorReturnSchema);
module.exports.RETURN_STATUSES = RETURN_STATUSES;
module.exports.QUALITY_GRADES = QUALITY_GRADES;
