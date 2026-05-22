const mongoose = require("mongoose");

const fxRateSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    /** Rate applies from start of this UTC calendar day through newer rows. */
    effectiveDate: { type: Date, required: true, index: true },
    fromCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    toCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    /** Amount in `toCurrency` = amount in `fromCurrency` × rate */
    rate: { type: Number, required: true, min: 0 },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

fxRateSchema.index({ fromCurrency: 1, toCurrency: 1, effectiveDate: -1 });
fxRateSchema.index({
  organization: 1,
  fromCurrency: 1,
  toCurrency: 1,
  effectiveDate: -1,
});

module.exports = mongoose.model("FxRate", fxRateSchema);
