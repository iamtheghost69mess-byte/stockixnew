const mongoose = require("mongoose");

const productEventDailyRollupSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    /** UTC calendar day YYYY-MM-DD */
    dayUtc: { type: String, required: true, trim: true, index: true },
    /** eventType → count */
    countsByType: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

productEventDailyRollupSchema.index(
  { organization: 1, dayUtc: 1 },
  { unique: true }
);

module.exports = mongoose.model("ProductEventDailyRollup", productEventDailyRollupSchema);
