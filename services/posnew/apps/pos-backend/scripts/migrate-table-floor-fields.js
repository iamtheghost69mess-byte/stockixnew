#!/usr/bin/env node
/**
 * Backfills floor-management fields on existing Table documents (Phase 1 schema).
 *
 * Usage (from apps/pos-backend/):
 *   npm run migrate:table-floor-fields
 *
 * Safe to re-run: only fills missing or empty display names and undefined numeric flags.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const Table = require("../models/tableModel");

async function main() {
  await mongoose.connect(config.databaseURI);
  let updated = 0;
  const cursor = Table.find({}).cursor();
  for await (const t of cursor) {
    let changed = false;
    if (t.name == null || !String(t.name).trim()) {
      t.name = `Table ${t.tableNo}`;
      changed = true;
    }
    if (t.pricePerPerson == null || !Number.isFinite(Number(t.pricePerPerson))) {
      t.pricePerPerson = 0;
      changed = true;
    }
    if (t.personsSeated == null || !Number.isFinite(Number(t.personsSeated))) {
      t.personsSeated = 0;
      changed = true;
    }
    if (t.reservatorIsVip == null) {
      t.reservatorIsVip = false;
      changed = true;
    }
    if (changed) {
      await t.save();
      updated += 1;
    }
  }
  console.log(`migrate-table-floor-fields: updated ${updated} table(s).`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
