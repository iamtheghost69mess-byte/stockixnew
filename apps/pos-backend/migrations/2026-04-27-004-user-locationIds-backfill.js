/**
 * Idempotent merge of legacy `User.location` into `User.locations` for multi-branch staff.
 * Prefer `npm run migrate:users-multi-branch` for ad-hoc runs; this ties the same logic into `migrate:schema`.
 */
module.exports = {
  migrationId: "2026-04-27-004-user-locationIds-backfill",
  description: "Merge legacy User.location into locations[] for multi-branch assignment.",
  async run() {
    const User = require("../models/userModel");
    const cursor = User.find({}).select("_id locations location").cursor();
    let updated = 0;
    for await (const user of cursor) {
      const assigned = [
        ...(Array.isArray(user.locations) ? user.locations.map((value) => String(value || "")) : []),
        ...(user.location ? [String(user.location)] : []),
      ].filter(Boolean);
      const deduped = [...new Set(assigned)];
      const prevLen = Array.isArray(user.locations) ? user.locations.length : 0;
      const shouldUpdate =
        deduped.length !== prevLen || (!user.location && deduped.length > 0);
      if (!shouldUpdate) continue;
      user.locations = deduped;
      if (!user.location && deduped.length > 0) {
        user.location = deduped[0];
      }
      await user.save();
      updated += 1;
    }
    return { updated };
  },
};
