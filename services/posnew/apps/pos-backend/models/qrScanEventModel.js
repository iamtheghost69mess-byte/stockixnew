const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

/**
 * One row per (organization, visitorKey, visitDayUtc) — deduped public menu opens.
 * `visitDayUtc` is calendar day in UTC (YYYY-MM-DD). Counts require `X-Visitor-Key` on the client.
 */
const qrScanEventSchema = new mongoose.Schema(
  {
    /** Table id string, or `org:<slug>` for venue-wide menu links. */
    qrCodeId: { type: String, required: true, trim: true, index: true },
    sessionId: { type: String, trim: true, default: "" },
    /** Stable id from `X-Visitor-Key` (UUID). */
    visitorKey: { type: String, required: true, trim: true },
    scannedAt: { type: Date, required: true, default: Date.now, index: true },
    /** UTC calendar day for dedupe: YYYY-MM-DD */
    visitDayUtc: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    /** Branch when known (table location or `location` query on org menu). */
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

qrScanEventSchema.plugin(orgScopePlugin);

qrScanEventSchema.index(
  { organization: 1, visitorKey: 1, visitDayUtc: 1 },
  { unique: true }
);
qrScanEventSchema.index({ organization: 1, scannedAt: 1 });
qrScanEventSchema.index({ organization: 1, location: 1, scannedAt: 1 });

module.exports = mongoose.model("QrScanEvent", qrScanEventSchema);
