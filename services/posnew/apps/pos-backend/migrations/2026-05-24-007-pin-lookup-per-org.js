/**
 * Scope PIN uniqueness to organization + pinLookup (drop legacy global pinLookup index).
 * Existing pinLookup values are unchanged; only the index definition changes.
 */
module.exports = {
  migrationId: "2026-05-24-007-pin-lookup-per-org",
  description:
    "Drop global User.pinLookup unique index; add compound unique index on organization + pinLookup.",
  async run() {
    const User = require("../models/userModel");
    const collection = User.collection;
    const indexes = await collection.indexes();
    for (const idx of indexes) {
      const keys = idx.key || {};
      if (keys.pinLookup === 1 && keys.organization == null) {
        await collection.dropIndex(idx.name);
        // eslint-disable-next-line no-console
        console.info(`dropped legacy index ${idx.name}`);
      }
    }
    await User.syncIndexes();
  },
};
