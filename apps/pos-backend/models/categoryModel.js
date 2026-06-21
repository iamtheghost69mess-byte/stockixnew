const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 1, min: 1 },
    color: { type: String, default: "#525252", trim: true },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    printerAssignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Printer",
      default: null,
    },
    availableFrom: { type: String, trim: true },
    availableTo: { type: String, trim: true },
    /** Optional guest-facing note shown under the category title on public menu. */
    menuNote: { type: String, default: "", trim: true },
    /** Optional GL revenue account for items in this category */
    revenueAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
  },
  { timestamps: true }
);

categorySchema.index({ organization: 1, name: 1 });
categorySchema.index({ organization: 1, sortOrder: 1, name: 1 });
categorySchema.index({ name: 1 });

module.exports = mongoose.model("Category", categorySchema);
