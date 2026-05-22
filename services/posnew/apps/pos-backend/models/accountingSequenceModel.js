const mongoose = require("mongoose");

/**
 * Atomic counters for journal entry numbers and POS session numbers.
 */
const accountingSequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("AccountingSequence", accountingSequenceSchema);
