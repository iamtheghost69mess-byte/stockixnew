/**
 * Creates one user per role for local testing (fixed PINs).
 * Safe to re-run: updates PIN if the dev user already exists (matched by name + role).
 *
 * Usage (from pos-backend/):  npm run seed:dev
 *
 * Refuses to run when NODE_ENV=production unless ALLOW_DEV_SEED=1.
 *
 * PINs (document on Auth page in dev — must stay in sync):
 *   admin   1001   Dev Admin
 *   manager 1002   Dev Manager
 *   waiter  1003   Dev Waiter
 *   cashier 1004   Dev Cashier
 *   kitchen 1005   Dev Kitchen
 *   hostess 1006   Dev Hostess
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
const mongoose = require("mongoose");
const config = require("../config/config");
const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const Location = require("../models/locationModel");

const DEV_USERS = [
  { role: "admin", pin: "1001", name: "Dev Admin" },
  { role: "manager", pin: "1002", name: "Dev Manager" },
  { role: "waiter", pin: "1003", name: "Dev Waiter" },
  { role: "cashier", pin: "1004", name: "Dev Cashier" },
  { role: "kitchen", pin: "1005", name: "Dev Kitchen" },
  { role: "hostess", pin: "1006", name: "Dev Hostess" },
];

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEV_SEED !== "1"
  ) {
    console.error(
      "seed:dev refused in production. Set ALLOW_DEV_SEED=1 if you really mean it."
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(config.databaseURI);

    const slug = process.env.SEED_ORG_SLUG || "dev-org";
    let defaultOrg = await Organization.findOne({ slug });
    if (!defaultOrg) {
      defaultOrg = await Organization.create({
        name: slug === "dev-org" ? "Developer Organization" : slug,
        slug: slug,
        lifecycle: "active",
      });
      console.log(`Created Organization: ${slug}`);
    }

    let mainLoc = await Location.findOne({
      organization: defaultOrg._id,
      code: "MAIN",
    });
    if (!mainLoc) {
      mainLoc = await Location.create({
        organization: defaultOrg._id,
        name: "Main",
        code: "MAIN",
      });
      console.log('Created default branch location "Main" (MAIN).');
    }

    for (const row of DEV_USERS) {
      const plain = String(row.pin);
      let u = await User.findOne({
        name: row.name,
        role: row.role,
      }).select("+pin");

      const floorRoles = new Set(["waiter", "cashier", "hostess"]);
      const locForUser = floorRoles.has(row.role) ? mainLoc._id : undefined;

      if (!u) {
        await User.create({
          name: row.name,
          role: row.role,
          pin: plain,
          organization: defaultOrg._id,
          ...(locForUser ? { location: locForUser } : {}),
        });
        console.log(`Created ${row.role}: ${row.name} — PIN ${plain} attached to Org`);
      } else {
        u.pin = plain;
        u.organization = defaultOrg._id;
        if (floorRoles.has(row.role)) {
          u.location = mainLoc._id;
        }
        await u.save();
        console.log(`Updated ${row.role}: ${row.name} — PIN ${plain} attached to Org`);
      }
    }

    console.log("\nDone. Use these PINs on the login screen (PIN tab).");
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
