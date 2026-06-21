const mongoose = require("mongoose");

const idempotencyRecordSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    route: { type: String, required: true, trim: true },
    statusCode: { type: Number, default: 201 },
    body: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IdempotencyRecord", idempotencyRecordSchema);
