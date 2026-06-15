const mongoose = require("mongoose");

const schemaMigrationSchema = new mongoose.Schema(
  {
    migrationId: { type: String, required: true, unique: true, trim: true },
    appliedAt: { type: Date, default: Date.now },
  },
  { id: false, timestamps: true }
);

module.exports = mongoose.model("SchemaMigration", schemaMigrationSchema);
