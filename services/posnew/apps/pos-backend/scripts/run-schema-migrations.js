require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const SchemaMigration = require("../models/schemaMigrationModel");
const registry = require("../migrations/registry");

require("../models/organizationModel");

async function main() {
  await mongoose.connect(config.databaseURI);
  // Drop stale indexes (e.g. legacy `id_1`) that are not on this schema — fixes E11000 dup null `id`.
  await SchemaMigration.syncIndexes();

  for (const m of registry) {
    const done = await SchemaMigration.findOne({ migrationId: m.migrationId });
    if (done) {
      console.log(`skip ${m.migrationId}`);
      continue;
    }
    console.log(`run ${m.migrationId} — ${m.description || ""}`);
    const result = await m.run();
    if (result && result.defer) {
      console.log(
        `defer ${m.migrationId} — not recording; will retry on a later run`
      );
      continue;
    }
    await SchemaMigration.create({ migrationId: m.migrationId });
  }
  console.log("migrations complete");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
