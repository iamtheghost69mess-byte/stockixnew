const mongoose = require("mongoose");

const REPORT_FREQUENCIES = ["daily", "weekly", "monthly"];
const REPORT_TYPES = [
  "daily-sales-summary",
  "sales-by-category",
  "sales-by-item",
  "sales-by-waiter",
  "void-report",
  "discount-report",
  "stock-levels",
  "wastage-report",
  "profit-loss",
  "expense-breakdown",
  "vat-report",
  "branch-comparison",
];

const reportScheduleSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null, index: true },
    name: { type: String, required: true, trim: true },
    reportType: { type: String, enum: REPORT_TYPES, required: true },
    frequency: { type: String, enum: REPORT_FREQUENCIES, required: true },
    recipients: { type: [String], default: [] },
    webhookUrl: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    nextRunAt: { type: Date, required: true, index: true },
    lastRunAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReportSchedule", reportScheduleSchema);
module.exports.REPORT_FREQUENCIES = REPORT_FREQUENCIES;
module.exports.REPORT_TYPES = REPORT_TYPES;
