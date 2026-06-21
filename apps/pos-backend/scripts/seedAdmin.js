/**
 * One-time bootstrap: creates the first admin when none exist.
 * Usage (from pos-backend/): BOOTSTRAP_ADMIN_PIN=1234 npm run seed:admin
 * Optional: BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PHONE
 * Phase 1 / phases.md: optional BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD (8+ chars)
 * for email login in addition to PIN.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const config = require("../config/config");
const User = require("../models/userModel");

async function main() {
  const pin = process.env.BOOTSTRAP_ADMIN_PIN;
  if (!pin || !/^\d{4,6}$/.test(String(pin))) {
    console.error(
      "Set BOOTSTRAP_ADMIN_PIN in .env to a 4–6 digit PIN, then run again."
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(config.databaseURI);

    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount > 0) {
      console.log("Seed skipped: at least one admin user already exists.");
      await mongoose.disconnect();
      process.exit(0);
    }

    const name = process.env.BOOTSTRAP_ADMIN_NAME || "Admin";
    const phone = process.env.BOOTSTRAP_ADMIN_PHONE
      ? String(process.env.BOOTSTRAP_ADMIN_PHONE).trim()
      : undefined;
    const emailEnv = process.env.BOOTSTRAP_ADMIN_EMAIL
      ? String(process.env.BOOTSTRAP_ADMIN_EMAIL).trim().toLowerCase()
      : undefined;
    const passwordEnv = process.env.BOOTSTRAP_ADMIN_PASSWORD
      ? String(process.env.BOOTSTRAP_ADMIN_PASSWORD)
      : undefined;

    const doc = {
      name,
      role: "admin",
      pin: String(pin),
      phone,
    };

    if (emailEnv) {
      if (!passwordEnv || passwordEnv.length < 8) {
        console.error(
          "BOOTSTRAP_ADMIN_EMAIL is set; set BOOTSTRAP_ADMIN_PASSWORD (8+ characters) as well."
        );
        process.exit(1);
      }
      doc.email = emailEnv;
      doc.passwordHash = await bcrypt.hash(passwordEnv, 10);
    }

    await User.create(doc);

    console.log(
      `Created admin user "${name}". Log in with PIN (BOOTSTRAP_ADMIN_PIN)${
        emailEnv ? " or email/password (BOOTSTRAP_ADMIN_EMAIL)" : ""
      }.`
    );
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
