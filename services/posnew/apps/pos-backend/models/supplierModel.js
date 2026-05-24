const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactName: { type: String, trim: true, default: "" },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IngredientCategory",
      default: null,
      index: true,
    },
    code: { type: String, trim: true, uppercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    defaultLeadTimeDays: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
  },
  { timestamps: true }
);

supplierSchema.plugin(orgScopePlugin);
supplierSchema.index({ organization: 1, name: 1 });
supplierSchema.index({ organization: 1, code: 1 });
supplierSchema.index({ organization: 1, category: 1 });
supplierSchema.index({ name: 1 });
supplierSchema.index({ code: 1 });
supplierSchema.index({ status: 1 });

module.exports = mongoose.model("Supplier", supplierSchema);
