#!/usr/bin/env node
/**
 * Rich floor-plan dataset for the tenant dashboard (tables with anchors, sections, reservations).
 *
 * Targets **dev-org** / **MAIN** (same as `npm run seed:dev`). Table numbers **9100–9199** are reserved
 * for this seed so it can be re-run idempotently.
 *
 * Usage (from apps/pos-backend):
 *   npm run seed:floor-plan
 *   SEED_ORG_SLUG=my-org npm run seed:floor-plan
 *   npm run seed:floor-plan -- --force   # delete existing 9100–9199 rows first, then insert
 *
 * Refuses production unless ALLOW_DEV_SEED=1 (same guard as seed:dev).
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const config = require("../config/config");
const Organization = require("../models/organizationModel");
const Location = require("../models/locationModel");
const Table = require("../models/tableModel");

const TABLE_NO_MIN = 9100;
const TABLE_NO_MAX = 9199;
const force = process.argv.includes("--force");

function assertNotProduction() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SEED !== "1") {
    console.error(
      "seed:floor-plan refused in production. Set ALLOW_DEV_SEED=1 if you really mean it."
    );
    process.exit(1);
  }
}

/** Layout: named positions on a conceptual floor (0–1 plane, normalized centers). */
const SHOWCASE_ROWS = [
  {
    tableNo: 9101,
    seats: 2,
    section: "Window",
    name: "Showcase: Window 1",
    status: "free",
    floorAnchorX: 0.14,
    floorAnchorY: 0.22,
    pricePerPerson: 0,
  },
  {
    tableNo: 9102,
    seats: 4,
    section: "Window",
    name: "Showcase: Window 2",
    status: "reserved",
    reservatorName: "A. Nonymous",
    reservatorPhone: "+15550100001",
    reservatorIsVip: false,
    personsSeated: 0,
    floorAnchorX: 0.28,
    floorAnchorY: 0.22,
    pricePerPerson: 12.5,
  },
  {
    tableNo: 9103,
    seats: 6,
    section: "Main",
    name: "Showcase: VIP Booth",
    status: "reserved",
    reservatorName: "Jordan Lee",
    reservatorPhone: "+15550100002",
    reservatorIsVip: true,
    personsSeated: 0,
    floorAnchorX: 0.5,
    floorAnchorY: 0.28,
    pricePerPerson: 18,
  },
  {
    tableNo: 9104,
    seats: 4,
    section: "Main",
    name: "Showcase: Center 4",
    status: "occupied",
    personsSeated: 3,
    floorAnchorX: 0.5,
    floorAnchorY: 0.55,
    pricePerPerson: 0,
  },
  {
    tableNo: 9105,
    seats: 2,
    section: "Bar",
    name: "Showcase: Bar high-top",
    status: "free",
    floorAnchorX: 0.78,
    floorAnchorY: 0.24,
    pricePerPerson: 0,
  },
  {
    tableNo: 9106,
    seats: 8,
    section: "Patio",
    name: "Showcase: Patio long",
    status: "free",
    floorAnchorX: 0.72,
    floorAnchorY: 0.62,
    pricePerPerson: 0,
  },
  {
    tableNo: 9107,
    seats: 4,
    section: "Patio",
    name: "Showcase: Auto-layout demo",
    status: "free",
    floorAnchorX: null,
    floorAnchorY: null,
    pricePerPerson: 0,
  },
];

async function main() {
  assertNotProduction();
  const slug = process.env.SEED_ORG_SLUG || "dev-org";

  await mongoose.connect(config.databaseURI);
  const org = await Organization.findOne({ slug });
  if (!org) {
    console.error(`Organization slug="${slug}" not found. Run npm run seed:dev first.`);
    process.exit(1);
  }

  let loc = await Location.findOne({ organization: org._id, code: "MAIN" });
  if (!loc) {
    loc = await Location.findOne({ organization: org._id }).sort({ createdAt: 1 });
  }
  if (!loc) {
    console.error("No location for organization. Run npm run seed:dev first.");
    process.exit(1);
  }

  const existing = await Table.countDocuments({
    organization: org._id,
    tableNo: { $gte: TABLE_NO_MIN, $lte: TABLE_NO_MAX },
  });

  if (existing > 0 && !force) {
    console.log(
      `Skip: ${existing} table(s) already in range ${TABLE_NO_MIN}–${TABLE_NO_MAX}. Use --force to replace.`
    );
    await mongoose.disconnect();
    return;
  }

  if (existing > 0 && force) {
    const del = await Table.deleteMany({
      organization: org._id,
      tableNo: { $gte: TABLE_NO_MIN, $lte: TABLE_NO_MAX },
    });
    console.log(`Removed ${del.deletedCount} existing showcase tables (${TABLE_NO_MIN}–${TABLE_NO_MAX}).`);
  }

  const docs = SHOWCASE_ROWS.map((row) => ({
    organization: org._id,
    location: loc._id,
    tableNo: row.tableNo,
    seats: row.seats,
    section: row.section,
    name: row.name,
    status: row.status,
    pricePerPerson: row.pricePerPerson ?? 0,
    reservatorName: row.reservatorName ?? null,
    reservatorPhone: row.reservatorPhone ?? null,
    reservatorIsVip: Boolean(row.reservatorIsVip),
    personsSeated: row.personsSeated ?? 0,
    floorAnchorX: row.floorAnchorX ?? null,
    floorAnchorY: row.floorAnchorY ?? null,
  }));

  await Table.insertMany(docs);
  console.log(
    `Inserted ${docs.length} floor showcase tables for org "${slug}" at location "${loc.code}" (${loc.name}).`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
