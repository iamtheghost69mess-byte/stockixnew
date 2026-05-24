/* eslint-disable no-console */
const mongoose = require("mongoose");
const User = require("../models/userModel");

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGO_URI/MONGODB_URI.");
  }
  await mongoose.connect(uri);
  const cursor = User.find({}).cursor();
  let scanned = 0;
  let updated = 0;
  for await (const user of cursor) {
    scanned += 1;
    const assigned = [
      ...(Array.isArray(user.locations) ? user.locations.map((value) => String(value || "")) : []),
      ...(user.location ? [String(user.location)] : []),
    ].filter(Boolean);
    const deduped = [...new Set(assigned)];
    const shouldUpdate =
      deduped.length !== (Array.isArray(user.locations) ? user.locations.length : 0) ||
      (!user.location && deduped.length > 0);
    if (!shouldUpdate) continue;
    user.locations = deduped;
    if (!user.location && deduped.length > 0) {
      user.location = deduped[0];
    }
    await user.save();
    updated += 1;
  }
  console.log(`Migration complete. scanned=${scanned} updated=${updated}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
